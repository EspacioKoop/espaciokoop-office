import { clean, insist, validatePolicy } from './domain.mjs';

const stageSet = new Set(['requested', 'accepted', 'delivered', 'reviewed', 'blocked', 'unavailable']);

function exact(value, keys) {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'TASK_ROUTE', 'Ruta de tarea no válida.');
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(key => keys.includes(key)), 'TASK_ROUTE', 'Campo de ruta no admitido.');
}

export function validateTeamRoutes(raw, policy) {
  const checked = validatePolicy(policy);
  insist(Array.isArray(raw) && raw.length <= 100, 'TASK_ROUTE', 'Rutas de tareas no válidas.');
  const members = new Set(checked.members.map(member => member.id));
  const projects = new Map(checked.projects.map(project => [project.repo, project]));
  const seen = new Set();
  const routes = [];

  for (const route of raw) {
    exact(route, ['project_id', 'issue', 'team_id']);
    const project = projects.get(route.project_id);
    insist(project, 'TASK_ROUTE', 'Proyecto de ruta no autorizado.');
    insist(Number.isSafeInteger(route.issue) && route.issue > 0 &&
      project.tasks.some(task => task.issue === route.issue), 'TASK_ROUTE', 'La ruta debe apuntar a una tarea seleccionada de GitHub.');
    insist(typeof route.team_id === 'string' && members.has(route.team_id) &&
      project.readers.includes(route.team_id), 'TASK_ROUTE', 'Equipo de ruta no autorizado.');
    const key = `${route.project_id}#${route.issue}`;
    insist(!seen.has(key), 'TASK_ROUTE', 'Una tarea no puede tener dos colas locales simultáneas.');
    seen.add(key);
    routes.push({ project_id: route.project_id, issue: route.issue, team_id: route.team_id });
  }
  return routes;
}

function unavailable(route, reason) {
  return {
    id: `${route.project_id}#${route.issue}`,
    project_id: route.project_id,
    issue: route.issue,
    team_id: route.team_id,
    title: 'Metadato no disponible',
    url: `https://github.com/${route.project_id}/issues/${route.issue}`,
    stage: 'unavailable',
    acceptance: 'unconfirmed',
    assignee: null,
    pull_request: null,
    evidence: [],
    reasons: [reason],
    source: 'github-projection',
  };
}

function projectTask(route, task) {
  if (!task || task.number !== route.issue || !stageSet.has(task.stage) ||
      typeof task.url !== 'string' || !task.url.startsWith(`https://github.com/${route.project_id}/`)) {
    return unavailable(route, 'La proyección de GitHub no contiene una tarea válida para esta ruta.');
  }
  return {
    id: `${route.project_id}#${route.issue}`,
    project_id: route.project_id,
    issue: route.issue,
    team_id: route.team_id,
    title: clean(task.title || 'Metadato no disponible', 240),
    url: task.url,
    stage: task.stage,
    acceptance: typeof task.acceptance === 'string' ? clean(task.acceptance, 80) : 'unconfirmed',
    assignee: typeof task.assignee === 'string' ? clean(task.assignee, 80) : null,
    pull_request: task.pullRequest ? {
      number: task.pullRequest.number,
      url: task.pullRequest.url,
      state: task.pullRequest.state,
      sha: task.pullRequest.sha,
      ci: task.pullRequest.ci,
      reviewer: task.pullRequest.reviewer ?? null,
    } : null,
    evidence: Array.isArray(task.evidence) ? structuredClone(task.evidence) : [],
    reasons: Array.isArray(task.reasons) ? task.reasons.map(reason => clean(reason, 240)) : [],
    source: 'github-projection',
  };
}

export function buildTeamQueue({ routes, policy, teamId, snapshots } = {}) {
  const checked = validatePolicy(policy);
  insist(checked.members.some(member => member.id === teamId), 'FORBIDDEN', 'Equipo no autorizado.', 403);
  const selected = validateTeamRoutes(routes, checked).filter(route => route.team_id === teamId);
  insist(Array.isArray(snapshots), 'TASK_QUEUE', 'Proyección de GitHub no válida.');

  const byProject = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot.repo !== 'string' || !Array.isArray(snapshot.tasks)) continue;
    if (!byProject.has(snapshot.repo)) byProject.set(snapshot.repo, snapshot);
  }

  return selected.map(route => {
    const snapshot = byProject.get(route.project_id);
    const task = snapshot?.tasks.find(candidate => candidate?.number === route.issue);
    return projectTask(route, task);
  });
}
