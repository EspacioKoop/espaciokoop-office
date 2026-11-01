import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openAgencyQueue } from '../src/agency-queue.mjs';

test('cola durable: idempotencia, aislamiento y resultado comunicado por el llamador', () => {
  const directory = mkdtempSync(join(tmpdir(), 'office-queue-'));
  let queue;
  try {
    queue = openAgencyQueue({ directory });
    const request = { owner: 'owner-a', operation: 'op-1', title: 'Tarea', instruction: 'Revisar', connector: 'connector-a' };
    const { id } = queue.enqueue(request);
    queue.close(); queue = openAgencyQueue({ directory });
    assert.deepEqual(queue.enqueue(request), { id, duplicate: true });
    assert.throws(() => queue.enqueue({ ...request, title: 'Otro' }), { code: 'IDEMPOTENCY_CONFLICT' });
    assert.throws(() => queue.read('owner-b', id), { code: 'FORBIDDEN' });
    assert.equal(queue.claim({ owner: 'owner-b', connector: 'connector-a' }), null);
    const lease = queue.claim({ owner: 'owner-a', connector: 'connector-a' });
    assert.equal(lease.id, id);
    assert.throws(() => queue.finish({ owner: 'owner-b', connector: 'connector-a', id, lease: lease.lease, state: 'succeeded', summary: 'ok', artifact_id: 'artifact' }), { code: 'FORBIDDEN' });
    queue.finish({ owner: 'owner-a', connector: 'connector-a', id, lease: lease.lease, state: 'succeeded', summary: 'ok', artifact_id: 'artifact' });
    assert.equal(queue.read('owner-a', id).status, 'succeeded');
    assert.equal(queue.claim({ owner: 'owner-a', connector: 'connector-a' }), null);
  } finally { queue?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('lease caducado queda desconocido y no se ejecuta otra vez tras reinicio', () => {
  const directory = mkdtempSync(join(tmpdir(), 'office-queue-'));
  let clock = 1000; let queue;
  try {
    queue = openAgencyQueue({ directory, now: () => clock });
    const { id } = queue.enqueue({ owner: 'owner-a', operation: 'op-1', title: 'Tarea', instruction: 'Revisar', connector: 'connector-a' });
    const lease = queue.claim({ owner: 'owner-a', connector: 'connector-a', leaseMs: 1000 });
    clock += 1001;
    assert.throws(() => queue.heartbeat({ owner: 'owner-a', connector: 'connector-a', id, lease: lease.lease }), { code: 'LEASE_CONFLICT' });
    queue.close(); queue = openAgencyQueue({ directory, now: () => clock });
    assert.equal(queue.read('owner-a', id).status, 'unknown');
    assert.equal(queue.claim({ owner: 'owner-a', connector: 'connector-a' }), null);
  } finally { queue?.close(); rmSync(directory, { recursive: true, force: true }); }
});
