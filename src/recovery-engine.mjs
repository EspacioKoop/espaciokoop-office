// Motor de recuperación determinista de estado tras fallo de red/servidor.

import { ERROR_CATEGORIES, RECOVERABLE_CATEGORIES } from './recovery-types.mjs';

function pseudoRandom(seed) {
  let h = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  let t = (h ^ (h >>> 15)) * 1597334677;
  t = (t ^ (t >>> 13)) * 381201580;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

export function classifyError(error) {
  if (!error) return ERROR_CATEGORIES.UNKNOWN;

  const code = String(error.code || error.name || '').toUpperCase();
  const message = String(error.message || '').toLowerCase();
  const status = Number(error.status || error.statusCode || error.response?.status);

  if (status === 401 || status === 403 || code === 'AUTH' || code === 'PRESENCE_FORBIDDEN' || code === 'FORBIDDEN') {
    return ERROR_CATEGORIES.AUTH;
  }

  if (code === 'ETIMEDOUT' || code === 'TIMEOUT' || message.includes('timeout') || message.includes('timed out')) {
    return ERROR_CATEGORIES.TIMEOUT;
  }

  if (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'NETWORK_ERROR' ||
    message.includes('network') ||
    message.includes('fetch failed')
  ) {
    return ERROR_CATEGORIES.NETWORK;
  }

  if (status >= 500 && status <= 599) {
    return ERROR_CATEGORIES.SERVER_ERROR;
  }

  return ERROR_CATEGORIES.UNKNOWN;
}

export function isRecoverableError(error) {
  const category = classifyError(error);
  return RECOVERABLE_CATEGORIES.has(category);
}

export function exponentialBackoff(attempt, baseMs = 1000, maxMs = 30000, jitter = 0.2, seed = null) {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exponential = baseMs * Math.pow(2, safeAttempt);
  const bounded = Math.min(exponential, maxMs);

  if (jitter <= 0) {
    return Math.round(bounded);
  }

  const factor = seed !== null && seed !== undefined
    ? pseudoRandom(`${seed}:${safeAttempt}`)
    : 0.5;

  const variation = (factor * 2 - 1) * jitter * bounded;
  const result = Math.max(0, Math.round(bounded + variation));
  return Math.min(result, maxMs);
}

export function recoverPresence(localSnapshot, serverState) {
  const localAgents = Array.isArray(localSnapshot)
    ? localSnapshot
    : (Array.isArray(localSnapshot?.agents) ? localSnapshot.agents : []);

  const serverAgents = Array.isArray(serverState)
    ? serverState
    : (Array.isArray(serverState?.agents) ? serverState.agents : []);

  const revokedAgents = new Set([
    ...(Array.isArray(localSnapshot?.revokedAgents) ? localSnapshot.revokedAgents : []),
    ...(Array.isArray(serverState?.revokedAgents) ? serverState.revokedAgents : []),
    ...localAgents.filter(a => a?.status === 'revoked' || a?.revoked).map(a => a.id),
    ...serverAgents.filter(a => a?.status === 'revoked' || a?.revoked).map(a => a.id)
  ]);

  const revokedProjects = new Set([
    ...(Array.isArray(localSnapshot?.revokedProjects) ? localSnapshot.revokedProjects : []),
    ...(Array.isArray(serverState?.revokedProjects) ? serverState.revokedProjects : [])
  ]);

  const mergedMap = new Map();

  for (const agent of [...localAgents, ...serverAgents]) {
    if (!agent || !agent.id || revokedAgents.has(agent.id)) continue;
    if (agent.projectId && revokedProjects.has(agent.projectId)) continue;

    const existing = mergedMap.get(agent.id);
    if (!existing) {
      mergedMap.set(agent.id, structuredClone(agent));
    } else {
      const existingTime = existing.seenAt ?? existing.timestamp ?? 0;
      const currentTime = agent.seenAt ?? agent.timestamp ?? 0;
      const existingSeq = existing.sequence ?? 0;
      const currentSeq = agent.sequence ?? 0;

      if (currentSeq > existingSeq || (currentSeq === existingSeq && currentTime >= existingTime)) {
        mergedMap.set(agent.id, structuredClone(agent));
      }
    }
  }

  const mergedAgents = Array.from(mergedMap.values());
  const result = [...mergedAgents];
  result.agents = mergedAgents;
  result.revokedAgents = Array.from(revokedAgents);
  result.revokedProjects = Array.from(revokedProjects);

  return result;
}

export function recoverQueue(localOps, serverQueue) {
  const localList = Array.isArray(localOps)
    ? localOps
    : (Array.isArray(localOps?.operations) ? localOps.operations : []);

  const serverList = Array.isArray(serverQueue)
    ? serverQueue
    : (Array.isArray(serverQueue?.operations) ? serverQueue.operations : []);

  const serverOpIds = new Set(serverList.map(op => op?.operation_id || op?.id).filter(Boolean));
  const seenLocalIds = new Set();
  const toResend = [];
  const discarded = [];

  for (const op of localList) {
    if (!op) continue;
    const opId = op.operation_id || op.id;

    if (!opId || seenLocalIds.has(opId) || serverOpIds.has(opId)) {
      discarded.push(op);
    } else {
      seenLocalIds.add(opId);
      toResend.push(structuredClone(op));
    }
  }

  const result = [...toResend];
  result.toResend = toResend;
  result.discarded = discarded;
  return result;
}

export function recoverJournal(localEvents, serverJournal) {
  const localList = Array.isArray(localEvents)
    ? localEvents
    : (Array.isArray(localEvents?.events) ? localEvents.events : []);

  const serverList = Array.isArray(serverJournal)
    ? serverJournal
    : (Array.isArray(serverJournal?.events) ? serverJournal.events : []);

  const serverEventMap = new Map(
    serverList.map(evt => [evt?.eventId || evt?.id, evt]).filter(([id]) => Boolean(id))
  );

  const seenLocalIds = new Set();
  const toResend = [];
  const conflicts = [];

  for (const localEvt of localList) {
    if (!localEvt) continue;
    const eventId = localEvt.eventId || localEvt.id;

    if (!eventId || seenLocalIds.has(eventId)) {
      continue;
    }
    seenLocalIds.add(eventId);

    const serverEvt = serverEventMap.get(eventId);
    if (!serverEvt) {
      toResend.push(structuredClone(localEvt));
    } else {
      conflicts.push({
        eventId,
        local: structuredClone(localEvt),
        server: structuredClone(serverEvt),
        resolved: structuredClone(serverEvt)
      });
    }
  }

  const result = [...toResend];
  result.toResend = toResend;
  result.conflicts = conflicts;
  return result;
}
