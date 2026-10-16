import { digest, clean } from './domain.mjs';

const ALLOWED_URL_PATTERN = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/(?:issues|pull)\/\d+(?:\/files)?)?$/;
const SENSITIVE_PATTERN = /(?:ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?:bearer|token|secret|password|passwd|key|session|cookie|auth)=?[:\s]*[A-Za-z0-9._~+/=-]{8,})/gi;
const PATH_PATTERN = /(?:\/(?:var|home|usr|tmp|etc|opt|root|proc|sys)\/[^\s"':;]+|[a-zA-Z]:\\[^\s"':;]+|file:\/\/[^\s"':;]+)/gi;

const STAGE_LABELS = {
  requested: '📥 Solicitado',
  accepted: '🟡 Aceptado',
  delivered: '📦 Entregado',
  reviewed: '✅ Revisado',
  blocked: '⛔ Bloqueado',
  unavailable: '❓ No disponible',
};

function redactText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(SENSITIVE_PATTERN, '[REDACTADO]')
    .replace(PATH_PATTERN, '[RUTA_REDACTADA]');
}

function sanitizeUrl(url) {
  if (typeof url !== 'string') return '[ENLACE_NO_DISPONIBLE]';
  const trimmed = url.trim();
  if (ALLOWED_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return '[ENLACE_REDACTADO]';
}

export function pseudonymizeIdentity(identity) {
  if (typeof identity !== 'string' || !identity.trim()) {
    return 'Sin asignar';
  }
  const cleanId = identity.trim().toLowerCase();
  const hash = digest(`kanban-pseudonym-salt:${cleanId}`).slice(0, 6).toUpperCase();
  return `Agente-${hash}`;
}

function deriveTeamId(agentIdentity) {
  if (typeof agentIdentity !== 'string') return null;
  const trimmed = agentIdentity.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    return parts[0] || null;
  }
  return trimmed;
}

export function projectTelegramKanbanViewModel(snapshot, options = {}) {
  const {
    authorized = true,
    agentIdentity = null,
    policy = null,
    page = 1,
    pageSize = 5,
    maxCharsPerPage = 3800,
  } = options;

  if (!authorized) {
    return {
      status: 'unauthorized',
      isAvailable: false,
      hasTasks: false,
      title: 'Tablero Kanban no disponible',
      message: 'Acceso no autorizado.',
      totalTasks: 0,
      totalPages: 0,
      currentPage: 1,
      pageSize,
      pages: [],
      text: 'Acceso no autorizado.',
    };
  }

  if (!snapshot || typeof snapshot !== 'object') {
    return {
      status: 'error',
      isAvailable: false,
      hasTasks: false,
      title: 'Tablero Kanban no disponible',
      message: 'Snapshot no válido.',
      totalTasks: 0,
      totalPages: 0,
      currentPage: 1,
      pageSize,
      pages: [],
      text: 'Error al procesar el snapshot de tareas.',
    };
  }

  if (snapshot.error || snapshot.status >= 400) {
    return {
      status: 'error',
      isAvailable: false,
      hasTasks: false,
      title: 'Tablero Kanban no disponible',
      message: 'Error en la consulta de tareas.',
      totalTasks: 0,
      totalPages: 0,
      currentPage: 1,
      pageSize,
      pages: [],
      text: 'Error en la consulta de tareas.',
    };
  }

  const teamId = deriveTeamId(agentIdentity);
  if (!teamId) {
    return {
      status: 'unauthorized',
      isAvailable: false,
      hasTasks: false,
      title: 'Tablero Kanban no disponible',
      message: 'Identidad de agente requerida.',
      totalTasks: 0,
      totalPages: 0,
      currentPage: 1,
      pageSize,
      pages: [],
      text: 'Identidad de agente no proporcionada o no válida.',
    };
  }

  if (policy && Array.isArray(policy.members)) {
    const isMember = policy.members.some((m) => m.id === teamId);
    if (!isMember) {
      return {
        status: 'unauthorized',
        isAvailable: false,
        hasTasks: false,
        title: 'Tablero Kanban no disponible',
        message: 'Equipo no autorizado en política.',
        totalTasks: 0,
        totalPages: 0,
        currentPage: 1,
        pageSize,
        pages: [],
        text: 'Identidad no autorizada en la política actual.',
      };
    }
  }

  let rawTasks = [];
  if (Array.isArray(snapshot)) {
    rawTasks = snapshot;
  } else if (Array.isArray(snapshot.tasks)) {
    rawTasks = snapshot.tasks;
  } else if (Array.isArray(snapshot.queue)) {
    rawTasks = snapshot.queue;
  } else if (snapshot.projects && Array.isArray(snapshot.projects)) {
    for (const proj of snapshot.projects) {
      if (proj && Array.isArray(proj.tasks)) {
        rawTasks.push(...proj.tasks);
      }
    }
  }

  const allowedProjects = new Set();
  if (policy && Array.isArray(policy.projects)) {
    for (const proj of policy.projects) {
      if (Array.isArray(proj.readers) && proj.readers.includes(teamId)) {
        allowedProjects.add(proj.repo.toLowerCase());
      }
    }
  }

  const visibleTasks = [];
  const seenIds = new Set();

  for (const raw of rawTasks) {
    if (!raw || typeof raw !== 'object') continue;

    const taskTeamId = raw.team_id || raw.teamId;
    const projectId = (raw.project_id || raw.projectId || raw.repo || '').toLowerCase();

    if (taskTeamId) {
      if (taskTeamId !== teamId) continue;
    } else if (policy) {
      if (!projectId || !allowedProjects.has(projectId)) continue;
    }

    const issueNumber = raw.issue || raw.number;
    const taskId = raw.id || (projectId && issueNumber ? `${projectId}#${issueNumber}` : null);
    if (!taskId || seenIds.has(taskId)) continue;
    seenIds.add(taskId);

    const title = redactText(clean(raw.title || 'Tarea sin título', 200));
    const stageKey = String(raw.stage || 'requested').toLowerCase();
    const stageLabel = STAGE_LABELS[stageKey] || `❓ ${stageKey}`;
    const url = sanitizeUrl(raw.url);

    const rawAssignee = raw.assignee || raw.worker;
    const assigneePseudonym = pseudonymizeIdentity(rawAssignee);

    const rawAuthor = raw.author || raw.requester;
    const authorPseudonym = rawAuthor ? pseudonymizeIdentity(rawAuthor) : null;

    let prInfo = null;
    if (raw.pull_request || raw.pullRequest) {
      const pr = raw.pull_request || raw.pullRequest;
      if (pr && typeof pr === 'object') {
        const prUrl = sanitizeUrl(pr.url);
        const prState = clean(pr.state || 'UNKNOWN', 20);
        const prReviewer = pr.reviewer ? pseudonymizeIdentity(pr.reviewer) : null;
        prInfo = {
          number: pr.number,
          url: prUrl,
          state: prState,
          reviewer: prReviewer,
        };
      }
    }

    const reasons = Array.isArray(raw.reasons)
      ? raw.reasons.map((r) => redactText(clean(r, 200)))
      : [];

    visibleTasks.push({
      id: taskId,
      title,
      stage: stageKey,
      stageLabel,
      url,
      assignee: assigneePseudonym,
      author: authorPseudonym,
      pullRequest: prInfo,
      reasons,
    });
  }

  if (visibleTasks.length === 0) {
    const emptyText = '📋 *Tablero Kanban*\n\nNo hay tareas visibles para esta identidad.';
    return {
      status: 'empty',
      isAvailable: true,
      hasTasks: false,
      title: 'Tablero Kanban (Vacío)',
      message: 'No hay tareas visibles.',
      totalTasks: 0,
      totalPages: 1,
      currentPage: 1,
      pageSize,
      pages: [emptyText],
      text: emptyText,
    };
  }

  const effectivePageSize = Math.max(1, Math.min(pageSize, 20));
  const pagesText = [];
  const taskBlocks = visibleTasks.map((t) => {
    let block = `• [${t.id}] ${t.title}\n`;
    block += `  Estado: ${t.stageLabel}\n`;
    block += `  Responsable: ${t.assignee}\n`;
    if (t.author) {
      block += `  Solicitante: ${t.author}\n`;
    }
    block += `  Enlace: ${t.url}`;
    if (t.pullRequest) {
      block += `\n  PR #${t.pullRequest.number}: ${t.pullRequest.state} (${t.pullRequest.url})`;
      if (t.pullRequest.reviewer) {
        block += ` [Revisor: ${t.pullRequest.reviewer}]`;
      }
    }
    if (t.reasons.length > 0) {
      block += `\n  Notas: ${t.reasons.join('; ')}`;
    }
    return block;
  });

  let currentChunk = [];
  let currentLength = 0;

  for (let i = 0; i < taskBlocks.length; i++) {
    const block = taskBlocks[i];

    if (currentChunk.length >= effectivePageSize || (currentLength + block.length > maxCharsPerPage && currentChunk.length > 0)) {
      pagesText.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(block);
    currentLength += block.length;
  }

  if (currentChunk.length > 0) {
    pagesText.push(currentChunk);
  }

  const totalPages = pagesText.length;
  const targetPage = Math.max(1, Math.min(page, totalPages));

  const formattedPages = pagesText.map((chunk, idx) => {
    const header = `📋 *Tablero Kanban* (Página ${idx + 1}/${totalPages} · Total: ${visibleTasks.length})\n\n`;
    return header + chunk.join('\n\n');
  });

  return {
    status: 'available',
    isAvailable: true,
    hasTasks: true,
    title: 'Tablero Kanban',
    message: `${visibleTasks.length} tarea(s) visible(s)`,
    totalTasks: visibleTasks.length,
    totalPages,
    currentPage: targetPage,
    pageSize: effectivePageSize,
    pages: formattedPages,
    text: formattedPages[targetPage - 1],
    tasks: visibleTasks,
  };
}
