// Datos inventados de evaluación. No representan usuarios, agentes ni proyectos reales.
import { digest, validatePolicy } from './domain.mjs';
export const SHA = '1234567890abcdef1234567890abcdef12345678';
const members = [
  { id: 'aurora', label: 'Equipo Aurora', githubLogin: 'ada-demo', keyHash: digest('demo-aurora') },
  { id: 'marea', label: 'Equipo Marea', githubLogin: 'nico-demo', keyHash: digest('demo-marea') }
];
export const demoPolicy = validatePolicy({ version: 1, members, projects: [
  { repo: 'demo/observatorio', label: 'Observatorio', readers: ['aurora', 'marea'], tasks: [{ issue: 11, pullRequest: null }, { issue: 12, pullRequest: 22 }] },
  { repo: 'demo/archivo', label: 'Archivo de ideas', readers: ['aurora'], tasks: [{ issue: 31, pullRequest: 41 }] }
] });
export function makeIssue(number, title = 'Comprobar una entrega', accepted = true) {
  return { number, title, state: 'OPEN', author: { login: 'ada-demo' }, assignees: { nodes: accepted ? [{ login: 'nico-demo' }] : [], pageInfo: { hasNextPage: false } }, assignments: { nodes: accepted ? [{ __typename: 'AssignedEvent', actor: { login: 'nico-demo' }, assignee: { login: 'nico-demo' } }] : [] } };
}
export function makePR(number, approved = true) {
  return { number, title: 'Resultado reproducible de la tarea', state: 'OPEN', isDraft: false, headRefOid: SHA, author: { login: 'nico-demo' }, reviewDecision: approved ? 'APPROVED' : 'REVIEW_REQUIRED', commits: { nodes: [{ commit: { oid: SHA, statusCheckRollup: { state: 'SUCCESS' } } }] }, latestReviews: { nodes: approved ? [{ state: 'APPROVED', author: { login: 'ada-demo' }, commit: { oid: SHA } }] : [], pageInfo: { hasNextPage: false } } };
}
export class DemoSource {
  constructor() { this.step = 0; this.version = 0; }
  async read(project) {
    if (project.repo === 'demo/observatorio') return {
      i0: makeIssue(11, 'Compartir una comprobación de accesibilidad', this.step >= 1),
      p0: this.step >= 2 ? makePR(21, this.step >= 3) : null,
      i1: makeIssue(12, 'Revisar la navegación del observatorio'), p1: makePR(22, false)
    };
    if (project.repo === 'demo/archivo') return { i0: makeIssue(31, 'Documentar una solución reutilizable'), p0: makePR(41) };
    throw new Error('Proyecto sintético no autorizado.');
  }
  policy() {
    const policy = structuredClone(demoPolicy);
    if (this.step >= 2) policy.projects[0].tasks[0].pullRequest = 21;
    return policy;
  }
  advance(memberId, expectedVersion) {
    if (expectedVersion !== this.version) return { error: 'CONFLICT' };
    if ((this.step < 2 && memberId !== 'marea') || (this.step === 2 && memberId !== 'aurora')) return { error: 'FORBIDDEN' };
    if (this.step >= 3) return { error: 'COMPLETE' };
    this.step++; this.version++;
    return { ok: true, step: this.step };
  }
}
