import { OfficeError, insist } from './domain.mjs';

const repoPattern = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i;
const agentIdPattern = /^[a-z0-9][a-z0-9._:/-]{0,79}$/i;
const validStatuses = new Set(['ok', 'degraded', 'down']);
const validActions = new Set(['read', 'edit', 'move', 'manage', 'space.read', 'space.edit', 'space.move', 'space.edit_common']);

export function validateIntegrationContext(ctx) {
  insist(ctx && typeof ctx === 'object' && !Array.isArray(ctx), 'INTEGRATION_CONTRACT', 'El contexto de integración debe ser un objeto.');
  insist(typeof ctx.projectId === 'string' && repoPattern.test(ctx.projectId), 'INTEGRATION_CONTRACT', 'Identificador de proyecto no válido.');
  if (ctx.agentId !== undefined && ctx.agentId !== null) {
    insist(typeof ctx.agentId === 'string' && agentIdPattern.test(ctx.agentId), 'INTEGRATION_CONTRACT', 'Identificador de agente no válido.');
  }
  if (ctx.memberId !== undefined && ctx.memberId !== null) {
    insist(typeof ctx.memberId === 'string' && ctx.memberId.length > 0, 'INTEGRATION_CONTRACT', 'Identificador de miembro no válido.');
  }
  return {
    projectId: ctx.projectId,
    agentId: ctx.agentId ?? null,
    memberId: ctx.memberId ?? null,
    capabilities: Array.isArray(ctx.capabilities) ? [...ctx.capabilities] : []
  };
}

export function validateIntegrationRequest(req) {
  insist(req && typeof req === 'object' && !Array.isArray(req), 'INTEGRATION_CONTRACT', 'La petición de integración debe ser un objeto.');
  const rawPath = req.path ?? req.url ?? '';
  insist(typeof rawPath === 'string' && rawPath.startsWith('/'), 'INTEGRATION_CONTRACT', 'Ruta de petición no válida.');
  const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
  insist(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method), 'INTEGRATION_CONTRACT', 'Método HTTP no válido.');
  return {
    method,
    path: rawPath,
    headers: req.headers && typeof req.headers === 'object' ? { ...req.headers } : {},
    body: req.body ?? null
  };
}

export function validateHealthStatus(health, source = 'component') {
  insist(health && typeof health === 'object' && !Array.isArray(health), 'INTEGRATION_CONTRACT', `Estado de salud de ${source} no válido.`);
  const status = typeof health.status === 'string' ? health.status.toLowerCase() : '';
  insist(validStatuses.has(status), 'INTEGRATION_CONTRACT', `Estado de salud no reconocido para ${source}.`);
  const timestamp = Number.isSafeInteger(health.timestamp) && health.timestamp >= 0 ? health.timestamp : Date.now();
  const details = health.details && typeof health.details === 'object' && !Array.isArray(health.details) ? { ...health.details } : {};
  return { status, details, timestamp };
}

export function validateSpaceEvent(event) {
  insist(event && typeof event === 'object' && !Array.isArray(event), 'INTEGRATION_CONTRACT', 'El evento de espacio debe ser un objeto.');
  const type = typeof event.type === 'string' ? event.type : 'space_invalidated';
  insist(type.length > 0 && type.length <= 80, 'INTEGRATION_CONTRACT', 'Tipo de evento no válido.');
  return {
    type,
    projectId: typeof event.projectId === 'string' ? event.projectId : null,
    at: Number.isSafeInteger(event.at) ? event.at : Date.now(),
    payload: event.payload && typeof event.payload === 'object' ? { ...event.payload } : {}
  };
}

export function validateAuthorizationParams(agentId, projectId, action) {
  insist(typeof agentId === 'string' && agentIdPattern.test(agentId), 'INTEGRATION_CONTRACT', 'Identificador de agente no válido.');
  insist(typeof projectId === 'string' && repoPattern.test(projectId), 'INTEGRATION_CONTRACT', 'Identificador de proyecto no válido.');
  insist(typeof action === 'string' && action.length > 0 && action.length <= 80, 'INTEGRATION_CONTRACT', 'Acción de autorización no válida.');
  return { agentId, projectId, action };
}
