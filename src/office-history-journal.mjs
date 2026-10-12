// Modelo puro, paginado y reproducible del diario de la oficina y periódico para personas que regresan.
// Nota sobre el contrato: las decisiones de producto sobre la presentación visual final o la gamificación
// extendida dependen de Varo/Eloy; este módulo entrega exclusivamente el núcleo puro, desacoplado y verificable.

import { OfficeError, insist, clean, validatePolicy, digest } from './domain.mjs';

export const JOURNAL_PROTOCOL_VERSION = 1;

export const EVENT_CATEGORY_OPERATIONAL = 'operational';
export const EVENT_CATEGORY_GAME = 'game';
export const EVENT_CATEGORY_NARRATIVE = 'narrative';

export const ALLOWED_CATEGORIES = Object.freeze([
  EVENT_CATEGORY_OPERATIONAL,
  EVENT_CATEGORY_GAME,
  EVENT_CATEGORY_NARRATIVE,
]);

const FORBIDDEN_KEYS = [
  'secret', 'token', 'password', 'keyhash', 'bearer',
  'conversation', 'chat', 'transcript', 'raw_message', 'prompt',
];

const idPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const authorPattern = /^[a-z0-9][a-z0-9._:/-]{0,79}$/i;
const repoPattern = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i;

function exact(value, keys, code = 'JOURNAL_CONTRACT') {
  insist(value && typeof value === 'object' && !Array.isArray(value), code, 'Estructura de objeto no válida.');
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(k => keys.includes(k)), code, 'Propiedad no permitida en la estructura.');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return digest(JSON.stringify(canonical(value)));
}

function checkForbiddenContent(value, path = '') {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('bearer ') || lower.includes('---begin private key---')) {
      throw new OfficeError('JOURNAL_FORBIDDEN_CONTENT', 'Contenido confidencial o secreto no permitido en el diario.');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) checkForbiddenContent(item, path);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (FORBIDDEN_KEYS.some(k => lowerKey.includes(k))) {
        throw new OfficeError('JOURNAL_FORBIDDEN_CONTENT', `Propiedad prohibida o confidencial (${key}) en el diario.`);
      }
      checkForbiddenContent(val, `${path}.${key}`);
    }
  }
}

function parseTimestamp(timestamp) {
  if (Number.isSafeInteger(timestamp) && timestamp > 0) return timestamp;
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  throw new OfficeError('JOURNAL_INVALID_EVENT', 'Fecha u hora de evento no válida.');
}

export function validateJournalEvent(raw) {
  insist(raw && typeof raw === 'object' && !Array.isArray(raw), 'JOURNAL_INVALID_EVENT', 'El evento del diario debe ser un objeto.');

  exact(raw, ['id', 'category', 'type', 'author', 'origin', 'timestamp', 'ownerId', 'projectId', 'payload', 'evidence', 'refId'], 'JOURNAL_INVALID_EVENT');

  insist(typeof raw.id === 'string' && idPattern.test(raw.id), 'JOURNAL_INVALID_EVENT', 'Identificador de evento no válido.');
  insist(typeof raw.category === 'string' && ALLOWED_CATEGORIES.includes(raw.category), 'JOURNAL_INVALID_EVENT', 'Categoría de evento no válida.');
  insist(typeof raw.type === 'string' && idPattern.test(raw.type), 'JOURNAL_INVALID_EVENT', 'Tipo de evento no válido.');
  insist(typeof raw.author === 'string' && authorPattern.test(raw.author), 'JOURNAL_INVALID_EVENT', 'Autor u origen de evento no válido.');
  insist(typeof raw.origin === 'string' && idPattern.test(raw.origin), 'JOURNAL_INVALID_EVENT', 'Origen de evento no válido.');

  const timestamp = parseTimestamp(raw.timestamp);

  insist(typeof raw.ownerId === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.ownerId), 'JOURNAL_INVALID_EVENT', 'Propietario de evento no válido.');
  insist(raw.projectId === null || (typeof raw.projectId === 'string' && repoPattern.test(raw.projectId)), 'JOURNAL_INVALID_EVENT', 'Proyecto de evento no válido.');

  if (raw.payload !== null) {
    insist(typeof raw.payload === 'object' && !Array.isArray(raw.payload), 'JOURNAL_INVALID_EVENT', 'Carga útil de evento no válida.');
    const text = JSON.stringify(raw.payload);
    insist(Buffer.byteLength(text) <= 8192, 'JOURNAL_INVALID_EVENT', 'Carga útil demasiado grande.');
    checkForbiddenContent(raw.payload);
  }

  if (raw.evidence !== null) {
    insist(Array.isArray(raw.evidence), 'JOURNAL_INVALID_EVENT', 'Evidencia debe ser una lista de artefactos.');
    insist(raw.evidence.length <= 10, 'JOURNAL_INVALID_EVENT', 'Demasiados elementos de evidencia.');
    if (raw.category === EVENT_CATEGORY_NARRATIVE) {
      insist(raw.evidence.length === 0, 'JOURNAL_EVIDENCE_MISMATCH', 'El texto narrativo no puede presentarse como evidencia operativa.');
    }
    for (const ev of raw.evidence) {
      exact(ev, ['kind', 'label', 'url', 'sha'], 'JOURNAL_INVALID_EVENT');
      insist(typeof ev.kind === 'string' && ev.kind.length > 0 && ev.kind.length <= 40, 'JOURNAL_INVALID_EVENT', 'Tipo de evidencia no válido.');
      insist(typeof ev.label === 'string' && ev.label.length > 0 && ev.label.length <= 120, 'JOURNAL_INVALID_EVENT', 'Etiqueta de evidencia no válida.');
      insist(typeof ev.url === 'string' && ev.url.startsWith('https://'), 'JOURNAL_INVALID_EVENT', 'Enlace de evidencia no válido.');
      insist(ev.sha === null || (typeof ev.sha === 'string' && /^[a-f0-9]{40}$/.test(ev.sha)), 'JOURNAL_INVALID_EVENT', 'SHA de evidencia no válido.');
      checkForbiddenContent(ev);
    }
  }

  insist(raw.refId === null || (typeof raw.refId === 'string' && idPattern.test(raw.refId)), 'JOURNAL_INVALID_EVENT', 'Referencia de evento no válida.');

  return {
    id: raw.id,
    category: raw.category,
    type: raw.type,
    author: clean(raw.author, 80),
    origin: clean(raw.origin, 80),
    timestamp,
    ownerId: raw.ownerId,
    projectId: raw.projectId,
    payload: raw.payload ? structuredClone(raw.payload) : null,
    evidence: raw.evidence ? structuredClone(raw.evidence) : null,
    refId: raw.refId,
  };
}

export function createOfficeHistoryJournal({ policy, maxEvents = 10000 } = {}) {
  policy = validatePolicy(policy);
  insist(Number.isSafeInteger(maxEvents) && maxEvents > 0, 'JOURNAL_CONFIG', 'Límite de eventos no válido.');

  const events = [];
  const eventsById = new Map();
  const fingerprints = new Map();
  const tombstones = new Map();
  const revokedOwners = new Set();
  const revokedProjects = new Set();
  const revokedAgents = new Set();

  function isVisibleTo(event, memberId) {
    if (revokedOwners.has(event.ownerId)) return false;
    if (event.projectId && revokedProjects.has(event.projectId)) return false;

    const authorAgent = event.author.includes('/') ? event.author : null;
    if (authorAgent && revokedAgents.has(authorAgent)) return false;

    const member = policy.members.find(m => m.id === memberId);
    if (!member) return false;

    if (event.projectId) {
      const project = policy.projects.find(p => p.repo === event.projectId);
      if (!project || !project.readers.includes(memberId)) return false;
    } else {
      if (event.ownerId !== memberId && !policy.members.some(m => m.id === memberId)) return false;
    }
    return true;
  }

  function appendEvent(rawInput) {
    const normalized = validateJournalEvent(rawInput);
    const fp = fingerprint(normalized);

    if (eventsById.has(normalized.id)) {
      const existing = eventsById.get(normalized.id);
      const existingFp = fingerprints.get(normalized.id);
      insist(existingFp === fp, 'JOURNAL_IDEMPOTENCY_CONFLICT', 'Conflicto de idempotencia al registrar el evento.', 409);
      return structuredClone(existing);
    }

    insist(events.length < maxEvents, 'RATE_LIMIT', 'Límite de eventos alcanzado en el diario.', 429);

    events.push(normalized);
    eventsById.set(normalized.id, normalized);
    fingerprints.set(normalized.id, fp);

    return structuredClone(normalized);
  }

  function undoEvent({ eventId, author, reason, timestamp }) {
    insist(eventsById.has(eventId), 'JOURNAL_NOT_FOUND', 'Evento a deshacer no encontrado.', 404);
    const target = eventsById.get(eventId);

    const ts = timestamp ? parseTimestamp(timestamp) : Date.now();
    const undoId = `${eventId}:undo:${ts}`;

    tombstones.set(eventId, { reason: clean(reason, 120), at: ts, author: clean(author, 80) });

    const undoRecord = appendEvent({
      id: undoId,
      category: target.category,
      type: 'journal.event_undone',
      author: clean(author, 80),
      origin: 'journal',
      timestamp: ts,
      ownerId: target.ownerId,
      projectId: target.projectId,
      payload: { targetId: eventId, reason: clean(reason, 120) },
      evidence: null,
      refId: eventId,
    });

    return undoRecord;
  }

  function correctEvent({ eventId, correction, author, reason, timestamp }) {
    insist(eventsById.has(eventId), 'JOURNAL_NOT_FOUND', 'Evento a corregir no encontrado.', 404);
    const target = eventsById.get(eventId);

    const ts = timestamp ? parseTimestamp(timestamp) : Date.now();
    tombstones.set(eventId, { reason: clean(reason, 120), at: ts, author: clean(author, 80) });

    const correctedInput = {
      ...correction,
      refId: eventId,
      ownerId: target.ownerId,
      projectId: target.projectId,
    };

    return appendEvent(correctedInput);
  }

  function revokeEvent(eventId, { author, reason } = {}) {
    insist(eventsById.has(eventId), 'JOURNAL_NOT_FOUND', 'Evento no encontrado.', 404);
    const ts = Date.now();
    tombstones.set(eventId, { reason: clean(reason ?? 'Revocado', 120), at: ts, author: clean(author ?? 'system', 80) });

    for (const ev of events) {
      if (ev.refId === eventId) {
        tombstones.set(ev.id, { reason: 'Propagación de revocación', at: ts, author: 'system' });
      }
    }
  }

  function revokeOwner(ownerId) {
    insist(policy.members.some(m => m.id === ownerId), 'JOURNAL_UNKNOWN_MEMBER', 'Propietario no encontrado.', 404);
    revokedOwners.add(ownerId);
  }

  function revokeProject(projectId) {
    insist(policy.projects.some(p => p.repo === projectId), 'JOURNAL_UNKNOWN_PROJECT', 'Proyecto no encontrado.', 404);
    revokedProjects.add(projectId);
  }

  function revokeAgent(agentId) {
    insist(typeof agentId === 'string' && agentId.includes('/'), 'JOURNAL_INVALID_AGENT', 'Identificador de agente no válido.');
    revokedAgents.add(agentId);
  }

  function getEvents({
    ownerId,
    projectId = null,
    category = null,
    since = null,
    until = null,
    includeTombstones = false,
    page = 1,
    pageSize = 20,
  } = {}) {
    insist(policy.members.some(m => m.id === ownerId), 'AUTH', 'Propietario no autorizado.', 401);

    const minTs = since !== null ? parseTimestamp(since) : 0;
    const maxTs = until !== null ? parseTimestamp(until) : Number.MAX_SAFE_INTEGER;

    insist(Number.isSafeInteger(page) && page >= 1, 'JOURNAL_PAGINATION', 'Página no válida.');
    insist(Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100, 'JOURNAL_PAGINATION', 'Tamaño de página no válido.');

    const filtered = events.filter(ev => {
      if (!isVisibleTo(ev, ownerId)) return false;
      if (projectId !== null && ev.projectId !== projectId) return false;
      if (category !== null && ev.category !== category) return false;
      if (ev.timestamp < minTs || ev.timestamp > maxTs) return false;

      const isTombstoned = tombstones.has(ev.id);
      if (isTombstoned && !includeTombstones) return false;

      return true;
    });

    filtered.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.id.localeCompare(b.id);
    });

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 0;
    const startIdx = (page - 1) * pageSize;
    const rawSlice = filtered.slice(startIdx, startIdx + pageSize);

    const items = rawSlice.map(ev => {
      const clone = structuredClone(ev);
      if (tombstones.has(ev.id)) {
        clone.tombstone = true;
        clone.tombstoneInfo = tombstones.get(ev.id);
      }
      return clone;
    });

    return {
      page,
      pageSize,
      totalItems,
      totalPages,
      items,
    };
  }

  function generateNewspaper({ ownerId, projectId = null, since = null, until = null, page = 1, pageSize = 10 } = {}) {
    insist(policy.members.some(m => m.id === ownerId), 'AUTH', 'Propietario no autorizado.', 401);

    const minTs = since !== null ? parseTimestamp(since) : 0;
    const maxTs = until !== null ? parseTimestamp(until) : Number.MAX_SAFE_INTEGER;

    const visible = events.filter(ev => {
      if (!isVisibleTo(ev, ownerId)) return false;
      if (projectId !== null && ev.projectId !== projectId) return false;
      if (ev.timestamp < minTs || ev.timestamp > maxTs) return false;
      return true;
    });

    const activeEvents = visible.filter(ev => !tombstones.has(ev.id));
    const totalTombstones = visible.filter(ev => tombstones.has(ev.id)).length;

    activeEvents.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.id.localeCompare(b.id);
    });

    const operational = activeEvents.filter(ev => ev.category === EVENT_CATEGORY_OPERATIONAL);
    const game = activeEvents.filter(ev => ev.category === EVENT_CATEGORY_GAME);
    const narrative = activeEvents.filter(ev => ev.category === EVENT_CATEGORY_NARRATIVE);

    const editionId = `edition-${ownerId}-${since ?? 'beginning'}-${until ?? 'now'}`;

    insist(Number.isSafeInteger(page) && page >= 1, 'JOURNAL_PAGINATION', 'Página no válida.');
    insist(Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100, 'JOURNAL_PAGINATION', 'Tamaño de página no válido.');

    const totalItems = activeEvents.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 0;
    const startIdx = (page - 1) * pageSize;
    const pagedItems = activeEvents.slice(startIdx, startIdx + pageSize);

    return {
      editionId,
      generatedAt: Date.now(),
      ownerId,
      projectId,
      period: { since: minTs || null, until: maxTs === Number.MAX_SAFE_INTEGER ? null : maxTs },
      summary: {
        totalOperational: operational.length,
        totalGame: game.length,
        totalNarrative: narrative.length,
        totalTombstones,
      },
      sections: {
        operational: pagedItems.filter(ev => ev.category === EVENT_CATEGORY_OPERATIONAL).map(item => structuredClone(item)),
        game: pagedItems.filter(ev => ev.category === EVENT_CATEGORY_GAME).map(item => structuredClone(item)),
        narrative: pagedItems.filter(ev => ev.category === EVENT_CATEGORY_NARRATIVE).map(item => structuredClone(item)),
      },
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  function rewind(pointInTime) {
    const cutoff = parseTimestamp(pointInTime);
    const snapshotJournal = createOfficeHistoryJournal({ policy, maxEvents });

    for (const ev of events) {
      if (ev.timestamp <= cutoff) {
        snapshotJournal.appendEvent(ev);
        if (tombstones.has(ev.id)) {
          const info = tombstones.get(ev.id);
          if (info.at <= cutoff) {
            snapshotJournal.revokeEvent(ev.id, { author: info.author, reason: info.reason });
          }
        }
      }
    }

    return snapshotJournal;
  }

  function exportState() {
    return {
      version: JOURNAL_PROTOCOL_VERSION,
      policy: structuredClone(policy),
      maxEvents,
      events: events.map(item => structuredClone(item)),
      tombstones: Array.from(tombstones.entries()),
      revokedOwners: Array.from(revokedOwners),
      revokedProjects: Array.from(revokedProjects),
      revokedAgents: Array.from(revokedAgents),
    };
  }

  function importState(snapshot) {
    exact(snapshot, ['version', 'policy', 'maxEvents', 'events', 'tombstones', 'revokedOwners', 'revokedProjects', 'revokedAgents'], 'JOURNAL_SNAPSHOT');
    insist(snapshot.version === JOURNAL_PROTOCOL_VERSION, 'VERSION', 'Versión de diario no admitida.');

    events.length = 0;
    eventsById.clear();
    fingerprints.clear();
    tombstones.clear();
    revokedOwners.clear();
    revokedProjects.clear();
    revokedAgents.clear();

    for (const o of snapshot.revokedOwners) revokedOwners.add(o);
    for (const p of snapshot.revokedProjects) revokedProjects.add(p);
    for (const a of snapshot.revokedAgents) revokedAgents.add(a);
    for (const [k, v] of snapshot.tombstones) tombstones.set(k, v);

    for (const ev of snapshot.events) {
      appendEvent(ev);
    }
  }

  return {
    appendEvent,
    undoEvent,
    correctEvent,
    revokeEvent,
    revokeOwner,
    revokeProject,
    revokeAgent,
    getEvents,
    generateNewspaper,
    rewind,
    exportState,
    importState,
  };
}
