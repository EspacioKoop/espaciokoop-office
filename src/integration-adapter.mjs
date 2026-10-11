import { OfficeError } from './domain.mjs';
import { SpaceError } from '../packages/office-space/src/space.mjs';
import {
  validateIntegrationContext,
  validateIntegrationRequest,
  validateHealthStatus,
  validateSpaceEvent,
  validateAuthorizationParams
} from './integration-contracts.mjs';
import { validateAgentDirectory } from './presence.mjs';

const statusSeverity = { ok: 0, degraded: 1, down: 2 };

export function spaceFailureToResponse(error) {
  if (error instanceof SpaceError) {
    const statuses = {
      FORBIDDEN: 403, ACCESS_REVOKED: 403, NOT_FOUND: 404,
      REVISION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, RESOURCE_EXISTS: 409,
      POSITION_BLOCKED: 409, ROOM_NOT_EMPTY: 409, CAPACITY_EXCEEDED: 409,
      INVALID_INPUT: 400, STORE_BUSY: 503, COMMIT_UNCERTAIN: 503
    };
    const status = statuses[error.code] ?? 400;
    return { status, body: { error: error.code } };
  }
  if (error instanceof OfficeError) {
    return { status: error.status ?? 400, body: { error: error.code, message: error.message } };
  }
  return { status: 503, body: { error: 'SPACE_UNAVAILABLE' } };
}

export async function handleSpaceRequest(req, ctx, spaceCoreInstance = null) {
  const validatedReq = validateIntegrationRequest(req);
  const validatedCtx = validateIntegrationContext(ctx);
  const spaceCore = spaceCoreInstance ?? ctx?.spaceCore;

  // Only the trusted HTTP/session layer may supply this synchronous guard.
  // The real space bridge calls it repeatedly across asynchronous I/O so
  // revocation between reads/writes cannot be bypassed by a stale snapshot.
  const assertAuthorized = ctx?.assertAuthorized;
  if (typeof assertAuthorized !== 'function' ||
      !(validatedCtx.memberId || validatedCtx.agentId)) {
    return { status: 403, body: { error: 'ACCESS_REVOKED' } };
  }

  if (!spaceCore) {
    return { status: 503, body: { error: 'SPACE_UNAVAILABLE' } };
  }

  // A guard that fails, becomes async, or returns an invalid result revokes
  // access. Re-run it inside the underlying storage operation as well.
  const requireAuthorized = () => {
    let checked;
    try { checked = assertAuthorized(); }
    catch { throw new SpaceError('ACCESS_REVOKED'); }
    if (checked !== undefined && checked !== true) {
      if (checked && typeof checked.then === 'function') Promise.resolve(checked).catch(() => {});
      throw new SpaceError('ACCESS_REVOKED');
    }
    return checked;
  };

  try {
    requireAuthorized();
    if (validatedReq.path === '/api/space' && validatedReq.method === 'GET') {
      const data = typeof spaceCore.read === 'function'
        ? await spaceCore.read(validatedCtx.memberId ?? validatedCtx.agentId, requireAuthorized, validatedCtx)
        : await spaceCore.handleRequest(validatedReq, validatedCtx);
      requireAuthorized();
      return { status: 200, body: data };
    }

    if (validatedReq.path === '/api/space/command' && validatedReq.method === 'POST') {
      const command = validatedReq.body;
      const data = typeof spaceCore.apply === 'function'
        ? await spaceCore.apply(validatedCtx.memberId ?? validatedCtx.agentId, requireAuthorized, command, validatedCtx)
        : await spaceCore.handleRequest(validatedReq, validatedCtx);
      requireAuthorized();
      return { status: 200, body: data };
    }

    if (typeof spaceCore.handleRequest === 'function') {
      const data = await spaceCore.handleRequest(validatedReq, validatedCtx);
      // The fallback handler can be async; check revocation on completion.
      requireAuthorized();
      return { status: 200, body: data };
    }

    return { status: 404, body: { error: 'NOT_FOUND' } };
  } catch (error) {
    return spaceFailureToResponse(error);
  }
}

export function invalidateSpaceCache(projectId, event, options = {}) {
  const validatedEvent = validateSpaceEvent(event);
  const sessions = options.sessions ?? options.serverCore?.sessions ?? [];

  let notifiedCount = 0;
  const targetProject = validatedEvent.projectId ?? projectId;

  for (const session of sessions) {
    const isAuthorized = typeof options.isSessionAuthorized === 'function'
      ? options.isSessionAuthorized(session, targetProject)
      : (typeof session.isAuthorizedForProject === 'function'
        ? session.isAuthorizedForProject(targetProject)
        : (Array.isArray(session.authorizedProjects) && session.authorizedProjects.includes(targetProject)));

    if (isAuthorized) {
      if (typeof session.send === 'function') {
        session.send(validatedEvent);
      } else if (typeof session.write === 'function') {
        session.write(`event: space\ndata: ${JSON.stringify(validatedEvent)}\n\n`);
      } else if (typeof options.onNotify === 'function') {
        options.onNotify(session, validatedEvent);
      }
      notifiedCount++;
    }
  }

  return { projectId: targetProject, notifiedCount, event: validatedEvent };
}

export function authorizeSpaceAccess(agentIdOrArgs, projectIdArg, actionArg, optionsArg = {}) {
  let agentId; let projectId; let action; let options;

  if (agentIdOrArgs && typeof agentIdOrArgs === 'object' && !Array.isArray(agentIdOrArgs)) {
    agentId = agentIdOrArgs.agentId;
    projectId = agentIdOrArgs.projectId;
    action = agentIdOrArgs.action;
    options = agentIdOrArgs;
  } else {
    agentId = agentIdOrArgs;
    projectId = projectIdArg;
    action = actionArg;
    options = optionsArg ?? {};
  }

  const valid = validateAuthorizationParams(agentId, projectId, action);
  agentId = valid.agentId;
  projectId = valid.projectId;
  action = valid.action;

  if (typeof options.authorize === 'function') {
    const customResult = options.authorize(agentId, projectId, action);
    if (typeof customResult === 'boolean') {
      return { authorized: customResult, agentId, projectId, action };
    }
    return { authorized: Boolean(customResult?.authorized), agentId, projectId, action, reason: customResult?.reason };
  }

  if (options.directory && options.policy) {
    try {
      const checkedDirectory = validateAgentDirectory(options.directory, options.policy);
      const agent = checkedDirectory.find(a => a.id === agentId);
      if (!agent) {
        return { authorized: false, agentId, projectId, action, reason: 'AGENT_UNKNOWN' };
      }
      if (!agent.projects.includes(projectId)) {
        return { authorized: false, agentId, projectId, action, reason: 'PROJECT_NOT_ASSIGNED' };
      }
      const projectPolicy = options.policy.projects?.find(p => p.repo === projectId);
      if (!projectPolicy || !projectPolicy.readers.includes(agent.ownerId)) {
        return { authorized: false, agentId, projectId, action, reason: 'OWNER_NOT_AUTHORIZED' };
      }
    } catch {
      return { authorized: false, agentId, projectId, action, reason: 'INVALID_DIRECTORY_OR_POLICY' };
    }
  }

  if (options.presenceRegistry) {
    try {
      const status = options.presenceRegistry.status?.(agentId, projectId);
      if (status && status.status === 'offline' && options.requireOnline) {
        return { authorized: false, agentId, projectId, action, reason: 'AGENT_OFFLINE' };
      }
    } catch {
      return { authorized: false, agentId, projectId, action, reason: 'PRESENCE_CHECK_FAILED' };
    }
  }

  if (options.managementGateway) {
    try {
      const manifest = options.managementGateway.manifest?.();
      if (manifest && options.requiredCapability) {
        if (!manifest.capabilities.includes(options.requiredCapability)) {
          return { authorized: false, agentId, projectId, action, reason: 'CAPABILITY_MISSING' };
        }
      }
    } catch {
      return { authorized: false, agentId, projectId, action, reason: 'MANAGEMENT_CHECK_FAILED' };
    }
  }

  // Directory + policy can establish read membership; mutations require a
  // separate capability-aware authorizer from the authenticated host.
  if (!(options.directory && options.policy)) {
    return { authorized: false, agentId, projectId, action, reason: 'POLICY_UNAVAILABLE' };
  }
  if (!['read', 'space.read'].includes(action)) {
    return { authorized: false, agentId, projectId, action, reason: 'CAPABILITY_UNVERIFIED' };
  }
  return { authorized: true, agentId, projectId, action };
}

export function mergeHealthChecks(serverHealthRaw, spaceHealthRaw) {
  const serverHealth = validateHealthStatus(serverHealthRaw, 'serverCore');
  const spaceHealth = validateHealthStatus(spaceHealthRaw, 'spaceCore');

  const serverSev = statusSeverity[serverHealth.status] ?? 2;
  const spaceSev = statusSeverity[spaceHealth.status] ?? 2;
  const aggregateSev = Math.max(serverSev, spaceSev);

  const status = aggregateSev === 2 ? 'down' : (aggregateSev === 1 ? 'degraded' : 'ok');
  const timestamp = Math.max(serverHealth.timestamp, spaceHealth.timestamp);

  return {
    status,
    components: {
      server: serverHealth,
      space: spaceHealth
    },
    timestamp
  };
}

export function composeServerWithSpace(serverCore, spaceCore, options = {}) {
  if (!serverCore || typeof serverCore !== 'object') {
    throw new OfficeError('INTEGRATION_CONTRACT', 'El nucleo del servidor debe ser un objeto.');
  }
  if (!spaceCore || typeof spaceCore !== 'object') {
    throw new OfficeError('INTEGRATION_CONTRACT', 'El nucleo de espacio debe ser un objeto.');
  }

  const boundHandleSpaceRequest = (req, ctx) => handleSpaceRequest(req, ctx, spaceCore);

  const boundInvalidateCache = (projectId, event) => invalidateSpaceCache(projectId, event, { ...options, serverCore, spaceCore });

  const boundAuthorizeAccess = (agentId, projectId, action) => authorizeSpaceAccess(agentId, projectId, action, options);

  const checkHealth = async () => {
    const sHealth = typeof serverCore.healthCheck === 'function'
      ? await serverCore.healthCheck()
      : { status: 'ok', timestamp: Date.now() };
    const spHealth = typeof spaceCore.healthCheck === 'function'
      ? await spaceCore.healthCheck()
      : { status: 'ok', timestamp: Date.now() };
    return mergeHealthChecks(sHealth, spHealth);
  };

  const handleRequest = async (req, ctx = {}) => {
    const validatedReq = validateIntegrationRequest(req);
    if (validatedReq.path.startsWith('/api/space')) {
      return boundHandleSpaceRequest(validatedReq, ctx);
    }
    if (typeof serverCore.handleRequest === 'function') {
      return serverCore.handleRequest(validatedReq, ctx);
    }
    return { status: 404, body: { error: 'NOT_FOUND' } };
  };

  return {
    serverCore,
    spaceCore,
    handleRequest,
    handleSpaceRequest: boundHandleSpaceRequest,
    invalidateSpaceCache: boundInvalidateCache,
    authorizeSpaceAccess: boundAuthorizeAccess,
    checkHealth
  };
}
