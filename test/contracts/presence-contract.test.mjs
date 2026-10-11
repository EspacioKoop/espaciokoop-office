import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { demoPolicy } from '../../src/fixtures.mjs';
import { createPresenceRegistry, validateAgentDirectory } from '../../src/presence.mjs';

const directory = [
  { id: 'aurora/atlas', label: 'Atlas', ownerId: 'aurora', projects: ['demo/observatorio', 'demo/archivo'] },
  { id: 'aurora/lumen', label: 'Lumen', ownerId: 'aurora', projects: ['demo/observatorio'] },
  { id: 'marea/bruma', label: 'Bruma', ownerId: 'marea', projects: ['demo/observatorio'] },
];

test('propiedad: validateAgentDirectory es puro e idempotente', () => {
  fc.assert(
    fc.property(
      fc.record({
        atlasLabel: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,20}$/),
        lumenLabel: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,20}$/),
        brumaLabel: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,20}$/),
      }),
      ({ atlasLabel, lumenLabel, brumaLabel }) => {
        const raw = [
          { id: 'aurora/atlas', label: atlasLabel, ownerId: 'aurora', projects: ['demo/observatorio', 'demo/archivo'] },
          { id: 'aurora/lumen', label: lumenLabel, ownerId: 'aurora', projects: ['demo/observatorio'] },
          { id: 'marea/bruma', label: brumaLabel, ownerId: 'marea', projects: ['demo/observatorio'] },
        ];
        const copy = structuredClone(raw);
        const res1 = validateAgentDirectory(raw, demoPolicy);
        const res2 = validateAgentDirectory(raw, demoPolicy);

        assert.deepEqual(res1, res2);
        assert.deepEqual(raw, copy); // no muta la entrada
      }
    )
  );
});

test('propiedad: heartbeat exige secuencias monótonas crecientes', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 0, max: 10000 }),
      (seq1, seq2) => {
        const registry = createPresenceRegistry({ directory, policy: demoPolicy });
        const agentId = 'aurora/atlas';
        const projectId = 'demo/observatorio';

        registry.heartbeat({ agentId, projectId, sequence: seq1 });

        if (seq2 > seq1) {
          const res = registry.heartbeat({ agentId, projectId, sequence: seq2 });
          assert.equal(res.status, 'online');
        } else {
          assert.throws(
            () => registry.heartbeat({ agentId, projectId, sequence: seq2 }),
            err => err && err.code === 'PRESENCE_CONFLICT'
          );
        }
      }
    )
  );
});

test('propiedad: revocación de agente o proyecto es irreversible y bloquea accesos', () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: 1001, max: 2000 }),
      (revokeAgentFirst, seq1, seq2) => {
        const registry = createPresenceRegistry({ directory, policy: demoPolicy });
        registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: seq1 });

        if (revokeAgentFirst) {
          registry.revokeAgent('aurora/atlas');
          assert.throws(
            () => registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: seq2 }),
            err => err && err.code === 'PRESENCE_FORBIDDEN'
          );
        } else {
          registry.revokeProject('demo/observatorio');
          assert.throws(
            () => registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: seq2 }),
            err => err && err.code === 'PRESENCE_FORBIDDEN'
          );
          assert.throws(
            () => registry.snapshot({ memberId: 'aurora', projectId: 'demo/observatorio' }),
            err => err && err.code === 'PRESENCE_FORBIDDEN'
          );
        }
      }
    )
  );
});

test('propiedad: snapshot filtra por proyecto y autoriza solo lectores del proyecto', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('demo/observatorio', 'demo/archivo'),
      fc.constantFrom('aurora', 'marea'),
      (projectId, memberId) => {
        const registry = createPresenceRegistry({ directory, policy: demoPolicy });
        const project = demoPolicy.projects.find(p => p.repo === projectId);
        const isAllowed = project.readers.includes(memberId);

        if (!isAllowed) {
          assert.throws(
            () => registry.snapshot({ memberId, projectId }),
            err => err && err.code === 'PRESENCE_FORBIDDEN'
          );
        } else {
          const list = registry.snapshot({ memberId, projectId });
          assert(Array.isArray(list));
          for (const item of list) {
            const agentDef = directory.find(a => a.id === item.id);
            assert(agentDef.projects.includes(projectId));
          }
        }
      }
    )
  );
});

test('propiedad: TTL expira determinísticamente (online -> stale -> offline)', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1000, max: 1000000 }),
      fc.integer({ min: 1000, max: 10000 }),
      fc.integer({ min: 10001, max: 30000 }),
      fc.integer({ min: 0, max: 50000 }),
      (t0, onlineFor, ttl, delta) => {
        let currentTime = t0;
        const registry = createPresenceRegistry({
          directory,
          policy: demoPolicy,
          now: () => currentTime,
          onlineFor,
          ttl,
        });

        registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: 1 });

        currentTime = t0 + delta;
        const list = registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' });
        const atlas = list.find(a => a.id === 'aurora/atlas');

        if (delta <= onlineFor) {
          assert.equal(atlas.status, 'online');
          assert.equal(atlas.seenAt, t0);
        } else if (delta <= ttl) {
          assert.equal(atlas.status, 'stale');
          assert.equal(atlas.seenAt, t0);
        } else {
          assert.equal(atlas.status, 'offline');
          assert.equal(atlas.seenAt, t0);
        }
      }
    )
  );
});

test('propiedad: la revocación propaga inmediatamente a lecturas posteriores de snapshot', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('aurora/atlas', 'aurora/lumen', 'marea/bruma'),
      (agentToRevoke) => {
        const registry = createPresenceRegistry({ directory, policy: demoPolicy });
        registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: 1 });
        registry.heartbeat({ agentId: 'aurora/lumen', projectId: 'demo/observatorio', sequence: 1 });
        registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/observatorio', sequence: 1 });

        registry.revokeAgent(agentToRevoke);

        const snapshot = registry.snapshot({ memberId: 'aurora', projectId: 'demo/observatorio' });
        const item = snapshot.find(a => a.id === agentToRevoke);
        assert.equal(item.status, 'offline');
        assert.equal(item.seenAt, null);

        for (const other of snapshot.filter(a => a.id !== agentToRevoke)) {
          assert.equal(other.status, 'online');
        }
      }
    )
  );
});
