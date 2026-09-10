// Dominio puro. Ningún estado de trabajo se almacena aquí.
import { createHash, timingSafeEqual } from 'node:crypto';

export class OfficeError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function insist(ok, code, message, status = 400) {
  if (!ok) throw new OfficeError(code, message, status);
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const clean = (value, max = 240) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const loginPattern = /^[a-z0-9][a-z0-9-]{0,38}(?:\[bot\])?$/i;
const repoPattern = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i;
const positive = x => Number.isSafeInteger(x) && x > 0;
function exact(value, keys) {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'POLICY', 'Objeto de política no válido.');
  insist(Object.keys(value).every(k => keys.includes(k)), 'POLICY', 'Campo de política no admitido.');
}
export function validatePolicy(raw) {
  exact(raw, ['version', 'members', 'projects']);
  insist(raw.version === 1, 'VERSION', 'Versión de política no admitida.');
  insist(Array.isArray(raw.members) && raw.members.length > 0 && raw.members.length <= 20, 'POLICY', 'Miembros no válidos.');
  const ids = new Set(); const logins = new Set(); const hashes = new Set();
  for (const m of raw.members) {
    exact(m, ['id', 'label', 'githubLogin', 'keyHash']);
    insist(/^[a-z0-9-]{1,40}$/.test(m.id) && !ids.has(m.id), 'POLICY', 'Identidad duplicada o no válida.');
    insist(typeof m.label === 'string' && m.label.length > 0 && m.label.length <= 80, 'POLICY', 'Nombre de equipo no válido.');
    insist(loginPattern.test(m.githubLogin) && !logins.has(m.githubLogin.toLowerCase()), 'POLICY', 'Cuenta de GitHub duplicada o no válida.');
    insist(/^[a-f0-9]{64}$/.test(m.keyHash) && !hashes.has(m.keyHash), 'POLICY', 'Hash de acceso no válido o reutilizado.');
    ids.add(m.id); logins.add(m.githubLogin.toLowerCase()); hashes.add(m.keyHash);
  }
  insist(Array.isArray(raw.projects) && raw.projects.length <= 8, 'POLICY', 'Proyectos no válidos.');
  const repos = new Set();
  for (const p of raw.projects) {
    exact(p, ['repo', 'label', 'readers', 'tasks']);
    insist(typeof p.repo === 'string' && repoPattern.test(p.repo) && !['.', '..'].includes(p.repo.split('/')[1]) && !repos.has(p.repo.toLowerCase()), 'POLICY', 'Repositorio duplicado o no válido.');
    insist(typeof p.label === 'string' && p.label.length > 0 && p.label.length <= 80, 'POLICY', 'Nombre de proyecto no válido.');
    insist(Array.isArray(p.readers) && p.readers.length > 0 && p.readers.every(id => ids.has(id)) && new Set(p.readers).size === p.readers.length, 'POLICY', 'Lectores no válidos.');
    insist(Array.isArray(p.tasks) && p.tasks.length <= 30, 'POLICY', 'Selección de tareas no válida (máximo 30).');
    const issues = new Set(); const prs = new Set();
    for (const t of p.tasks) {
      exact(t, ['issue', 'pullRequest']);
      insist(positive(t.issue) && !issues.has(t.issue), 'POLICY', 'Issue duplicado o no válido.');
      insist(t.pullRequest === null || (positive(t.pullRequest) && t.pullRequest !== t.issue && !prs.has(t.pullRequest)), 'POLICY', 'PR duplicado o no válido.');
      issues.add(t.issue); if (t.pullRequest !== null) prs.add(t.pullRequest);
    }
    repos.add(p.repo.toLowerCase());
  }
  return structuredClone(raw);
}
export function authenticate(policy, key) {
  if (typeof key !== 'string' || key.length > 512) return null;
  const hashed = Buffer.from(digest(key), 'hex');
  return policy.members.find(m => timingSafeEqual(Buffer.from(m.keyHash, 'hex'), hashed)) ?? null;
}
export function authorizedProjects(policy, memberId) {
  insist(policy.members.some(m => m.id === memberId), 'AUTH', 'Acceso revocado.', 401);
  return policy.projects.filter(p => p.readers.includes(memberId));
}
export function publicMember(member) {
  return { id: member.id, label: clean(member.label, 80), githubLogin: member.githubLogin, identity: 'shared-account', presence: 'unknown' };
}
const who = node => typeof node?.login === 'string' && loginPattern.test(node.login) ? node.login : null;
const ownerOf = (policy, login) => policy.members.find(m => m.githubLogin.toLowerCase() === String(login).toLowerCase());
const nodes = connection => Array.isArray(connection?.nodes) ? connection.nodes.filter(Boolean) : [];

export function projectTask(project, selection, issue, pr, policy) {
  const source = `https://github.com/${project.repo}`;
  const result = {
    id: `${project.repo}#${selection.issue}`, number: selection.issue,
    title: clean(issue?.title || 'Metadato no disponible'), url: `${source}/issues/${selection.issue}`,
    githubState: issue?.state ?? 'UNKNOWN', author: who(issue?.author), assignee: null,
    stage: 'requested', reasons: [], pullRequest: null, evidence: [], acceptance: 'unconfirmed'
  };
  if (!issue || issue.number !== selection.issue || !['OPEN', 'CLOSED'].includes(issue.state)) {
    result.stage = 'unavailable'; result.reasons.push('GitHub no devuelve el issue autorizado.'); return result;
  }
  const requester = ownerOf(policy, result.author);
  result.evidence.push({ kind: 'requested', label: 'Solicitud en GitHub', url: result.url });
  const assignees = nodes(issue.assignees).map(who).filter(Boolean);
  if (issue.assignees?.pageInfo?.hasNextPage || assignees.length > 1) {
    result.stage = 'blocked'; result.reasons.push('La asignación no identifica un único responsable.'); return result;
  }
  result.assignee = assignees[0] ?? null;
  const worker = ownerOf(policy, result.assignee);
  // Una asignación hecha por otra persona NO acredita aceptación del destinatario.
  const lastAssignment = nodes(issue.assignments).filter(e => who(e.assignee)?.toLowerCase() === result.assignee?.toLowerCase()).at(-1);
  const accepted = requester && worker && requester.id !== worker.id && lastAssignment?.__typename === 'AssignedEvent' && who(lastAssignment.actor)?.toLowerCase() === result.assignee?.toLowerCase();
  if (!requester) result.reasons.push('El autor no está incorporado a la política de equipos.');
  if (accepted) {
    result.stage = 'accepted'; result.acceptance = 'self-assignment';
    result.evidence.push({ kind: 'accepted', label: 'Autoasignación del destinatario; no prueba de ejecución', url: result.url });
  } else if (result.assignee) {
    result.reasons.push('Falta una autoasignación verificable de un equipo distinto. No se presupone consentimiento.');
  }
  if (selection.pullRequest !== null && !pr) {
    result.stage = 'unavailable'; result.reasons.push('No se puede verificar el PR seleccionado.'); return result;
  }
  if (pr) {
    if (pr.number !== selection.pullRequest || !/^[a-f0-9]{40}$/.test(pr.headRefOid ?? '') || !['OPEN', 'CLOSED', 'MERGED'].includes(pr.state)) {
      result.stage = 'unavailable'; result.reasons.push('Metadatos de entrega no válidos.'); return result;
    }
    const commit = nodes(pr.commits).at(-1)?.commit;
    const ci = commit?.oid === pr.headRefOid ? (commit.statusCheckRollup?.state ?? 'ABSENT') : 'UNKNOWN';
    result.pullRequest = { number: pr.number, title: clean(pr.title), url: `${source}/pull/${pr.number}`, sha: pr.headRefOid, state: pr.state, author: who(pr.author), ci, reviewer: null, draft: Boolean(pr.isDraft), linkage: 'owner-declared' };
    if (!accepted || who(pr.author)?.toLowerCase() !== result.assignee?.toLowerCase()) {
      result.stage = 'blocked'; result.reasons.push('La entrega no completa la cadena de identidad y aceptación.'); return result;
    }
    if (pr.isDraft || pr.state === 'CLOSED') {
      result.reasons.push(pr.isDraft ? 'El PR es un borrador, no una entrega lista.' : 'El PR se cerró sin fusionarse.');
      if (pr.state === 'CLOSED') result.stage = 'blocked';
      return result;
    }
    result.stage = 'delivered';
    result.evidence.push({ kind: 'delivered', label: `PR #${pr.number} · ${pr.headRefOid.slice(0, 8)}`, url: result.pullRequest.url });
    const reviews = nodes(pr.latestReviews);
    const complete = pr.latestReviews?.pageInfo?.hasNextPage === false;
    const reviewers = reviews.map(r => who(r.author)?.toLowerCase()).filter(Boolean);
    const unique = new Set(reviewers).size === reviewers.length;
    const changes = reviews.some(r => r.state === 'CHANGES_REQUESTED') || pr.reviewDecision === 'CHANGES_REQUESTED';
    const approval = reviews.find(r => r.state === 'APPROVED' && r.commit?.oid === pr.headRefOid && ownerOf(policy, who(r.author))?.id === requester.id);
    if (!complete || !unique) result.reasons.push('La revisión está incompleta o es ambigua; no se acredita cierre.');
    if (changes) result.reasons.push('Existen cambios solicitados.');
    if (!approval) result.reasons.push('Falta aprobación independiente del equipo solicitante sobre el SHA actual.');
    if (pr.reviewDecision === 'REVIEW_REQUIRED') result.reasons.push('GitHub todavía requiere revisión.');
    if (ci !== 'SUCCESS') result.reasons.push(ci === 'ABSENT' ? 'No hay CI; ausencia no significa éxito.' : 'El CI del SHA actual no está confirmado en verde.');
    if (complete && unique && !changes && approval && ci === 'SUCCESS' && pr.reviewDecision !== 'REVIEW_REQUIRED') {
      result.stage = 'reviewed'; result.pullRequest.reviewer = who(approval.author);
      result.evidence.push({ kind: 'reviewed', label: 'Aprobación del SHA actual y CI en verde', url: `${result.pullRequest.url}/files` });
    }
  }
  if (issue.state === 'CLOSED' && result.stage !== 'reviewed') {
    result.stage = 'blocked'; result.reasons.push('Cerrar un issue no demuestra completar la colaboración.');
  }
  return result;
}

export function projectSnapshot(project, data, policy) {
  return {
    repo: project.repo, label: clean(project.label, 80),
    tasks: project.tasks.map((selection, i) => projectTask(project, selection, data?.[`i${i}`], selection.pullRequest === null ? null : data?.[`p${i}`], policy))
  };
}
