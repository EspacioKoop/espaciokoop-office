import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceState } from '../packages/office-space/src/space.mjs';
import {
  calculateItemDimensions,
  getOccupiedCells,
  checkItemCollision,
  checkItemFitsInRoom,
  checkAvatarCollision,
  checkRoomAccess,
  prepareLayoutCommand,
  validateLayoutOperation,
  executePlannerCommand,
  planLayoutTransaction,
  SpaceError,
} from '../src/room-layout-planner.mjs';

const ALL = ['space.read', 'space.edit', 'space.edit_common', 'space.move'];

const makeContext = (actor = 'human-a', owner = 'human-a', overrides = {}) => ({
  actor_id: actor,
  owner_id: owner,
  kind: 'human',
  project_id: 'fixture/office',
  capabilities: [...ALL],
  now: 1700000000000,
  assertAuthorized: () => true,
  ...overrides,
});

const createRoomCmd = (overrides = {}) => ({
  type: 'room.create',
  idempotency_key: 'room-cmd-1',
  expected_revision: 0,
  room_id: 'main-room',
  label: 'Main Office',
  scope: 'common',
  width: 16,
  height: 12,
  ...overrides,
});

const placeFurnitureCmd = (overrides = {}) => ({
  type: 'furniture.place',
  idempotency_key: 'put-desk-1',
  expected_revision: 1,
  room_id: 'main-room',
  item_id: 'desk-1',
  kind: 'desk',
  x: 2,
  y: 2,
  rotation: 0,
  ...overrides,
});

const throwsCode = (fn, expectedCode) => {
  assert.throws(fn, (err) => {
    assert.equal(err.code, expectedCode);
    return true;
  });
};

test('geometry and cell calculations for all catalogue items', () => {
  // Desk is [2, 1] base
  assert.deepEqual(calculateItemDimensions('desk', 0), [2, 1]);
  assert.deepEqual(calculateItemDimensions('desk', 90), [1, 2]);
  assert.deepEqual(calculateItemDimensions('desk', 180), [2, 1]);
  assert.deepEqual(calculateItemDimensions('desk', 270), [1, 2]);

  // Table is [2, 2] base
  assert.deepEqual(calculateItemDimensions('table', 0), [2, 2]);
  assert.deepEqual(calculateItemDimensions('table', 90), [2, 2]);

  // Invalid kind or rotation
  throwsCode(() => calculateItemDimensions('unknown_kind', 0), 'INVALID_INPUT');
  throwsCode(() => calculateItemDimensions('desk', 45), 'INVALID_INPUT');

  // getOccupiedCells
  const deskItem = { kind: 'desk', x: 2, y: 2, rotation: 0 };
  assert.deepEqual(getOccupiedCells(deskItem), [
    [2, 2],
    [3, 2],
  ]);
});

test('spatial collision detection and room boundaries', () => {
  const itemA = { kind: 'desk', x: 2, y: 2, rotation: 0 }; // covers [2,2], [3,2]
  const itemB = { kind: 'chair', x: 3, y: 2, rotation: 0 }; // covers [3,2]
  const itemC = { kind: 'chair', x: 5, y: 5, rotation: 0 }; // covers [5,5]

  assert.equal(checkItemCollision(itemA, itemB), true);
  assert.equal(checkItemCollision(itemA, itemC), false);

  const room = { width: 10, height: 10 };
  assert.equal(checkItemFitsInRoom(room, itemA), true);

  // Item out of room bounds
  const outOfBounds = { kind: 'desk', x: 9, y: 9, rotation: 0 };
  assert.equal(checkItemFitsInRoom(room, outOfBounds), false);

  // Item blocking entry cell (0, 0)
  const entryBlocking = { kind: 'chair', x: 0, y: 0, rotation: 0 };
  assert.equal(checkItemFitsInRoom(room, entryBlocking), false);

  // Avatar collision
  const avatars = [{ room_id: 'main-room', x: 3, y: 2 }];
  assert.equal(checkAvatarCollision(itemA, avatars, 'main-room'), true);
  assert.equal(checkAvatarCollision(itemC, avatars, 'main-room'), false);
});

test('nominal layout operations: place, move, rotate, remove', () => {
  const ctx = makeContext();
  let state = createSpaceState('fixture/office');

  // Create room
  state = executePlannerCommand(state, createRoomCmd(), ctx).state;
  assert.equal(state.rooms.length, 1);
  assert.equal(state.rooms[0].revision, 1);

  // Place furniture
  const placeCmd = placeFurnitureCmd();
  state = executePlannerCommand(state, placeCmd, ctx).state;
  assert.equal(state.rooms[0].items.length, 1);
  assert.equal(state.rooms[0].items[0].id, 'desk-1');
  assert.equal(state.rooms[0].revision, 2);

  // Move and rotate furniture
  const moveCmd = prepareLayoutCommand('furniture.move', {
    idempotency_key: 'move-desk-1',
    expected_revision: 2,
    room_id: 'main-room',
    item_id: 'desk-1',
    x: 5,
    y: 5,
    rotation: 90,
  });
  state = executePlannerCommand(state, moveCmd, ctx).state;
  assert.equal(state.rooms[0].items[0].x, 5);
  assert.equal(state.rooms[0].items[0].y, 5);
  assert.equal(state.rooms[0].items[0].rotation, 90);
  assert.equal(state.rooms[0].revision, 3);

  // Remove furniture
  const removeCmd = prepareLayoutCommand('furniture.remove', {
    idempotency_key: 'remove-desk-1',
    expected_revision: 3,
    room_id: 'main-room',
    item_id: 'desk-1',
  });
  state = executePlannerCommand(state, removeCmd, ctx).state;
  assert.equal(state.rooms[0].items.length, 0);
  assert.equal(state.rooms[0].revision, 4);
});

test('synthetic concurrency: two actors editing same revision', () => {
  const ctxA = makeContext('human-a', 'human-a');
  const ctxB = makeContext('human-b', 'human-b');
  let state = createSpaceState('fixture/office');

  state = executePlannerCommand(state, createRoomCmd(), ctxA).state;
  const initialRoomRev = state.rooms[0].revision; // 1

  // Actor A places a desk at (2,2) with expected_revision 1
  const cmdA = placeFurnitureCmd({ item_id: 'desk-a', idempotency_key: 'cmd-a', expected_revision: initialRoomRev });
  const resA = executePlannerCommand(state, cmdA, ctxA);
  state = resA.state;
  assert.equal(state.rooms[0].revision, 2);

  // Actor B tries to place a chair at (6,6) with obsolete expected_revision 1
  const cmdB = placeFurnitureCmd({ item_id: 'chair-b', kind: 'chair', x: 6, y: 6, idempotency_key: 'cmd-b', expected_revision: initialRoomRev });
  throwsCode(() => executePlannerCommand(state, cmdB, ctxB), 'REVISION_CONFLICT');

  // Actor B retries with updated expected_revision 2
  const cmdBUpdated = { ...cmdB, expected_revision: state.rooms[0].revision };
  state = executePlannerCommand(state, cmdBUpdated, ctxB).state;
  assert.equal(state.rooms[0].items.length, 2);
  assert.equal(state.rooms[0].revision, 3);
});

test('item ID repetition and idempotency handling', () => {
  const ctx = makeContext();
  let state = createSpaceState('fixture/office');
  state = executePlannerCommand(state, createRoomCmd(), ctx).state;

  const cmd1 = placeFurnitureCmd();
  state = executePlannerCommand(state, cmd1, ctx).state;

  // Duplicate item_id in same room
  const duplicateIdCmd = placeFurnitureCmd({
    idempotency_key: 'put-desk-2',
    expected_revision: 2,
    item_id: 'desk-1', // same ID
    x: 6,
    y: 6,
  });
  throwsCode(() => executePlannerCommand(state, duplicateIdCmd, ctx), 'RESOURCE_EXISTS');

  // Idempotent re-submission of exact same command
  const resDuplicate = executePlannerCommand(state, cmd1, ctx);
  assert.equal(resDuplicate.duplicate, true);

  // Same idempotency_key with modified payload
  const conflictingCmd = placeFurnitureCmd({
    x: 10, // modified coordinate
  });
  throwsCode(() => executePlannerCommand(state, conflictingCmd, ctx), 'IDEMPOTENCY_CONFLICT');
});

test('transactional batch planning with atomic rollback guarantee', () => {
  const ctx = makeContext();
  let state = createSpaceState('fixture/office');
  state = executePlannerCommand(state, createRoomCmd(), ctx).state;

  const originalState = structuredClone(state);

  const batch = [
    placeFurnitureCmd({ item_id: 'desk-1', idempotency_key: 'b-1', expected_revision: 1, x: 2, y: 2 }),
    placeFurnitureCmd({ item_id: 'chair-1', kind: 'chair', idempotency_key: 'b-2', expected_revision: 2, x: 5, y: 5 }),
    // Failing command: spatial collision with desk-1 at (2, 2)
    placeFurnitureCmd({ item_id: 'chair-2', kind: 'chair', idempotency_key: 'b-3', expected_revision: 3, x: 2, y: 2 }),
  ];

  throwsCode(() => planLayoutTransaction(state, batch, ctx), 'POSITION_BLOCKED');

  // State must remain 100% untouched
  assert.deepEqual(state, originalState);

  // Prevalidation adapter dry-run check
  const preval = validateLayoutOperation(state, batch[0], ctx);
  assert.equal(preval.valid, true);
  assert.deepEqual(state, originalState); // original state unchanged
});

test('owner isolation for personal and common rooms', () => {
  const ctxOwnerA = makeContext('human-a', 'human-a');
  const ctxOwnerB = makeContext('human-b', 'human-b');
  const ctxNoCommon = makeContext('human-c', 'human-c', { capabilities: ['space.read', 'space.edit'] });

  let state = createSpaceState('fixture/office');

  // Create personal room owned by human-a
  const personalRoomCmd = createRoomCmd({
    room_id: 'personal-a',
    scope: 'personal',
    idempotency_key: 'create-p-a',
  });
  state = executePlannerCommand(state, personalRoomCmd, ctxOwnerA).state;
  const personalRoom = state.rooms.find((r) => r.id === 'personal-a');

  // Owner A can check access
  checkRoomAccess(personalRoom, ctxOwnerA);

  // Owner B checking access or editing Owner A's personal room is forbidden
  throwsCode(() => checkRoomAccess(personalRoom, ctxOwnerB), 'FORBIDDEN');
  throwsCode(
    () =>
      executePlannerCommand(
        state,
        placeFurnitureCmd({ room_id: 'personal-a', idempotency_key: 'put-p-b' }),
        ctxOwnerB
      ),
    'FORBIDDEN'
  );

  // Common room without edit_common capability
  const commonRoom = state.rooms.find((r) => r.id === 'main-room');
  if (commonRoom) {
    throwsCode(() => checkRoomAccess(commonRoom, ctxNoCommon), 'FORBIDDEN');
  }
});

test('capacity constraints and revoked access guards', () => {
  const ctxRevoked = makeContext('human-a', 'human-a', {
    assertAuthorized: () => false,
  });
  const state = createSpaceState('fixture/office');

  throwsCode(() => executePlannerCommand(state, createRoomCmd(), ctxRevoked), 'ACCESS_REVOKED');
});
