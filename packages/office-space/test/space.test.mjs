import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceState, applySpaceCommand, spaceView, validateSpaceState, LIMITS } from '../src/space.mjs';

import { context, create, place } from './fixtures.mjs';

const command = (type, revision, extra = {}) => ({ type, idempotency_key: type, expected_revision: revision, ...extra });
const apply = (s, cmd, ctx = context()) => applySpaceCommand(s, cmd, ctx).state;
const initial = () => createSpaceState('demo/shared');
const ready = () => apply(initial(), create());
const rejects = (run, code) => assert.throws(run, (error) => error.code === code && error.message === code);

test('two owners can edit common rooms; visitors cannot edit another personal room', () => {
  let state = ready(); state = apply(state, create('personal', 'private-a', 'personal'));
  state = apply(state, place(), context('team-b'));
  assert.equal(state.rooms[0].items.length, 1);
  assert.equal(spaceView(state, context('team-b')).rooms.length, 2);
  rejects(() => apply(state, place('intruder', 1, { room_id: 'private-a' }), context('team-b')), 'FORBIDDEN');
  assert.equal(state.rooms[1].owner_id, 'team-a');
});
test('concurrent edits conflict explicitly, preserving the first edit and input state', () => {
  const state = ready(), copy = structuredClone(state);
  const one = apply(state, place('a'));
  rejects(() => apply(one, place('b'), context('team-b')), 'REVISION_CONFLICT');
  assert.deepEqual(state, copy);
  const two = apply(one, place('b', 2, { x: 5 }), context('team-b'));
  assert.deepEqual(two.rooms[0].items.map((i) => i.id), ['a', 'b']);
});
test('independent room revisions do not conflict', () => {
  let state = ready(); state = apply(state, create('second', 'second'));
  state = apply(state, place()); state = apply(state, place('second-item', 1, { room_id: 'second' }));
  assert.equal(state.rooms[1].revision, 2);
});
test('idempotent retries ignore key order, preserve current state and return original receipt', () => {
  const cmd = create(), result = applySpaceCommand(initial(), cmd, context());
  const state = apply(result.state, place());
  const reverse = Object.fromEntries(Object.entries(cmd).reverse());
  const replay = applySpaceCommand(state, reverse, context());
  assert.equal(replay.duplicate, true); assert.deepEqual(replay.receipt, result.receipt);
  assert.deepEqual(replay.state, state); assert.notEqual(replay.state, state);
  rejects(() => apply(state, { ...cmd, label: 'Different' }), 'IDEMPOTENCY_CONFLICT');
  rejects(() => apply(state, cmd, context('team-b', { actor_id: context().actor_id })), 'FORBIDDEN');
});
test('idempotency keys are namespaced by authenticated actor', () => {
  let state = ready(); state = apply(state, create('create', 'b-room'), context('team-b'));
  assert.equal(state.rooms.length, 2);
});
test('common edits require their own permission, including retries', () => {
  const state = ready(), ctx = context('team-a', { capabilities: ['space.read', 'space.edit'] });
  rejects(() => apply(state, create(), ctx), 'FORBIDDEN');
  assert.equal(apply(initial(), create('own', 'own', 'personal'), ctx).rooms[0].owner_id, 'team-a');
});

for (const [name, overrides, code] of [
  ['project isolation', { project_id: 'demo/other' }, 'FORBIDDEN'],
  ['agent is not a human avatar', { kind: 'agent' }, 'FORBIDDEN'],
  ['read denied', { capabilities: [] }, 'FORBIDDEN'],
  ['edit denied', { capabilities: ['space.read'] }, 'FORBIDDEN'],
  ['missing revocation guard', { assertAuthorized: undefined }, 'INVALID_CONTEXT'],
  ['revoked guard', { assertAuthorized: () => false }, 'ACCESS_REVOKED'],
  ['guard failure sanitized', { assertAuthorized: () => { throw new Error('/secret/path'); } }, 'ACCESS_REVOKED'],
  ['async guard rejected', { assertAuthorized: async () => true }, 'INVALID_CONTEXT'],
  ['aborted connection', { signal: AbortSignal.abort() }, 'ACCESS_REVOKED'],
  ['invalid clock', { now: NaN }, 'INVALID_CONTEXT'],
]) test(name, () => rejects(() => apply(initial(), create(), context('team-a', overrides)), code));

test('read-only view is detached and does not expose receipts or idempotency keys', () => {
  const state = ready(), view = spaceView(state, context('team-b', { capabilities: ['space.read'] }));
  assert.equal(view.receipts, undefined); assert.equal(view.retired_rooms, undefined);
  view.rooms[0].label = 'Mutated'; assert.notEqual(state.rooms[0].label, 'Mutated');
  rejects(() => spaceView(state, context('team-b', { project_id: 'other' })), 'FORBIDDEN');
});

for (const [name, overrides] of [
  ['unknown field', { owner_id: 'team-b' }], ['unknown type', { type: 'shell.run' }],
  ['missing string id', { room_id: null }], ['path traversal id', { room_id: '../private' }],
  ['too long id', { idempotency_key: 'a'.repeat(65) }], ['negative revision', { expected_revision: -1 }],
  ['fractional revision', { expected_revision: 0.5 }], ['too wide', { width: 65 }],
  ['too small', { width: 3 }], ['fractional size', { height: 4.5 }],
  ['wrong scope', { scope: 'public' }], ['empty label', { label: '' }],
  ['HTML label', { label: '<script>' }], ['control characters', { label: 'a\nb' }],
  ['bidi label', { label: 'a\u202Eb' }], ['oversized label', { label: 'a'.repeat(81) }],
]) test(`strict commands: ${name}`, () => rejects(() => apply(initial(), { ...create(), ...overrides }), 'INVALID_INPUT'));

test('accessor and symbol fields are rejected without invoking getters', () => {
  const cmd = create(); Object.defineProperty(cmd, 'type', { get() { throw new Error('getter executed'); } });
  rejects(() => apply(initial(), cmd), 'INVALID_INPUT');
  rejects(() => apply(initial(), { ...create(), [Symbol('secret')]: 'x' }), 'INVALID_INPUT');
  rejects(() => apply(initial(), Object.assign(Object.create(null), create())), 'INVALID_INPUT');
});

test('room update respects revisions and rejects clipping occupied cells', () => {
  let state = apply(ready(), place('edge', 1, { x: 6, y: 6 }));
  const resize = command('room.update', 2, { room_id: 'common', width: 4, height: 4, label: 'Nueva sala' });
  rejects(() => apply(state, resize), 'ROOM_NOT_EMPTY');
  state = apply(state, { ...resize, width: 10, height: 10 });
  assert.equal(state.rooms[0].width, 10);
});
test('delete requires empty room; retired room ids and duplicate delete are safe', () => {
  const deleted = apply(ready(), command('room.delete', 1, { room_id: 'common' }));
  assert.equal(deleted.rooms.length, 0);
  rejects(() => apply(deleted, create('recreate')), 'RESOURCE_EXISTS');
  assert.equal(applySpaceCommand(deleted, command('room.delete', 1, { room_id: 'common' }), context()).duplicate, true);
  rejects(() => apply(apply(ready(), place()), command('room.delete', 2, { room_id: 'common' })), 'ROOM_NOT_EMPTY');
});

for (const [name, overrides, code] of [
  ['doorway', { x: 0, y: 0 }, 'POSITION_BLOCKED'], ['right boundary', { x: 7 }, 'POSITION_BLOCKED'],
  ['rotation boundary', { x: 2, y: 7, rotation: 90 }, 'POSITION_BLOCKED'],
  ['unknown object', { kind: 'constructor' }, 'INVALID_INPUT'], ['bad angle', { rotation: 45 }, 'INVALID_INPUT'],
  ['fractional grid', { x: 1.5 }, 'INVALID_INPUT'], ['negative grid', { x: -1 }, 'INVALID_INPUT'],
]) test(`furniture: ${name}`, () => rejects(() => apply(ready(), place('item', 1, overrides)), code));

test('rotation, overlap, movement and removal are validated against full geometry', () => {
  let state = apply(ready(), place('desk', 1, { x: 7, y: 2, rotation: 90 }));
  rejects(() => apply(state, place('plant', 2, { x: 7, y: 3, kind: 'plant' })), 'POSITION_BLOCKED');
  state = apply(state, command('furniture.move', 2, { room_id: 'common', item_id: 'desk', x: 3, y: 3, rotation: 0 }));
  assert.equal(state.rooms[0].items[0].x, 3);
  state = apply(state, command('furniture.remove', 3, { room_id: 'common', item_id: 'desk' }));
  assert.equal(state.rooms[0].items.length, 0);
});
test('avatar movement is actor-owned and uses separate per-avatar revisions', () => {
  const move = command('avatar.move', 0, { room_id: 'common', x: 0, y: 0 });
  let state = apply(ready(), move); state = apply(state, move, context('team-b'));
  assert.equal(state.avatars.length, 2); assert.equal(state.rooms[0].revision, 1);
  rejects(() => apply(state, { ...move, idempotency_key: 'stale' }), 'REVISION_CONFLICT');
  rejects(() => apply(state, { ...move, actor_id: 'team-b:human' }), 'INVALID_INPUT');
  state = apply(state, command('avatar.leave', 1));
  assert.equal(state.avatars[0].room_id, null); assert.equal(state.avatars[1].room_id, 'common');
  rejects(() => apply(state, { ...move, idempotency_key: 'stale2' }), 'REVISION_CONFLICT');
});
test('visitors can enter a personal game room without gaining edit authority', () => {
  const state = apply(initial(), create('own', 'own', 'personal'));
  const next = apply(state, command('avatar.move', 0, { room_id: 'own', x: 0, y: 0 }), context('team-b'));
  assert.equal(next.avatars[0].owner_id, 'team-b');
});
test('avatar and furniture prevent placing into each other, deletion and clipping', () => {
  let state = apply(ready(), command('avatar.move', 0, { room_id: 'common', x: 7, y: 7 }));
  rejects(() => apply(state, place('occupied', 1, { kind: 'plant', x: 7, y: 7 })), 'POSITION_BLOCKED');
  rejects(() => apply(state, command('room.delete', 1, { room_id: 'common' })), 'ROOM_NOT_EMPTY');
  rejects(() => apply(state, command('room.update', 1, { room_id: 'common', label: 'Room', width: 4, height: 4 })), 'ROOM_NOT_EMPTY');
  state = apply(state, place());
  rejects(() => apply(state, { ...command('avatar.move', 1, { room_id: 'common', x: 2, y: 2 }), idempotency_key: 'blocked' }), 'POSITION_BLOCKED');
});

for (const [name, mutate] of [
  ['schema', (s) => s.schema_version++], ['extra field', (s) => s.secret = true],
  ['missing receipt', (s) => s.receipts.pop()], ['duplicate room', (s) => s.rooms.push(s.rooms[0])],
  ['invalid room label', (s) => s.rooms[0].label = ''], ['invalid room owner', (s) => s.rooms[0].owner_id = 'x'],
  ['invalid revision', (s) => s.rooms[0].revision = 100], ['wrong event', (s) => s.events[0].type = 'exec'],
  ['invalid receipt owner', (s) => s.receipts[0].owner_id = null], ['invalid digest', (s) => s.receipts[0].hash = 'bad'],
]) test(`invalid persisted state: ${name}`, () => {
  const state = ready(); mutate(state); rejects(() => validateSpaceState(state), 'CORRUPT_STATE');
});
test('bounded journal fails closed without forgetting receipts, with visible remaining capacity', () => {
  const state = initial(); state.revision = LIMITS.receipts;
  state.receipts = Array.from({ length: LIMITS.receipts }, (_, i) => ({ actor_id: 'a', owner_id: 'a', key: `key-${i}`,
    hash: 'a'.repeat(64), result: { revision: i + 1, resource_revision: 1 } }));
  state.events = Array.from({ length: LIMITS.events }, (_, i) => ({ revision: LIMITS.receipts - LIMITS.events + i + 1,
    type: 'avatar.leave', actor_id: 'a', room_id: null, at: 0 }));
  validateSpaceState(state); assert.equal(spaceView(state, context()).capacity.commands_remaining, 0);
  rejects(() => apply(state, create()), 'CAPACITY_EXCEEDED');
});
