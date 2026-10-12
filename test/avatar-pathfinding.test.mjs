import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findPath,
  isTileWalkable,
  resolveKeyboardMove,
  validateRoomAccess,
  getItemDimensions,
  DEFAULT_CATALOGUE,
  KEY_MAPPINGS,
} from '../src/avatar-pathfinding.mjs';

function createSampleRoom(overrides = {}) {
  return {
    id: 'room-1',
    width: 10,
    height: 10,
    scope: 'common',
    owner_id: null,
    items: [],
    avatars: [],
    ...overrides,
  };
}

test('avatar-pathfinding: dimensions of furniture catalog items', () => {
  assert.deepEqual(getItemDimensions({ kind: 'desk', rotation: 0 }), [2, 1]);
  assert.deepEqual(getItemDimensions({ kind: 'desk', rotation: 90 }), [1, 2]);
  assert.deepEqual(getItemDimensions({ kind: 'table', rotation: 0 }), [2, 2]);
  assert.deepEqual(getItemDimensions({ kind: 'chair', rotation: 0 }), [1, 1]);
  assert.deepEqual(getItemDimensions({ kind: 'unknown', rotation: 0 }), [1, 1]);
});

test('avatar-pathfinding: isTileWalkable boundaries and obstacles', () => {
  const room = createSampleRoom({
    items: [
      { id: 'desk-1', kind: 'desk', x: 2, y: 2, rotation: 0 }, // occupies (2,2) and (3,2)
    ],
    avatars: [
      { actor_id: 'alice', x: 5, y: 5 },
    ],
  });

  // In bounds and empty
  assert.equal(isTileWalkable(room, 0, 0), true);
  assert.equal(isTileWalkable(room, 1, 1), true);

  // Out of bounds
  assert.equal(isTileWalkable(room, -1, 0), false);
  assert.equal(isTileWalkable(room, 0, -1), false);
  assert.equal(isTileWalkable(room, 10, 0), false);
  assert.equal(isTileWalkable(room, 0, 10), false);
  assert.equal(isTileWalkable(room, 1.5, 2), false);

  // Furniture collision
  assert.equal(isTileWalkable(room, 2, 2), false);
  assert.equal(isTileWalkable(room, 3, 2), false);
  assert.equal(isTileWalkable(room, 4, 2), true);

  // Avatar collision
  assert.equal(isTileWalkable(room, 5, 5), false);
  assert.equal(isTileWalkable(room, 5, 5, { ignoreAvatars: true }), true);
  assert.equal(isTileWalkable(room, 5, 5, { actorId: 'alice' }), true);
  assert.equal(isTileWalkable(room, 5, 5, { actorId: 'bob' }), false);
});

test('avatar-pathfinding: nominal pathfinding and cost calculation', () => {
  const room = createSampleRoom();
  const start = { x: 0, y: 0 };
  const target = { x: 0, y: 4 };

  const result = findPath(room, start, target);

  assert.equal(result.found, true);
  assert.equal(result.steps, 4);
  assert.equal(result.cost, 4);
  assert.equal(result.reducedMobility, true);
  assert.equal(result.path.length, 5);

  assert.deepEqual(result.path[0], { x: 0, y: 0 });
  assert.deepEqual(result.path[4], { x: 0, y: 4 });

  // Verify adjacent orthogonal movement without teleportation
  for (let i = 1; i < result.path.length; i++) {
    const prev = result.path[i - 1];
    const curr = result.path[i];
    const dist = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
    assert.equal(dist, 1, 'Each step must be orthogonally adjacent');
  }
});

test('avatar-pathfinding: pathfinding around obstacles', () => {
  const room = createSampleRoom({
    items: [
      // Wall barrier from y=0 to y=3 at x=2
      { id: 'board-1', kind: 'board', x: 2, y: 0, rotation: 0 }, // (2,0), (3,0)
      { id: 'board-2', kind: 'board', x: 2, y: 1, rotation: 0 }, // (2,1), (3,1)
      { id: 'board-3', kind: 'board', x: 2, y: 2, rotation: 0 }, // (2,2), (3,2)
    ],
  });

  const start = { x: 0, y: 1 };
  const target = { x: 4, y: 1 };

  const result = findPath(room, start, target);

  assert.equal(result.found, true);
  assert.ok(result.path.length > 0);
  assert.deepEqual(result.path[0], start);
  assert.deepEqual(result.path[result.path.length - 1], target);

  // Ensure path does not step on any furniture
  for (const p of result.path) {
    assert.equal(isTileWalkable(room, p.x, p.y), true);
  }
});

test('avatar-pathfinding: start equals target', () => {
  const room = createSampleRoom();
  const pos = { x: 3, y: 3 };

  const result = findPath(room, pos, pos);

  assert.equal(result.found, true);
  assert.equal(result.cost, 0);
  assert.equal(result.steps, 0);
  assert.deepEqual(result.path, [{ x: 3, y: 3 }]);
});

test('avatar-pathfinding: blocked target or unreachable path', () => {
  const room = createSampleRoom({
    items: [
      { id: 'sofa-1', kind: 'sofa', x: 5, y: 5, rotation: 0 }, // (5,5), (6,5)
    ],
  });

  // Target occupied by furniture
  const res1 = findPath(room, { x: 0, y: 0 }, { x: 5, y: 5 });
  assert.equal(res1.found, false);
  assert.equal(res1.reason, 'TARGET_BLOCKED');
  assert.deepEqual(res1.path, []);

  // Target enclosed by furniture
  const enclosedRoom = createSampleRoom({
    items: [
      { id: 'wall-1', kind: 'table', x: 0, y: 1, rotation: 0 }, // (0,1)-(1,2)
      { id: 'wall-2', kind: 'table', x: 2, y: 0, rotation: 0 }, // (2,0)-(3,1)
    ],
  });
  // Surround (1,0)
  // (1,0) neighbor (0,0) is open, but if we enclose (1,0):
  const fullyEnclosedRoom = createSampleRoom({
    items: [
      { id: 'w1', kind: 'chair', x: 1, y: 0, rotation: 0 },
      { id: 'w2', kind: 'chair', x: 0, y: 1, rotation: 0 },
    ],
  });
  const res2 = findPath(fullyEnclosedRoom, { x: 5, y: 5 }, { x: 0, y: 0 });
  assert.equal(res2.found, false);
  assert.equal(res2.reason, 'NO_PATH');
  assert.deepEqual(res2.path, []);
});

test('avatar-pathfinding: determinism across multiple executions', () => {
  const room = createSampleRoom({
    items: [
      { id: 'table-1', kind: 'table', x: 3, y: 3, rotation: 0 },
      { id: 'sofa-1', kind: 'sofa', x: 6, y: 2, rotation: 90 },
    ],
  });
  const start = { x: 1, y: 1 };
  const target = { x: 8, y: 8 };

  const firstResult = findPath(room, start, target);

  for (let i = 0; i < 10; i++) {
    const nextResult = findPath(room, start, target);
    assert.deepEqual(nextResult, firstResult);
  }
});

test('avatar-pathfinding: CPU limit safeguard', () => {
  const room = createSampleRoom({ width: 50, height: 50 });
  const start = { x: 0, y: 0 };
  const target = { x: 49, y: 49 };

  // Strict node expansion limit
  const result = findPath(room, start, target, { maxNodes: 10 });

  assert.equal(result.found, false);
  assert.equal(result.reason, 'CPU_LIMIT_EXCEEDED');
  assert.deepEqual(result.path, []);
});

test('avatar-pathfinding: keyboard move resolution (WASD & Arrows)', () => {
  const room = createSampleRoom({
    items: [
      { id: 'desk-1', kind: 'desk', x: 1, y: 0, rotation: 0 }, // (1,0), (2,0)
    ],
  });
  const pos = { x: 0, y: 0 };

  // Valid move down
  const downResult = resolveKeyboardMove(room, pos, 'ArrowDown');
  assert.equal(downResult.valid, true);
  assert.deepEqual(downResult.position, { x: 0, y: 1 });
  assert.equal(downResult.direction, 'DOWN');

  // Valid move down with 's' or 'S'
  const sResult = resolveKeyboardMove(room, pos, 's');
  assert.equal(sResult.valid, true);
  assert.deepEqual(sResult.position, { x: 0, y: 1 });

  const SResult = resolveKeyboardMove(room, pos, 'S');
  assert.equal(SResult.valid, true);

  // Blocked move right into furniture at (1,0) with 'ArrowRight' or 'd'
  const rightResult = resolveKeyboardMove(room, pos, 'ArrowRight');
  assert.equal(rightResult.valid, false);
  assert.equal(rightResult.reason, 'BLOCKED_STEP');
  assert.deepEqual(rightResult.position, { x: 0, y: 0 });

  // Move out of bounds left
  const leftResult = resolveKeyboardMove(room, pos, 'a');
  assert.equal(leftResult.valid, false);
  assert.equal(leftResult.reason, 'BLOCKED_STEP');
  assert.deepEqual(leftResult.position, { x: 0, y: 0 });

  // Unrecognized key
  const invalidKey = resolveKeyboardMove(room, pos, 'Space');
  assert.equal(invalidKey.valid, false);
  assert.equal(invalidKey.reason, 'UNRECOGNIZED_KEY');

  // Invalid position
  const invalidPos = resolveKeyboardMove(room, null, 'w');
  assert.equal(invalidPos.valid, false);
  assert.equal(invalidPos.reason, 'INVALID_POSITION');
});

test('avatar-pathfinding: diagonal movement rules', () => {
  const room = createSampleRoom();

  // Diagonal disabled by default
  const resNoDiag = findPath(room, { x: 0, y: 0 }, { x: 1, y: 1 }, { allowDiagonal: false });
  assert.equal(resNoDiag.found, true);
  assert.equal(resNoDiag.steps, 2);

  // Diagonal enabled on open space
  const resDiag = findPath(room, { x: 0, y: 0 }, { x: 1, y: 1 }, { allowDiagonal: true });
  assert.equal(resDiag.found, true);
  assert.equal(resDiag.steps, 1);
  assert.equal(resDiag.cost, Math.SQRT2);

  // Corner cutting prevention: obstacle at (1,0)
  const roomWithObstacle = createSampleRoom({
    items: [
      { id: 'chair-1', kind: 'chair', x: 1, y: 0, rotation: 0 },
    ],
  });
  const resCorner = findPath(roomWithObstacle, { x: 0, y: 0 }, { x: 1, y: 1 }, { allowDiagonal: true });
  assert.equal(resCorner.found, true);
  // Must take orthogonal route via (0,1) instead of cutting corner (1,0)
  assert.equal(resCorner.steps, 2);
  assert.deepEqual(resCorner.path, [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
});

test('avatar-pathfinding: synthetic room access validation', () => {
  const commonRoom = createSampleRoom({ scope: 'common' });
  const personalRoom = createSampleRoom({ scope: 'personal', owner_id: 'alice' });

  const validContext = {
    owner_id: 'alice',
    capabilities: ['space.read', 'space.move'],
  };
  const readOnlyContext = {
    owner_id: 'bob',
    capabilities: ['space.read'],
  };
  const unauthorizedContext = {
    owner_id: 'carol',
    capabilities: [],
  };

  assert.equal(validateRoomAccess(commonRoom, validContext), true);
  assert.equal(validateRoomAccess(commonRoom, readOnlyContext), true);
  assert.equal(validateRoomAccess(commonRoom, unauthorizedContext), false);

  assert.equal(validateRoomAccess(personalRoom, validContext), true);
  assert.equal(validateRoomAccess(personalRoom, readOnlyContext), false);
  assert.equal(validateRoomAccess(personalRoom, null), false);
});

test('security: unknown room scopes fail closed rather than granting read access', () => {
  const room = createSampleRoom({ scope: 'private-experimental' });
  assert.equal(validateRoomAccess(room, {
    owner_id: 'alice', capabilities: ['space.read'],
  }), false);
});

test('security: path search rejects unbounded CPU budgets and invalid room geometry', () => {
  const room = createSampleRoom();
  const start = { x: 0, y: 0 };
  const target = { x: 1, y: 1 };
  for (const maxNodes of [0, -1, Infinity, 100000000, 1.5, NaN]) {
    const result = findPath(room, start, target, { maxNodes });
    assert.equal(result.found, false);
    assert.equal(result.reason, 'INVALID_LIMIT');
  }
  for (const width of [0, -1, Infinity, 1.4]) {
    const result = findPath({ ...room, width }, start, target);
    assert.equal(result.found, false);
    assert.equal(result.reason, 'INVALID_ROOM');
  }
});
