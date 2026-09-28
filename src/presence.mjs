import { OfficeError, insist } from './domain.mjs';

const agentIdPattern = /^[a-z0-9][a-z0-9-]{0,39}\/[a-z0-9][a-z0-9-]{0,39}$/;
const repoPattern = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i;

function exact(value, keys) {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'AGENT_DIRECTORY', 'Identidad de agente no válida.');
  insist(Object.keys(value).length === keys.length && Object.keys(value).every(k => keys.includes(k)), 'AGENT_DIRECTORY', 'Campo de agente no admitido.');
}

export function validateAgentDirectory(raw, policy) {
  insist(Array.isArray(raw) && raw.length <= 100, 'AGENT_DIRECTORY', 'Directorio de agentes no válido.');
  const members = new Set(policy?.members?.map(m => m.id) ?? []);
  const projects = new Map((policy?.projects ?? []).map(p => [p.repo, p]));
  const ids = new Set();
  const result = [];
  for (const agent of raw) {
    exact(agent, ['id', 'label', 'ownerId', 'projects']);
    insist(typeof agent.id === 'string' && agentIdPattern.test(agent.id) && !ids.has(agent.id), 'AGENT_DIRECTORY', 'Identidad de agente duplicada o no válida.');
    insist(typeof agent.ownerId === 'string' && members.has(agent.ownerId) && agent.id.startsWith(`${agent.ownerId}/`), 'AGENT_DIRECTORY', 'Propietario de agente no válido.');
    insist(typeof agent.label === 'string' && agent.label.length > 0 && agent.label.length <= 80, 'AGENT_DIRECTORY', 'Nombre de agente no válido.');
    insist(Array.isArray(agent.projects) && agent.projects.length > 0 && agent.projects.length <= 8, 'AGENT_DIRECTORY', 'Proyectos de agente no válidos.');
    const selected = new Set();
    for (const repo of agent.projects) {
      const project = projects.get(repo);
      insist(typeof repo === 'string' && repoPattern.test(repo) && project && !selected.has(repo), 'AGENT_DIRECTORY', 'Proyecto de agente no válido.');
      insist(project.readers.includes(agent.ownerId), 'AGENT_DIRECTORY', 'El propietario no tiene acceso al proyecto del agente.');
      selected.add(repo);
    }
    ids.add(agent.id);
    result.push({ id: agent.id, label: agent.label, ownerId: agent.ownerId, projects: [...agent.projects] });
  }
  return structuredClone(result);
}

export function createPresenceRegistry({ directory, policy, now = Date.now, onlineFor = 5000, ttl = 15000 } = {}) {
  insist(Number.isSafeInteger(onlineFor) && onlineFor > 0 && Number.isSafeInteger(ttl) && ttl > onlineFor && ttl <= 120000, 'PRESENCE_CONFIG', 'Ventanas de presencia no válidas.');
  const agents = validateAgentDirectory(directory, policy);
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const projects = new Map((policy?.projects ?? []).map(project => [project.repo, project]));
  const beats = new Map();
  const key = (agentId, projectId) => `${agentId}\u0000${projectId}`;

  function heartbeat({ agentId, projectId, sequence }) {
    const agent = byId.get(agentId);
    insist(agent && agent.projects.includes(projectId), 'PRESENCE_FORBIDDEN', 'Agente o proyecto no autorizado.', 403);
    insist(Number.isSafeInteger(sequence) && sequence >= 0, 'PRESENCE_SEQUENCE', 'Secuencia de presencia no válida.');
    const id = key(agentId, projectId); const previous = beats.get(id);
    insist(!previous || sequence > previous.sequence, 'PRESENCE_CONFLICT', 'Heartbeat duplicado o fuera de orden.', 409);
    const seenAt = now();
    beats.set(id, { sequence, seenAt });
    return { agentId, projectId, status: 'online', seenAt };
  }

  function status(agentId, projectId) {
    const beat = beats.get(key(agentId, projectId));
    if (!beat) return { status: 'offline', seenAt: null };
    const age = Math.max(0, now() - beat.seenAt);
    if (age > ttl) return { status: 'offline', seenAt: beat.seenAt };
    return { status: age > onlineFor ? 'stale' : 'online', seenAt: beat.seenAt };
  }

  function snapshot({ memberId, projectId }) {
    const project = projects.get(projectId);
    insist(project && project.readers.includes(memberId), 'PRESENCE_FORBIDDEN', 'Proyecto no autorizado.', 403);
    return agents.filter(agent => agent.projects.includes(projectId)).map(agent => {
      const current = status(agent.id, projectId);
      return { id: agent.id, label: agent.label, ownerId: agent.ownerId, status: current.status, seenAt: current.seenAt };
    });
  }

  function revokeAgent(agentId) {
    insist(byId.has(agentId), 'PRESENCE_UNKNOWN', 'Agente no registrado.', 404);
    for (const projectId of byId.get(agentId).projects) beats.delete(key(agentId, projectId));
  }

  function revokeProject(projectId) {
    insist(projects.has(projectId), 'PRESENCE_UNKNOWN', 'Proyecto no registrado.', 404);
    for (const agent of agents) beats.delete(key(agent.id, projectId));
  }

  return { heartbeat, snapshot, revokeAgent, revokeProject };
}
