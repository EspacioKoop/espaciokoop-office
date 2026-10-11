import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceError } from '../packages/office-space/src/space.mjs';
import { OfficeError } from '../src/domain.mjs';
import {
  validateIntegrationContext,
  validateIntegrationRequest,
  validateHealthStatus,
  validateSpaceEvent,
  validateAuthorizationParams
} from '../src/integration-contracts.mjs';
import {
  composeServerWithSpace,
  handleSpaceRequest,
  invalidateSpaceCache,
  authorizeSpaceAccess,
  mergeHealthChecks
} from '../src/integration-adapter.mjs';

function mockPolicy() {
  return {
    version: 1,
    members: [
      { id: 'alfa', label: 'Alfa Team', githubLogin: 'alfa-user', keyHash: 'a'.repeat(64) },
      { id: 'beta', label: 'Beta Team', githubLogin: 'beta-user', keyHash: 'b'.repeat(64) }
    ],
    projects: [
      { repo: 'org/repo-a', label: 'Repo A', readers: ['alfa'], tasks: [] },
      { repo: 'org/repo-b', label: 'Repo B', readers: ['beta'], tasks: [] }
    ]
  };
}

function mockDirectory() {
  return [
    { id: 'alfa/agent-1', label: 'Agent 1', ownerId: 'alfa', projects: ['org/repo-a'] },
    { id: 'beta/agent-2', label: 'Agent 2', ownerId: 'beta', projects: ['org/repo-b'] }
  ];
}

test('contratos: validaciones de contexto, request, health, eventos y autorizacion', () => {
  const ctx = validateIntegrationContext({ projectId: 'org/repo-a', agentId: 'alfa/agent-1', memberId: 'alfa' });
  assert.equal(ctx.projectId, 'org/repo-a');
  assert.equal(ctx.agentId, 'alfa/agent-1');

  assert.throws(
    () => validateIntegrationContext({ projectId: 'invalid_project' }),
    err => err instanceof OfficeError && err.code === 'INTEGRATION_CONTRACT'
  );

  const req = validateIntegrationRequest({ method: 'get', path: '/api/space' });
  assert.equal(req.method, 'GET');
  assert.equal(req.path, '/api/space');

  assert.throws(
    () => validateIntegrationRequest({ path: 'relative-path' }),
    err => err instanceof OfficeError && err.code === 'INTEGRATION_CONTRACT'
  );

  const health = validateHealthStatus({ status: 'OK', timestamp: 1000 }, 'test');
  assert.equal(health.status, 'ok');
  assert.equal(health.timestamp, 1000);

  const event = validateSpaceEvent({ type: 'room_created', projectId: 'org/repo-a' });
  assert.equal(event.type, 'room_created');
  assert.equal(event.projectId, 'org/repo-a');

  const auth = validateAuthorizationParams('alfa/agent-1', 'org/repo-a', 'read');
  assert.equal(auth.agentId, 'alfa/agent-1');
});

test('routing: composeServerWithSpace enruta /api/space* a spaceCore y el resto a serverCore', async () => {
  let spaceCalled = false;
  let serverCalled = false;

  const spaceCore = {
    async read(memberId) {
      spaceCalled = true;
      return { room: 'main', memberId };
    }
  };

  const serverCore = {
    async handleRequest(req) {
      serverCalled = true;
      return { status: 200, body: { info: 'server', path: req.path } };
    }
  };

  const composed = composeServerWithSpace(serverCore, spaceCore);

  const spaceRes = await composed.handleRequest(
    { method: 'GET', path: '/api/space' },
    { projectId: 'org/repo-a', memberId: 'alfa', assertAuthorized: () => true }
  );
  assert.equal(spaceCalled, true);
  assert.equal(spaceRes.status, 200);
  assert.equal(spaceRes.body.room, 'main');

  const serverRes = await composed.handleRequest(
    { method: 'GET', path: '/api/info' },
    { projectId: 'org/repo-a' }
  );
  assert.equal(serverCalled, true);
  assert.equal(serverRes.status, 200);
  assert.equal(serverRes.body.info, 'server');
});

test('resiliencia: error en spaceCore no rompe serverCore ni lanza excepciones no capturadas', async () => {
  const spaceCoreFailing = {
    async read() {
      throw new SpaceError('REVISION_CONFLICT');
    },
    async apply() {
      throw new Error('Database disk error');
    }
  };

  const serverCore = {
    async handleRequest(req) {
      return { status: 200, body: { status: 'healthy' } };
    }
  };

  const composed = composeServerWithSpace(serverCore, spaceCoreFailing);

  const readRes = await composed.handleRequest(
    { method: 'GET', path: '/api/space' },
    { projectId: 'org/repo-a', memberId: 'alfa', assertAuthorized: () => true }
  );
  assert.equal(readRes.status, 409);
  assert.equal(readRes.body.error, 'REVISION_CONFLICT');

  const applyRes = await composed.handleRequest(
    { method: 'POST', path: '/api/space/command', body: { type: 'avatar.move' } },
    { projectId: 'org/repo-a', memberId: 'alfa', assertAuthorized: () => true }
  );
  assert.equal(applyRes.status, 503);
  assert.equal(applyRes.body.error, 'SPACE_UNAVAILABLE');

  const serverRes = await composed.handleRequest(
    { method: 'GET', path: '/api/info' },
    { projectId: 'org/repo-a' }
  );
  assert.equal(serverRes.status, 200);
  assert.equal(serverRes.body.status, 'healthy');
});

test('seguridad: la ruta comprueba identidad y proyecto con la politica del host', async () => {
  const policy = mockPolicy();
  const directory = mockDirectory();
  let reads = 0;

  const requestFor = async (agentId, projectId) => handleSpaceRequest(
    { path: '/api/space', method: 'GET' },
    {
      agentId,
      projectId,
      // Este callback representa el guard creado por el backend autenticado;
      // queda ligado al principal y proyecto y vuelve a consultar la política.
      assertAuthorized() {
        const access = authorizeSpaceAccess(agentId, projectId, 'read', { directory, policy });
        if (!access.authorized) throw new SpaceError('FORBIDDEN');
        return true;
      }
    },
    {
      async read(_identity, assertAuthorized, context) {
        assertAuthorized();
        reads++;
        return { projectId: context.projectId };
      }
    }
  );

  const allowed = await requestFor('alfa/agent-1', 'org/repo-a');
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, { projectId: 'org/repo-a' });
  assert.equal(reads, 1);

  const wrongProject = await requestFor('alfa/agent-1', 'org/repo-b');
  assert.equal(wrongProject.status, 403);
  const unknownAgent = await requestFor('unknown/agent-x', 'org/repo-a');
  assert.equal(unknownAgent.status, 403);
  assert.equal(reads, 1, 'denegaciones deben ocurrir antes de leer el espacio');
});

test('autorizacion: concede o deniega segun directorio, politica y presencia', () => {
  const policy = mockPolicy();
  const directory = mockDirectory();

  const grant = authorizeSpaceAccess('alfa/agent-1', 'org/repo-a', 'read', { directory, policy });
  assert.equal(grant.authorized, true);

  const denyWrongProject = authorizeSpaceAccess('alfa/agent-1', 'org/repo-b', 'read', { directory, policy });
  assert.equal(denyWrongProject.authorized, false);
  assert.equal(denyWrongProject.reason, 'PROJECT_NOT_ASSIGNED');

  const denyUnknown = authorizeSpaceAccess('unknown/agent-x', 'org/repo-a', 'read', { directory, policy });
  assert.equal(denyUnknown.authorized, false);
  assert.equal(denyUnknown.reason, 'AGENT_UNKNOWN');

  const customDeny = authorizeSpaceAccess('alfa/agent-1', 'org/repo-a', 'manage', {
    authorize: (agentId, proj, act) => act !== 'manage'
  });
  assert.equal(customDeny.authorized, false);
});

test('sse: invalidateSpaceCache envia evento solo a sesiones autorizadas del proyecto', () => {
  const eventsAlfa = [];
  const eventsBeta = [];

  const sessions = [
    {
      id: 's1',
      authorizedProjects: ['org/repo-a'],
      send(evt) { eventsAlfa.push(evt); }
    },
    {
      id: 's2',
      authorizedProjects: ['org/repo-b'],
      send(evt) { eventsBeta.push(evt); }
    }
  ];

  const result = invalidateSpaceCache('org/repo-a', { type: 'room_updated' }, { sessions });

  assert.equal(result.notifiedCount, 1);
  assert.equal(eventsAlfa.length, 1);
  assert.equal(eventsAlfa[0].type, 'room_updated');
  assert.equal(eventsBeta.length, 0);
});

test('health: mergeHealthChecks combina salud de server Core y spaceCore de forma determinista', async () => {
  const h1 = mergeHealthChecks(
    { status: 'ok', timestamp: 100 },
    { status: 'degraded', timestamp: 200, details: { latency: 'high' } }
  );

  assert.equal(h1.status, 'degraded');
  assert.equal(h1.timestamp, 200);
  assert.deepEqual(Object.keys(h1), ['status', 'components', 'timestamp']);
  assert.equal(h1.components.server.status, 'ok');
  assert.equal(h1.components.space.status, 'degraded');

  const h2 = mergeHealthChecks(
    { status: 'down', timestamp: 300 },
    { status: 'ok', timestamp: 150 }
  );
  assert.equal(h2.status, 'down');
  assert.equal(h2.timestamp, 300);

  const serverCore = {
    async healthCheck() { return { status: 'ok', timestamp: 500 }; }
  };
  const spaceCore = {
    async healthCheck() { return { status: 'ok', timestamp: 600 }; }
  };

  const composed = composeServerWithSpace(serverCore, spaceCore);
  const healthCombined = await composed.checkHealth();

  assert.equal(healthCombined.status, 'ok');
  assert.equal(healthCombined.timestamp, 600);
});


test('seguridad: sin guard o sin politica deniega por defecto', async () => {
  assert.deepEqual(
    authorizeSpaceAccess('alfa/agent-1', 'org/repo-a', 'read'),
    { authorized: false, agentId: 'alfa/agent-1', projectId: 'org/repo-a', action: 'read', reason: 'POLICY_UNAVAILABLE' }
  );
  const read = async (_member, guard) => ({ authorized: guard() });
  const denied = await handleSpaceRequest(
    { path: '/api/space', method: 'GET' },
    { projectId: 'org/repo-a', memberId: 'alfa' },
    { read }
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'ACCESS_REVOKED');
});

test('seguridad: el bridge recibe guard autenticado y rechaza revocacion', async () => {
  let calls = 0;
  let revocado = false;
  const read = async (_member, guard) => {
    calls++;
    revocado = true;
    guard();
    return { data: 'nunca' };
  };
  const result = await handleSpaceRequest(
    { path: '/api/space', method: 'GET' },
    { projectId: 'org/repo-a', memberId: 'alfa', assertAuthorized: () => {
      if (revocado) throw new Error('session revoked');
      return true;
    } },
    { read }
  );
  assert.equal(calls, 1);
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'ACCESS_REVOKED');
});

test('seguridad: no basta pertenecer al proyecto para administrar recursos', () => {
  const result = authorizeSpaceAccess('alfa/agent-1', 'org/repo-a', 'manage', {
    policy: mockPolicy(), directory: mockDirectory()
  });
  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'CAPABILITY_UNVERIFIED');
});

test('seguridad: guard asíncrono es denegado y no accede a espacio', async () => {
  let invoked = false;
  const result = await handleSpaceRequest(
    { path: '/api/space', method: 'GET' },
    { projectId: 'org/repo-a', memberId: 'alfa', assertAuthorized: async () => true },
    { async read() { invoked = true; return { data: 'hidden' }; } }
  );
  assert.equal(result.status, 403);
  assert.equal(invoked, false);
});

test('seguridad: revocación durante fallback no publica datos', async () => {
  let active = true;
  const result = await handleSpaceRequest(
    { path: '/api/space', method: 'GET' },
    { projectId: 'org/repo-a', memberId: 'alfa', assertAuthorized: () => active },
    { async handleRequest() { active = false; return { secret: 'hidden' }; } }
  );
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'ACCESS_REVOKED');
});
