import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  createAgentManagementGateway,
  validateManagementManifest,
  MANAGEMENT_CAPABILITIES,
  MANAGEMENT_PROTOCOL_VERSION,
} from '../../src/agent-management.mjs';

function createMockAdapter({ capabilities = MANAGEMENT_CAPABILITIES, ownerId = 'equipo-eloy' } = {}) {
  let record = null;
  let calls = 0;

  return {
    manifest() {
      return {
        adapter_id: 'mock-adapter',
        protocol_version: MANAGEMENT_PROTOCOL_VERSION,
        owner_id: ownerId,
        capabilities: [...capabilities],
      };
    },
    async read(agentId) {
      if (!record) return null;
      return { agent_id: agentId, owner_id: ownerId, version: record.version };
    },
    async apply(request) {
      calls++;
      if (request.capability === 'agent.create' || request.capability === 'agent.register') {
        record = { version: 1 };
        return { outcome: 'applied' };
      }
      if (record) {
        record = { version: record.version + 1 };
        return { outcome: 'applied' };
      }
      return { outcome: 'rejected', code: 'INVALID_STATE' };
    },
    getCalls: () => calls,
    setVersion: (v) => { record = v !== null ? { version: v } : null; },
  };
}

function makeRequest(overrides = {}) {
  return {
    operation_id: 'op-contract-1',
    actor_owner_id: 'equipo-eloy',
    agent_id: 'equipo-eloy:agente-test',
    capability: 'agent.create',
    expected_version: null,
    input: { key: 'val' },
    ...overrides,
  };
}

test('propiedad: manifest valida capacidades strictly y rechaza duplicados o protocolos inválidos', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...MANAGEMENT_CAPABILITIES),
      fc.boolean(),
      (capability, duplicate) => {
        const caps = duplicate ? [capability, capability] : [capability];
        const raw = {
          adapter_id: 'test-adapter',
          protocol_version: MANAGEMENT_PROTOCOL_VERSION,
          owner_id: 'equipo-eloy',
          capabilities: caps,
        };

        if (duplicate) {
          assert.throws(
            () => validateManagementManifest(raw),
            err => err && err.code === 'ADAPTER_CONTRACT'
          );
        } else {
          const validated = validateManagementManifest(raw);
          assert.deepEqual(validated.capabilities, [capability]);
        }
      }
    )
  );
});

test('propiedad: authorize exige pertenencia al owner del manifiesto', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.stringMatching(/^[a-z0-9][a-z0-9._:-]{0,19}$/),
      async (actorOwnerId) => {
        const adapter = createMockAdapter({ ownerId: 'equipo-eloy' });
        const gateway = createAgentManagementGateway(adapter);

        const req = makeRequest({ operation_id: `op-auth-${Math.random()}`, actor_owner_id: actorOwnerId });

        if (actorOwnerId === 'equipo-eloy') {
          const res = await gateway.execute(req);
          assert.equal(res.status, 'applied');
        } else {
          await assert.rejects(
            gateway.execute(req),
            err => err && err.code === 'FORBIDDEN'
          );
          assert.equal(adapter.getCalls(), 0);
        }
      }
    )
  );
});

test('propiedad: control de versiones monotónico rechaza expectativas desalineadas', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 0, max: 105 }),
      async (currentVersion, expectedVersion) => {
        const adapter = createMockAdapter();
        adapter.setVersion(currentVersion);
        const gateway = createAgentManagementGateway(adapter);

        const req = makeRequest({
          operation_id: `op-ver-${Math.random()}`,
          capability: 'agent.config.write',
          expected_version: expectedVersion,
        });

        if (expectedVersion === currentVersion) {
          const res = await gateway.execute(req);
          assert.equal(res.status, 'applied');
          assert.equal(res.effective_version, currentVersion + 1);
        } else {
          await assert.rejects(
            gateway.execute(req),
            err => err && err.code === 'VERSION_CONFLICT'
          );
          assert.equal(adapter.getCalls(), 0);
        }
      }
    )
  );
});

test('propiedad: operationId es idempotente y rechaza alteración de parámetros', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.stringMatching(/^[a-z0-9][a-z0-9._:-]{0,25}$/),
      fc.boolean(),
      async (opId, alterInput) => {
        const adapter = createMockAdapter();
        const gateway = createAgentManagementGateway(adapter);
        const req1 = makeRequest({ operation_id: opId });

        const res1 = await gateway.execute(req1);
        assert.equal(res1.status, 'applied');

        if (!alterInput) {
          const res2 = await gateway.execute(makeRequest({ operation_id: opId }));
          assert.deepEqual(res1, res2);
          assert.equal(adapter.getCalls(), 1);
        } else {
          await assert.rejects(
            gateway.execute(makeRequest({ operation_id: opId, input: { key: 'different' } })),
            err => err && err.code === 'IDEMPOTENCY_CONFLICT'
          );
          assert.equal(adapter.getCalls(), 1);
        }
      }
    )
  );
});

test('propiedad: readBack round-trip y reconciliación ante fallos del adaptador', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.boolean(),
      async (shouldFailApply) => {
        let appliedState = false;
        const adapter = {
          manifest() {
            return {
              adapter_id: 'fail-adapter',
              protocol_version: MANAGEMENT_PROTOCOL_VERSION,
              owner_id: 'equipo-eloy',
              capabilities: ['agent.create'],
            };
          },
          async read(agentId) {
            return appliedState ? { agent_id: agentId, owner_id: 'equipo-eloy', version: 1 } : null;
          },
          async apply() {
            if (shouldFailApply) {
              appliedState = true;
              throw new Error('adapter disconnect');
            }
            appliedState = true;
            return { outcome: 'applied' };
          },
        };

        const gateway = createAgentManagementGateway(adapter);
        const opId = `op-fail-${Math.random()}`;
        const req = makeRequest({ operation_id: opId });

        const res = await gateway.execute(req);

        if (shouldFailApply) {
          assert.equal(res.status, 'unknown');
          assert.equal(res.code, 'ADAPTER_FAILURE');

          const reconciled = await gateway.reconcile(opId);
          assert.equal(reconciled.status, 'applied');
          assert.equal(reconciled.effective_version, 1);
        } else {
          assert.equal(res.status, 'applied');
          assert.equal(res.effective_version, 1);
        }
      }
    )
  );
});

test('propiedad: ejecuciones concurrentes se serializan de forma segura', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 2, max: 10 }),
      async (count) => {
        const adapter = createMockAdapter();
        const gateway = createAgentManagementGateway(adapter);

        // Primer alta
        await gateway.execute(makeRequest({ operation_id: 'op-init', capability: 'agent.create', expected_version: null }));

        // Peticiones concurrentes con la misma expected_version = 1 pero operation_id distintos
        const requests = Array.from({ length: count }, (_, i) =>
          makeRequest({
            operation_id: `op-concurrent-${i}`,
            capability: 'agent.config.write',
            expected_version: 1,
          })
        );

        const results = await Promise.allSettled(requests.map(r => gateway.execute(r)));

        // Solo 1 debe ser 'fulfilled', las demás deben fallar con VERSION_CONFLICT
        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, count - 1);
        for (const rej of rejected) {
          assert.equal(rej.reason.code, 'VERSION_CONFLICT');
        }
      }
    )
  );
});
