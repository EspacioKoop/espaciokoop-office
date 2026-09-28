import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpaceFileStore } from '../src/store.mjs';

// Evaluation only: both handles represent the SAME backend, not client-side files.
// No real agents, network connections, credentials or inference are used.
const project_id = 'fixture/shared-office';
const directory = await mkdtemp(join(tmpdir(), 'office-space-demo-'));
const actor = (id) => ({ actor_id: id, owner_id: id, kind: 'human', project_id,
  capabilities: ['space.read', 'space.edit', 'space.edit_common', 'space.move'],
  now: 1700000000000, assertAuthorized: () => true });
const a = actor('fixture-owner-a'), b = actor('fixture-owner-b');
const room = { type: 'room.create', idempotency_key: 'room-1', expected_revision: 0,
  room_id: 'shared', label: 'Taller compartido', scope: 'common', width: 16, height: 12 };
try {
  const backend = new SpaceFileStore({ directory, project_id });
  await backend.apply(room, a);
  const desk = { type: 'furniture.place', idempotency_key: 'desk-1', expected_revision: 1,
    room_id: 'shared', item_id: 'desk-a', kind: 'desk', x: 3, y: 3, rotation: 0 };
  await backend.apply(desk, a);
  let conflict;
  try { await backend.apply({ ...desk, item_id: 'desk-b', x: 8 }, b); }
  catch (error) { conflict = error.code; }
  assert.equal(conflict, 'REVISION_CONFLICT');
  await backend.apply({ ...desk, item_id: 'desk-b', x: 8, expected_revision: 2 }, b);
  const move = { type: 'avatar.move', idempotency_key: 'move-1', expected_revision: 0, room_id: 'shared', x: 1, y: 1 };
  await backend.apply(move, a); await backend.apply({ ...move, x: 10 }, b);
  const restored = new SpaceFileStore({ directory, project_id });
  assert.deepEqual(await restored.read(a), await restored.read(b));
  const replay = await restored.apply(room, a), view = await restored.read(a);
  assert.equal(replay.duplicate, true);
  console.log(JSON.stringify({ mode: 'synthetic-only', remote_transport: 'not_connected', project_id,
    revision: view.revision, rooms: view.rooms.length, furniture: view.rooms[0].items.length,
    avatars: view.avatars.length, conflict, duplicate_after_restore: replay.duplicate,
    note: 'La posición guardada no demuestra presencia; integración remota y UI pendientes.' }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
