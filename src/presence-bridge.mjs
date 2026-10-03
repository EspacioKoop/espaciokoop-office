import { timingSafeEqual } from 'node:crypto';
import { OfficeError, insist, digest, validatePolicy } from './domain.mjs';
import { createPresenceRegistry, validateAgentDirectory } from './presence.mjs';

function exact(value, keys) {
  insist(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key)),
  'PRESENCE_CONFIG', 'Configuración de presencia no válida.');
}

// Local administrator configuration only. Credential material never leaves this bridge.
export function createPresenceBridge({ load, projectId, now = Date.now } = {}) {
  let state = null;
  let attemptWindow = { at: now(), count: 0 };
  const busy = new Set(); const windows = new Map();
  function synchronize(rawPolicy) {
    try {
      const policy = validatePolicy(rawPolicy);
      const config = load(); exact(config, ['agents', 'credentials']);
      const directory = validateAgentDirectory(config.agents, policy);
      insist(policy.projects.some(project => project.repo === projectId), 'PRESENCE_CONFIG', 'Proyecto no seleccionado.');
      insist(Array.isArray(config.credentials) && config.credentials.length === directory.length,
        'PRESENCE_CONFIG', 'Credenciales no válidas.');
      const ids = new Set(); const hashes = new Set(policy.members.map(member => member.keyHash));
      const credentials = config.credentials.map(credential => {
        exact(credential, ['agentId', 'keyHash']);
        insist(directory.some(agent => agent.id === credential.agentId) && !ids.has(credential.agentId) &&
          typeof credential.keyHash === 'string' && /^[a-f0-9]{64}$/.test(credential.keyHash) && !hashes.has(credential.keyHash),
        'PRESENCE_CONFIG', 'Credencial de agente no válida.');
        ids.add(credential.agentId); hashes.add(credential.keyHash);
        return { ...credential };
      });
      const hash = digest(JSON.stringify({ policy, directory, credentials, projectId }));
      if (state?.hash !== hash) state = { hash, policyHash: digest(JSON.stringify(policy)), credentials,
        registry: createPresenceRegistry({ directory, policy, now }) };
      return state;
    } catch {
      state = null;
      throw new OfficeError('PRESENCE_UNAVAILABLE', 'La configuración de presencia no está disponible o no es válida.', 503);
    }
  }
  function read(memberId, policy) {
    const current = synchronize(policy);
    const agents = current.registry.snapshot({ memberId, projectId });
    return { projectId, generatedAt: now(), expiresAt: now() + 1000, agents };
  }
  function prepare(key, policy) {
    if (now() - attemptWindow.at >= 60000) attemptWindow = { at: now(), count: 0 };
    insist(++attemptWindow.count <= 120, 'RATE_LIMIT', 'Demasiados intentos de presencia.', 429);
    const current = synchronize(policy);
    insist(typeof key === 'string' && key.length > 0 && key.length <= 512, 'PRESENCE_AUTH', 'Credencial de agente no válida.', 401);
    const hash = Buffer.from(digest(key), 'hex');
    const credential = current.credentials.find(item => timingSafeEqual(Buffer.from(item.keyHash, 'hex'), hash));
    insist(credential, 'PRESENCE_AUTH', 'Credencial de agente no válida.', 401);
    const agentId = credential.agentId;
    insist(!busy.has(agentId) && busy.size < 4, 'RATE_LIMIT', 'Ya hay una publicación de presencia en curso.', 429);
    let window = windows.get(agentId);
    if (!window || now() - window.at >= 60000) { window = { at: now(), count: 0 }; windows.set(agentId, window); }
    // Bounded directory and attempts: do not retain windows for removed identities.
    for (const id of windows.keys()) if (!current.credentials.some(item => item.agentId === id)) windows.delete(id);
    insist(++window.count <= 60, 'RATE_LIMIT', 'Demasiadas publicaciones de presencia.', 429);
    busy.add(agentId); let released = false;
    return {
      commit(data, currentPolicy) {
        insist(!released, 'PRESENCE_REVOKED', 'Publicación retirada.', 403);
        insist(synchronize(currentPolicy) === current, 'PRESENCE_REVOKED', 'El acceso de presencia ha cambiado.', 403);
        exact(data, ['projectId', 'sequence']);
        insist(data.projectId === projectId, 'PRESENCE_FORBIDDEN', 'Proyecto de presencia no autorizado.', 403);
        return current.registry.heartbeat({ agentId, projectId, sequence: data.sequence });
      },
      release() { released = true; busy.delete(agentId); }
    };
  }
  return { initialize: synchronize, read, prepare,
    invalidate() { state = null; },
    observePolicy(policy) {
      if (state && state.policyHash !== digest(JSON.stringify(policy))) state = null;
    }
  };
}
