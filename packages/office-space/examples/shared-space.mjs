import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSpaceStore } from '../src/store.mjs';

// Synthetic actors. Authentication belongs to the host, not to this demonstration.
const actor = (owner) => ({ actor_id: `${owner}:human`, owner_id: owner, kind: 'human',
  project_id: 'demo/shared', now: 123456, capabilities: ['space.read', 'space.edit', 'space.edit_common', 'space.move'],
  assertAuthorized() {} });
const directory = await mkdtemp(join(tmpdir(), 'office-space-demo-'));
try {
  const first = await openSpaceStore({ directory, project_id: 'demo/shared' });
  const second = await openSpaceStore({ directory, project_id: 'demo/shared' });
  const create = { type: 'room.create', idempotency_key: 'create', expected_revision: 0,
    room_id: 'common', scope: 'common', label: 'Sala de encuentro', width: 8, height: 8 };
  await first.execute(create, actor('team-a'));
  await first.execute({ ...create, idempotency_key: 'personal', room_id: 'personal-a', scope: 'personal', label: 'Sala propia' }, actor('team-a'));
  const desk = { type: 'furniture.place', idempotency_key: 'desk', expected_revision: 1,
    room_id: 'common', item_id: 'desk', kind: 'desk', x: 2, y: 2, rotation: 0 };
  await first.execute(desk, actor('team-a'));
  const plant = { ...desk, idempotency_key: 'plant', item_id: 'plant', kind: 'plant', x: 6, y: 6 };
  await assert.rejects(() => second.execute(plant, actor('team-b')), { code: 'REVISION_CONFLICT' });
  await second.execute({ ...plant, expected_revision: 2 }, actor('team-b'));
  await assert.rejects(() => second.execute({ ...desk, idempotency_key: 'denied', room_id: 'personal-a' }, actor('team-b')), { code: 'FORBIDDEN' });
  for (const team of ['team-a', 'team-b']) await second.execute({ type: 'avatar.move', idempotency_key: 'enter',
    expected_revision: 0, room_id: 'common', x: 0, y: 0 }, actor(team));
  const restarted = await openSpaceStore({ directory, project_id: 'demo/shared' });
  const retry = await restarted.execute(desk, actor('team-a'));
  assert.equal(retry.duplicate, true); assert.equal(retry.view.rooms[0].items.length, 2);
  console.log(JSON.stringify({ mode: 'synthetic-module-demo', rooms: retry.view.rooms.length,
    furniture_in_common_room: retry.view.rooms[0].items.length, saved_avatar_positions: retry.view.avatars.length,
    stale_edit_rejected: true, unauthorized_edit_rejected: true, retry_after_restart_deduplicated: true,
    remote_transport_connected: false, production_agents_connected: false }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
