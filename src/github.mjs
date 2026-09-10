// Lista positiva de objetos y de campos: no se piden cuerpos, comentarios, diffs ni archivos.
import { OfficeError, insist, validatePolicy } from './domain.mjs';

export function buildQuery(project) {
  const items = project.tasks.map((t, i) => {
    insist(Number.isSafeInteger(t.issue) && t.issue > 0 && (t.pullRequest === null || (Number.isSafeInteger(t.pullRequest) && t.pullRequest > 0)), 'POLICY', 'Selección no válida.');
    const issue = `i${i}: issue(number: ${t.issue}) {
      number title state author { login }
      assignees(first: 100) { nodes { login } pageInfo { hasNextPage } }
      assignments: timelineItems(last: 100, itemTypes: [ASSIGNED_EVENT, UNASSIGNED_EVENT]) {
        nodes {
          __typename
          ... on AssignedEvent { actor { login } assignee { ... on User { login } } }
          ... on UnassignedEvent { actor { login } assignee { ... on User { login } } }
        }
      }
    }`;
    const pr = t.pullRequest === null ? '' : `p${i}: pullRequest(number: ${t.pullRequest}) {
      number title state isDraft headRefOid author { login } reviewDecision
      commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
      latestReviews(first: 100) { nodes { state author { login } commit { oid } } pageInfo { hasNextPage } }
    }`;
    return `${issue}\n${pr}`;
  }).join('\n');
  return { query: `query OfficeMetadata($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${items} } }`, variables: { owner: project.repo.split('/')[0], name: project.repo.split('/')[1] } };
}

export class GitHubSource {
  constructor({ token, fetchImpl = globalThis.fetch, timeout = 10000 } = {}) {
    insist(typeof token === 'string' && token.length >= 20, 'CONFIG', 'El modo conectado necesita una credencial local de GitHub.');
    this.token = token; this.fetchImpl = fetchImpl; this.timeout = timeout;
  }
  async read(project) {
    if (!project.tasks.length) return {};
    let response;
    try {
      response = await this.fetchImpl('https://api.github.com/graphql', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.timeout),
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'EspacioKoop-Office/1.0-candidate' },
        body: JSON.stringify(buildQuery(project))
      });
    } catch { throw new OfficeError('SOURCE_UNAVAILABLE', 'GitHub no responde. No se conserva una copia local de sus tareas.', 503); }
    if (response.status === 401 || response.status === 403) throw new OfficeError('SOURCE_DENIED', 'GitHub ha rechazado el acceso. Se ha retirado la vista.', 503);
    if (response.status === 429) throw new OfficeError('RATE_LIMIT', 'Límite de GitHub alcanzado. Reintenta más tarde.', 429);
    insist(response.ok, 'SOURCE_UNAVAILABLE', 'No se ha podido verificar GitHub.', 503);
    let text = ''; const reader = response.body.getReader(); const decoder = new TextDecoder(); let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); throw new OfficeError('SOURCE_LIMIT', 'La respuesta excede el límite de seguridad.', 503); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } catch (error) {
      if (error instanceof OfficeError) throw error;
      throw new OfficeError('SOURCE_UNAVAILABLE', 'Respuesta de GitHub interrumpida.', 503);
    } finally { reader.releaseLock(); }
    let payload;
    try { payload = JSON.parse(text); } catch { throw new OfficeError('SOURCE_FORMAT', 'Respuesta no válida de GitHub.', 503); }
    // GraphQL puede devolver HTTP 200 con errores y datos parciales. No se aceptan.
    insist(!payload.errors && payload.data?.repository, 'SOURCE_PARTIAL', 'GitHub no ha confirmado todos los metadatos. Vista retirada.', 503);
    return payload.data.repository;
  }
}
