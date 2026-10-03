import test from 'node:test';
import assert from 'node:assert/strict';
import { OfficeError } from '../src/domain.mjs';
import {
  createAgentManagementGateway,
  validateManagementManifest,
} from '../src/agent-management.mjs';

function fakeAdapter({ capabilities = ['agent.create', 'agent.config.write'], mode = 'normal' } = {}) {
  let record = null;
  let applyCalls = 0;
  return {
    manifest() {
      return { adapter_id: 'synthetic', protocol_version: 1, owner_id: 'equipo-eloy', capabilities };
    },
    async read(agentId) {
      if (record === null) return null;
      return { agent_id: agentId, owner_id: 'equipo-eloy', version: record.version };
    },
    async apply(request) {
      applyCalls++;
      if (mode === 'reject') return { outcome: 'rejected', code: 'POLICY_DENIED' };
      if (request.capability === 'agent.create') {
        record = { version: 1 };
        if (mode === 'throw-after-write') throw new Error('synthetic disconnect');
        return { outcome: 'applied' };
      }
      if (request.capability === 'agent.config.write') {
        record = { version: record.version + 1 };
        if (mode === 'throw-after-write') throw new Error('synthetic disconnect');
        return { outcome: 'applied' };
      }
      throw new Error('unexpected capability');
    },
    seed(version = 1) { record = { version }; },
    calls() { return applyCalls; },
    version() { return record?.version ?? null; },
  };
}

function createRequest(overrides = {}) {
  return {
    operation_id: 'op-1',
    actor_owner_id: 'equipo-eloy',
    agent_id: 'equipo-eloy:odiseo',
    capability: 'agent.create',
    expected_version: null,
    input: { template: 'synthetic', note: 'SECRET-MUST-NOT-ECHO' },
    ...overrides,
  };
}

test('gestión: manifiesto estricto rechaza capacidades desconocidas y duplicadas', () => {
  assert.throws(() => validateManagementManifest({
    adapter_id: 'synthetic', protocol_version: 1, owner_id: 'equipo-eloy',
    capabilities: ['agent.create', 'agent.create'],
  }), error => error instanceof OfficeError && error.code === 'ADAPTER_CONTRACT');

  assert.throws(() => validateManagementManifest({
    adapter_id: 'synthetic', protocol_version: 1, owner_id: 'equipo-eloy',
    capabilities: ['agent.shell'],
  }), error => error instanceof OfficeError && error.code === 'ADAPTER_CONTRACT');
});

test('gestión: capacidad ausente y propietario ajeno se rechazan antes de aplicar', async () => {
  const adapter = fakeAdapter({ capabilities: ['agent.create'] });
  const gateway = createAgentManagementGateway(adapter);

  await assert.rejects(
    gateway.execute(createRequest({ capability: 'agent.config.write', expected_version: 0 })),
    error => error instanceof OfficeError && error.code === 'UNSUPPORTED_CAPABILITY'
  );
  await assert.rejects(
    gateway.execute(createRequest({ actor_owner_id: 'equipo-varo' })),
    error => error instanceof OfficeError && error.code === 'FORBIDDEN'
  );
  assert.equal(adapter.calls(), 0);
});

test('gestión: operation_id hace el alta idempotente y no conserva el payload en el resultado', async () => {
  const adapter = fakeAdapter();
  const gateway = createAgentManagementGateway(adapter);
  const request = createRequest();

  const first = await gateway.execute(request);
  const second = await gateway.execute(structuredClone(request));

  assert.deepEqual(second, first);
  assert.equal(first.status, 'applied');
  assert.equal(first.before_version, null);
  assert.equal(first.effective_version, 1);
  assert.equal(adapter.calls(), 1);
  assert.doesNotMatch(JSON.stringify(first), /SECRET-MUST-NOT-ECHO/);

  await assert.rejects(
    gateway.execute(createRequest({ input: { template: 'other' } })),
    error => error instanceof OfficeError && error.code === 'IDEMPOTENCY_CONFLICT'
  );
  assert.equal(adapter.calls(), 1);
});

test('gestión: control optimista bloquea una edición obsoleta sin efectos', async () => {
  const adapter = fakeAdapter();
  adapter.seed(4);
  const gateway = createAgentManagementGateway(adapter);

  await assert.rejects(
    gateway.execute(createRequest({
      operation_id: 'op-write-stale',
      capability: 'agent.config.write',
      expected_version: 3,
      input: { model: 'synthetic-v2' },
    })),
    error => error instanceof OfficeError && error.code === 'VERSION_CONFLICT'
  );
  assert.equal(adapter.calls(), 0);
  assert.equal(adapter.version(), 4);
});

test('gestión: rechazo declarado exige lectura posterior sin cambios', async () => {
  const adapter = fakeAdapter({ mode: 'reject' });
  adapter.seed(2);
  const gateway = createAgentManagementGateway(adapter);

  const result = await gateway.execute(createRequest({
    operation_id: 'op-rejected',
    capability: 'agent.config.write',
    expected_version: 2,
    input: { model: 'synthetic-v2' },
  }));

  assert.equal(result.status, 'rejected');
  assert.equal(result.code, 'POLICY_DENIED');
  assert.equal(result.before_version, 2);
  assert.equal(result.effective_version, 2);
  assert.equal(adapter.version(), 2);
});

test('gestión: caída tras escribir queda unknown y reconcile evita reintentar', async () => {
  const adapter = fakeAdapter({ mode: 'throw-after-write' });
  const gateway = createAgentManagementGateway(adapter);
  const request = createRequest({ operation_id: 'op-uncertain' });

  const uncertain = await gateway.execute(request);
  assert.equal(uncertain.status, 'unknown');
  assert.equal(uncertain.code, 'ADAPTER_FAILURE');
  assert.equal(adapter.calls(), 1);
  assert.equal(adapter.version(), 1);

  const duplicate = await gateway.execute(structuredClone(request));
  assert.equal(duplicate.status, 'unknown');
  assert.equal(adapter.calls(), 1);

  const reconciled = await gateway.reconcile('op-uncertain');
  assert.equal(reconciled.status, 'applied');
  assert.equal(reconciled.effective_version, 1);
  assert.equal(adapter.calls(), 1);
});
