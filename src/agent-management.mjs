import { OfficeError, insist, digest } from './domain.mjs';

export const MANAGEMENT_PROTOCOL_VERSION = 1;
export const MANAGEMENT_CAPABILITIES = Object.freeze([
  'agent.register',
  'agent.create',
  'agent.config.read',
  'agent.config.write',
  'agent.lifecycle.start',
  'agent.lifecycle.pause',
  'agent.lifecycle.resume',
  'agent.lifecycle.stop',
  'agent.lifecycle.disconnect',
  'agent.lifecycle.retire',
]);

const capabilities = new Set(MANAGEMENT_CAPABILITIES);
const mutations = new Set(MANAGEMENT_CAPABILITIES.filter(capability => capability !== 'agent.config.read'));
const creates = new Set(['agent.register', 'agent.create']);
const idPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const operationPattern = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;

function exact(value, keys, code = 'ADAPTER_CONTRACT') {
  insist(value && typeof value === 'object' && !Array.isArray(value), code, 'Contrato de adaptador no válido.');
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(key => keys.includes(key)), code, 'Contrato de adaptador no válido.');
}

function jsonObject(value) {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'PAYLOAD', 'La operación requiere un objeto de datos.');
  let text;
  try { text = JSON.stringify(value); } catch { throw new OfficeError('PAYLOAD', 'Datos de operación no válidos.'); }
  insist(text !== undefined && Buffer.byteLength(text) <= 8192, 'PAYLOAD', 'Datos de operación no válidos o demasiado grandes.');
  const clone = JSON.parse(text);
  insist(clone && typeof clone === 'object' && !Array.isArray(clone), 'PAYLOAD', 'Datos de operación no válidos.');
  return clone;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return digest(JSON.stringify(canonical(value)));
}

export function validateManagementManifest(raw) {
  exact(raw, ['adapter_id', 'protocol_version', 'owner_id', 'capabilities']);
  insist(typeof raw.adapter_id === 'string' && idPattern.test(raw.adapter_id), 'ADAPTER_CONTRACT', 'Identidad de adaptador no válida.');
  insist(raw.protocol_version === MANAGEMENT_PROTOCOL_VERSION, 'VERSION', 'Versión de gestión de agentes no admitida.');
  insist(typeof raw.owner_id === 'string' && idPattern.test(raw.owner_id), 'ADAPTER_CONTRACT', 'Propietario de adaptador no válido.');
  insist(Array.isArray(raw.capabilities) && raw.capabilities.length <= MANAGEMENT_CAPABILITIES.length, 'ADAPTER_CONTRACT', 'Capacidades no válidas.');
  insist(new Set(raw.capabilities).size === raw.capabilities.length, 'ADAPTER_CONTRACT', 'Capacidades duplicadas.');
  insist(raw.capabilities.every(capability => typeof capability === 'string' && capabilities.has(capability)), 'ADAPTER_CONTRACT', 'Capacidad no reconocida.');
  return structuredClone(raw);
}

function validateSnapshot(raw, agentId, ownerId, allowNull = true) {
  if (raw === null && allowNull) return null;
  exact(raw, ['agent_id', 'owner_id', 'version']);
  insist(raw.agent_id === agentId && raw.owner_id === ownerId, 'ADAPTER_CONTRACT', 'El adaptador devolvió otra identidad.');
  insist(Number.isSafeInteger(raw.version) && raw.version >= 0, 'ADAPTER_CONTRACT', 'Versión efectiva no válida.');
  return structuredClone(raw);
}

function validateOutcome(raw) {
  exact(raw, raw?.outcome === 'rejected' ? ['outcome', 'code'] : ['outcome']);
  insist(['applied', 'rejected'].includes(raw.outcome), 'ADAPTER_CONTRACT', 'Resultado de adaptador no válido.');
  if (raw.outcome === 'rejected') {
    insist(typeof raw.code === 'string' && /^[A-Z][A-Z0-9_]{1,47}$/.test(raw.code), 'ADAPTER_CONTRACT', 'Código de rechazo no válido.');
  }
  return structuredClone(raw);
}

function resultFor(meta, status, effectiveVersion = null, code = undefined) {
  const result = {
    operation_id: meta.operation_id,
    agent_id: meta.agent_id,
    capability: meta.capability,
    status,
    before_version: meta.before_version,
    effective_version: effectiveVersion,
  };
  if (code) result.code = code;
  return result;
}

function appliedEvidence(meta, current) {
  if (creates.has(meta.capability)) return current !== null && current.version >= 1;
  if (meta.capability === 'agent.lifecycle.retire') return current === null || current.version > meta.before_version;
  return current !== null && current.version > meta.before_version;
}

function unchangedEvidence(meta, current) {
  if (creates.has(meta.capability)) return current === null;
  if (meta.capability === 'agent.lifecycle.retire') return current !== null && current.version === meta.before_version;
  return current !== null && current.version === meta.before_version;
}

export function createAgentManagementGateway(adapter) {
  insist(adapter && typeof adapter === 'object' && typeof adapter.manifest === 'function' &&
    typeof adapter.read === 'function' && typeof adapter.apply === 'function',
  'ADAPTER_CONTRACT', 'Adaptador de gestión incompleto.');

  const manifest = validateManagementManifest(adapter.manifest());
  const supported = new Set(manifest.capabilities);
  const records = new Map();
  // Un escritor por gateway, incluida la reconciliación: la lectura de versión,
  // el efecto y su recibo forman una única operación frente a llamadas locales.
  let pending = Promise.resolve();
  function serialize(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  async function read(agentId) {
    let raw;
    try { raw = await adapter.read(agentId); }
    catch { throw new OfficeError('ADAPTER_UNAVAILABLE', 'No se puede leer el estado efectivo del agente.', 503); }
    return validateSnapshot(raw, agentId, manifest.owner_id);
  }

  async function execute(rawRequest) {
    exact(rawRequest, ['operation_id', 'actor_owner_id', 'agent_id', 'capability', 'expected_version', 'input'], 'OPERATION');
    insist(typeof rawRequest.operation_id === 'string' && operationPattern.test(rawRequest.operation_id), 'OPERATION', 'Identificador de operación no válido.');
    insist(typeof rawRequest.actor_owner_id === 'string' && idPattern.test(rawRequest.actor_owner_id), 'OPERATION', 'Actor no válido.');
    insist(typeof rawRequest.agent_id === 'string' && idPattern.test(rawRequest.agent_id), 'OPERATION', 'Agente no válido.');
    insist(typeof rawRequest.capability === 'string' && capabilities.has(rawRequest.capability) && mutations.has(rawRequest.capability), 'OPERATION', 'Operación de gestión no válida.');
    insist(rawRequest.expected_version === null || (Number.isSafeInteger(rawRequest.expected_version) && rawRequest.expected_version >= 0), 'OPERATION', 'Versión esperada no válida.');
    const input = jsonObject(rawRequest.input);
    const normalized = { ...rawRequest, input };
    const requestFingerprint = fingerprint(normalized);
    rawRequest = normalized;

    return serialize(async () => {
      const existing = records.get(rawRequest.operation_id);
      if (existing) {
        insist(existing.fingerprint === requestFingerprint, 'IDEMPOTENCY_CONFLICT', 'El identificador de operación ya corresponde a otra petición.', 409);
        return structuredClone(existing.result);
      }

      insist(records.size < 1000, 'RATE_LIMIT', 'Demasiadas operaciones de gestión en memoria.', 429);
      insist(rawRequest.actor_owner_id === manifest.owner_id, 'FORBIDDEN', 'El propietario no autoriza esta operación.', 403);
      insist(supported.has(rawRequest.capability), 'UNSUPPORTED_CAPABILITY', 'El adaptador no declara esta capacidad.', 409);

      const before = await read(rawRequest.agent_id);
      if (creates.has(rawRequest.capability)) {
        insist(before === null && rawRequest.expected_version === null, 'VERSION_CONFLICT', 'El agente ya existe o la versión esperada no corresponde.', 409);
      } else {
        insist(before !== null && rawRequest.expected_version === before.version, 'VERSION_CONFLICT', 'La versión efectiva ha cambiado.', 409);
      }

      const meta = {
        operation_id: rawRequest.operation_id,
        agent_id: rawRequest.agent_id,
        capability: rawRequest.capability,
        before_version: before?.version ?? null,
      };

      let outcome;
      try {
        outcome = validateOutcome(await adapter.apply({
          operation_id: rawRequest.operation_id,
          agent_id: rawRequest.agent_id,
          capability: rawRequest.capability,
          expected_version: rawRequest.expected_version,
          input,
        }));
      } catch {
        const result = resultFor(meta, 'unknown', null, 'ADAPTER_FAILURE');
        records.set(rawRequest.operation_id, { fingerprint: requestFingerprint, meta, result });
        return structuredClone(result);
      }

      let after;
      try { after = await read(rawRequest.agent_id); }
      catch {
        const result = resultFor(meta, 'unknown', null, 'READBACK_UNAVAILABLE');
        records.set(rawRequest.operation_id, { fingerprint: requestFingerprint, meta, result });
        return structuredClone(result);
      }

      let result;
      if (outcome.outcome === 'rejected') {
        result = unchangedEvidence(meta, after)
          ? resultFor(meta, 'rejected', after?.version ?? null, outcome.code)
          : resultFor(meta, 'unknown', after?.version ?? null, 'READBACK_MISMATCH');
      } else {
        result = appliedEvidence(meta, after)
          ? resultFor(meta, 'applied', after?.version ?? null)
          : resultFor(meta, 'unknown', after?.version ?? null, 'READBACK_MISMATCH');
      }
      records.set(rawRequest.operation_id, { fingerprint: requestFingerprint, meta, result });
      return structuredClone(result);
    });
  }

  async function reconcile(operationId) {
    insist(typeof operationId === 'string' && operationPattern.test(operationId), 'OPERATION', 'Identificador de operación no válido.');
    const record = records.get(operationId);
    insist(record, 'NOT_FOUND', 'Operación de gestión no conocida.', 404);
    if (record.result.status !== 'unknown') return structuredClone(record.result);

    let current;
    try { current = await read(record.meta.agent_id); }
    catch { return structuredClone(record.result); }

    if (appliedEvidence(record.meta, current)) {
      record.result = resultFor(record.meta, 'applied', current?.version ?? null);
    } else if (unchangedEvidence(record.meta, current)) {
      record.result = resultFor(record.meta, 'failed', current?.version ?? null, 'NOT_APPLIED');
    }
    return structuredClone(record.result);
  }

  return {
    manifest: () => structuredClone(manifest),
    execute,
    reconcile: operationId => serialize(() => reconcile(operationId)),
  };
}
