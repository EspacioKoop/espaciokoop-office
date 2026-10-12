// Núcleo puro del contrato documental de reservas (#18): CLAIM / PR_READY / RELEASE.
// No lee GitHub ni persiste nada; opera sobre eventos ya extraídos de los comentarios
// del registro para poder probar unicidad, expiración, concurrencia e idempotencia
// sin red ni credenciales. Las Normas Platino siguen siendo la fuente humana (#18);
// este módulo solo verifica mecánicamente lo que ya está escrito ahí.
import { clean, insist, digest } from './domain.mjs';

export const CLAIM_REGISTRY_PROTOCOL_VERSION = 1;
export const DEFAULT_LEASE_HOURS = 24;
const MAX_LEASE_HOURS = 168;
const EVENT_TYPES = new Set(['CLAIM', 'PR_READY', 'RELEASE']);
const EVENT_KEYS = ['id', 'at', 'type', 'issue', 'agent', 'branch', 'files', 'goal', 'lease_hours', 'reason'];
const branchPattern = /^[a-z0-9][a-z0-9/_.-]{0,119}$/i;

function exact(value, keys, code = 'CLAIM_EVENT', message = 'Evento de reserva no válido.') {
  insist(value && typeof value === 'object' && !Array.isArray(value), code, message);
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(key => keys.includes(key)), code, message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
const fingerprint = value => digest(JSON.stringify(canonical(value)));

function timestamp(value) {
  insist(typeof value === 'string' && value.length <= 40, 'CLAIM_EVENT', 'Fecha de evento no válida.');
  const parsed = Date.parse(value);
  insist(Number.isFinite(parsed), 'CLAIM_EVENT', 'Fecha de evento no válida.');
  return parsed;
}

function fileList(value, { required }) {
  insist(Array.isArray(value), 'CLAIM_EVENT', 'Lista de archivos no válida.');
  if (!required) {
    insist(value.length === 0, 'CLAIM_EVENT', 'Este evento no declara archivos.');
    return [];
  }
  insist(value.length > 0 && value.length <= 20, 'CLAIM_EVENT', 'Un CLAIM debe declarar entre 1 y 20 archivos.');
  const cleaned = value.map(entry => {
    insist(typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 240,
      'CLAIM_EVENT', 'Ruta de archivo no válida.');
    // Reject aliases which could defeat the shared reservation of the same Git path.
    // Paths are repository-relative POSIX names; no filesystem operations occur here.
    const segments = entry.split('/');
    insist(entry === entry.trim() && !entry.includes('\\\\') &&
      !/[\\x00-\\x1f\\x7f]/.test(entry) &&
      segments.every(part => part.length > 0 && part !== '.' && part !== '..'),
      'CLAIM_EVENT', 'Ruta no canónica en CLAIM.');
    return entry;
  });
  insist(new Set(cleaned).size === cleaned.length, 'CLAIM_EVENT', 'Archivos duplicados en el mismo evento.');
  return cleaned;
}

/**
 * Valida la forma de un evento ya extraído de un comentario del registro #18.
 * `id` es el id de comentario de GitHub (desempate); `at` su fecha de creación.
 */
export function validateClaimEvent(raw) {
  exact(raw, EVENT_KEYS);
  insist(Number.isSafeInteger(raw.id) && raw.id > 0, 'CLAIM_EVENT', 'Id de comentario no válido.');
  const at = timestamp(raw.at);
  insist(EVENT_TYPES.has(raw.type), 'CLAIM_EVENT', 'Tipo de evento no reconocido.');
  insist(Number.isSafeInteger(raw.issue) && raw.issue > 0, 'CLAIM_EVENT', 'Issue no válido.');
  insist(typeof raw.agent === 'string' && raw.agent.trim().length > 0 && raw.agent.length <= 80, 'CLAIM_EVENT', 'Agente no válido.');
  insist(typeof raw.branch === 'string' && branchPattern.test(raw.branch), 'CLAIM_EVENT', 'Rama no válida.');

  const isClaim = raw.type === 'CLAIM';
  const files = fileList(raw.files, { required: isClaim });
  insist(isClaim ? (typeof raw.goal === 'string' && raw.goal.trim().length > 0 && raw.goal.length <= 400) : raw.goal === null,
    'CLAIM_EVENT', 'Objetivo de CLAIM no válido.');
  if (isClaim) {
    insist(raw.lease_hours === null || (Number.isFinite(raw.lease_hours) && raw.lease_hours > 0 && raw.lease_hours <= MAX_LEASE_HOURS),
      'CLAIM_EVENT', 'Duración de reserva no válida.');
  } else {
    insist(raw.lease_hours === null, 'CLAIM_EVENT', 'Solo un CLAIM declara duración de reserva.');
  }
  // RELEASE admite reason=null (el silencio no libera nada por sí solo; el campo es opcional).
  insist(raw.reason === null || (typeof raw.reason === 'string' && raw.reason.length <= 240), 'CLAIM_EVENT', 'Motivo no válido.');

  return {
    id: raw.id,
    at,
    atIso: new Date(at).toISOString(),
    type: raw.type,
    issue: raw.issue,
    agent: clean(raw.agent, 80),
    branch: raw.branch,
    files,
    goal: isClaim ? clean(raw.goal, 400) : null,
    leaseHours: isClaim ? (raw.lease_hours ?? DEFAULT_LEASE_HOURS) : null,
    reason: raw.reason === null ? null : clean(raw.reason, 240),
  };
}

function filesOverlap(a, b) {
  const set = new Set(a);
  return b.some(file => set.has(file));
}

function isExpired(claim, atMillis) {
  return atMillis - claim.lastActivityAt > claim.leaseHours * 3600 * 1000;
}

function publicClaim(claim) {
  return {
    branch: claim.branch,
    issue: claim.issue,
    agent: claim.agent,
    files: [...claim.files],
    goal: claim.goal,
    leaseHours: claim.leaseHours,
    createdAt: new Date(claim.createdAt).toISOString(),
    createdId: claim.createdId,
    lastActivityAt: new Date(claim.lastActivityAt).toISOString(),
    lastActivityId: claim.lastActivityId,
    prReady: claim.prReady,
    released: claim.released,
    releasedAt: claim.releasedAt !== null ? new Date(claim.releasedAt).toISOString() : null,
    releaseReason: claim.releaseReason,
  };
}

/**
 * Reproduce el registro #18 sobre una lista de eventos y devuelve el estado
 * resultante tal y como lo exigen las Normas Platino: orden canónico por fecha
 * y, en empate, por id de comentario (desempate de concurrencia); idempotencia
 * por id de evento; unicidad de archivos entre reservas activas distintas;
 * expiración por inactividad verificable.
 */
export function buildClaimRegistry(rawEvents, { now } = {}) {
  insist(Array.isArray(rawEvents) && rawEvents.length <= 5000, 'CLAIM_REGISTRY', 'Lista de eventos no válida.');
  const validated = rawEvents.map(validateClaimEvent);

  const byId = new Map();
  for (const event of validated) {
    const print = fingerprint(event);
    const existing = byId.get(event.id);
    if (existing) {
      insist(existing.print === print, 'IDEMPOTENCY_CONFLICT', `El id de evento ${event.id} ya corresponde a otro evento.`);
      continue; // reenvío idéntico del mismo evento: no-op
    }
    byId.set(event.id, { event, print });
  }

  // Orden canónico: fecha de GitHub y, en empate, id de comentario ascendente.
  // Aplicar los eventos en este orden, sea el que sea el orden de llegada o de
  // red, es lo que hace determinista la resolución de reservas concurrentes.
  const ordered = [...byId.values()].map(entry => entry.event)
    .sort((a, b) => (a.at - b.at) || (a.id - b.id));

  const nowMillis = now === undefined ? (ordered.at(-1)?.at ?? Date.now()) : timestamp(now);
  const claims = new Map(); // branch -> claim
  const conflicts = [];
  const rejected = [];

  const activeOthersOverlap = (branch, files, atMillis) => {
    for (const [otherBranch, claim] of claims) {
      if (otherBranch === branch) continue;
      if (claim.released || isExpired(claim, atMillis)) continue;
      if (filesOverlap(claim.files, files)) return claim;
    }
    return null;
  };

  for (const event of ordered) {
    if (event.type === 'CLAIM') {
      const existing = claims.get(event.branch);
      const liveExisting = existing && !existing.released && !isExpired(existing, event.at) ? existing : null;
      if (liveExisting && liveExisting.agent !== event.agent) {
        conflicts.push({ kind: 'BRANCH_OWNED_BY_OTHER', event, holder: publicClaim(liveExisting) });
        continue;
      }
      if (liveExisting && liveExisting.issue !== event.issue) {
        conflicts.push({ kind: 'BRANCH_ISSUE_MISMATCH', event, holder: publicClaim(liveExisting) });
        continue;
      }
      const blocker = activeOthersOverlap(event.branch, event.files, event.at);
      if (blocker) {
        conflicts.push({ kind: 'FILES_RESERVED', event, holder: publicClaim(blocker) });
        continue;
      }
      claims.set(event.branch, {
        branch: event.branch,
        issue: event.issue,
        agent: event.agent,
        files: event.files,
        goal: event.goal,
        leaseHours: event.leaseHours,
        createdAt: liveExisting ? liveExisting.createdAt : event.at,
        createdId: liveExisting ? liveExisting.createdId : event.id,
        lastActivityAt: event.at,
        lastActivityId: event.id,
        prReady: liveExisting ? liveExisting.prReady : false,
        released: false,
        releasedAt: null,
        releaseReason: null,
      });
    } else if (event.type === 'PR_READY') {
      const existing = claims.get(event.branch);
      if (!existing || existing.released || existing.agent !== event.agent || existing.issue !== event.issue) {
        rejected.push({ kind: 'ORPHAN_PR_READY', event });
        continue;
      }
      if (isExpired(existing, event.at)) {
        rejected.push({ kind: 'EXPIRED_CLAIM', event });
        continue;
      }
      existing.lastActivityAt = event.at;
      existing.lastActivityId = event.id;
      existing.prReady = true;
    } else { // RELEASE
      const existing = claims.get(event.branch);
      if (!existing || existing.agent !== event.agent || existing.issue !== event.issue) {
        rejected.push({ kind: 'ORPHAN_RELEASE', event });
        continue;
      }
      if (existing.released) continue; // RELEASE repetida: no-op idempotente
      existing.released = true;
      existing.releasedAt = event.at;
      existing.releaseReason = event.reason;
    }
  }

  const active = [];
  const expired = [];
  const released = [];
  for (const claim of claims.values()) {
    if (claim.released) released.push(publicClaim(claim));
    else if (isExpired(claim, nowMillis)) expired.push(publicClaim(claim));
    else active.push(publicClaim(claim));
  }

  return {
    protocolVersion: CLAIM_REGISTRY_PROTOCOL_VERSION,
    now: new Date(nowMillis).toISOString(),
    active,
    expired,
    released,
    conflicts,
    rejected,
  };
}

/** Comodidad para pruebas y llamadores: ¿sigue viva esta reserva a fecha `now`? */
export function isClaimActive(claim, now) {
  insist(claim && typeof claim === 'object', 'CLAIM_REGISTRY', 'Reserva no válida.');
  const nowMillis = timestamp(now);
  const lastActivity = Date.parse(claim.lastActivityAt);
  insist(Number.isFinite(lastActivity), 'CLAIM_REGISTRY', 'Reserva no válida.');
  return !claim.released && (nowMillis - lastActivity <= claim.leaseHours * 3600 * 1000);
}
