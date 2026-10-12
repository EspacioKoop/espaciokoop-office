function cleanText(value, maxLength = 80) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .slice(0, maxLength);
}

function sanitizeHtml(value, maxLength = 80) {
  const text = cleanText(value, maxLength);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VALID_STATUSES = new Set(['online', 'stale', 'offline']);
const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}\/[a-z0-9][a-z0-9-]{0,39}$/;
const OWNER_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

export function projectPresenceViewModel(snapshot, options = {}) {
  const { authorized = true } = options;

  if (!authorized) {
    return {
      status: 'unauthorized',
      isAvailable: false,
      hasAgents: false,
      title: 'Presencia no disponible',
      message: 'Acceso no autorizado o sesión no disponible.',
      agents: [],
      generatedAt: null,
      expiresAt: null
    };
  }

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return {
      status: 'error',
      isAvailable: false,
      hasAgents: false,
      title: 'Presencia no disponible',
      message: 'Respuesta de presencia no válida.',
      agents: [],
      generatedAt: null,
      expiresAt: null
    };
  }

  if (snapshot.error || snapshot.status >= 400) {
    const errorCode = String(snapshot.error || snapshot.status);
    if (errorCode === 'NOT_FOUND' || snapshot.status === 404) {
      return {
        status: 'empty',
        isAvailable: true,
        hasAgents: false,
        title: 'Sin agentes registrados',
        message: 'Sin agentes registrados',
        agents: [],
        generatedAt: typeof snapshot.generatedAt === 'number' ? snapshot.generatedAt : null,
        expiresAt: typeof snapshot.expiresAt === 'number' ? snapshot.expiresAt : null
      };
    }

    return {
      status: 'error',
      isAvailable: false,
      hasAgents: false,
      title: 'Presencia no disponible',
      message: 'Error al consultar la presencia.',
      agents: [],
      generatedAt: null,
      expiresAt: null
    };
  }

  const rawAgents = Array.isArray(snapshot.agents) ? snapshot.agents : null;
  if (!rawAgents) {
    return {
      status: 'error',
      isAvailable: false,
      hasAgents: false,
      title: 'Presencia no disponible',
      message: 'Formato de snapshot de presencia no válido.',
      agents: [],
      generatedAt: null,
      expiresAt: null
    };
  }

  if (rawAgents.length === 0) {
    return {
      status: 'empty',
      isAvailable: true,
      hasAgents: false,
      title: 'Sin agentes registrados',
      message: 'Sin agentes registrados',
      agents: [],
      generatedAt: typeof snapshot.generatedAt === 'number' ? snapshot.generatedAt : null,
      expiresAt: typeof snapshot.expiresAt === 'number' ? snapshot.expiresAt : null
    };
  }

  const seenIds = new Set();
  const validAgents = [];
  const maxAgents = Math.min(rawAgents.length, 100);

  for (let i = 0; i < maxAgents; i++) {
    const raw = rawAgents[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;

    const id = cleanText(raw.id, 81);
    if (!id || !AGENT_ID_PATTERN.test(id) || seenIds.has(id)) continue;

    const ownerId = cleanText(raw.ownerId, 40);
    if (!ownerId || !OWNER_ID_PATTERN.test(ownerId) || !id.startsWith(`${ownerId}/`)) continue;

    const status = String(raw.status ?? '');
    if (!VALID_STATUSES.has(status)) continue;

    const label = sanitizeHtml(raw.label, 80);
    if (!label) continue;

    const seenAt = typeof raw.seenAt === 'number' && Number.isFinite(raw.seenAt) && raw.seenAt >= 0 ? raw.seenAt : null;

    seenIds.add(id);
    validAgents.push({
      id,
      label,
      ownerId,
      status,
      seenAt
    });
  }

  validAgents.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (validAgents.length === 0) {
    return {
      status: 'empty',
      isAvailable: true,
      hasAgents: false,
      title: 'Sin agentes registrados',
      message: 'Sin agentes registrados',
      agents: [],
      generatedAt: typeof snapshot.generatedAt === 'number' ? snapshot.generatedAt : null,
      expiresAt: typeof snapshot.expiresAt === 'number' ? snapshot.expiresAt : null
    };
  }

  return {
    status: 'available',
    isAvailable: true,
    hasAgents: true,
    title: 'Presencia de agentes',
    message: `${validAgents.length} agente(s) registrado(s)`,
    agents: validAgents,
    generatedAt: typeof snapshot.generatedAt === 'number' ? snapshot.generatedAt : null,
    expiresAt: typeof snapshot.expiresAt === 'number' ? snapshot.expiresAt : null
  };
}
