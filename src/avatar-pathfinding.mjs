export const DEFAULT_CATALOGUE = Object.freeze({
  desk: [2, 1],
  chair: [1, 1],
  plant: [1, 1],
  sofa: [2, 1],
  table: [2, 2],
  board: [2, 1],
});

export function getItemDimensions(item, catalogue = DEFAULT_CATALOGUE) {
  const size = catalogue[item?.kind] ?? [1, 1];
  const rotation = item?.rotation ?? 0;
  return (rotation % 180 === 0) ? size : [size[1], size[0]];
}

export function isTileWalkable(room, x, y, options = {}) {
  const {
    ignoreAvatars = false,
    actorId = null,
    catalogue = DEFAULT_CATALOGUE,
  } = options;

  if (!room || typeof room.width !== 'number' || typeof room.height !== 'number') {
    return false;
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return false;
  }
  if (x < 0 || x >= room.width || y < 0 || y >= room.height) {
    return false;
  }

  if (Array.isArray(room.items)) {
    for (const item of room.items) {
      if (!item) continue;
      const [w, h] = getItemDimensions(item, catalogue);
      if (x >= item.x && x < item.x + w && y >= item.y && y < item.y + h) {
        return false;
      }
    }
  }

  if (!ignoreAvatars && Array.isArray(room.avatars)) {
    for (const avatar of room.avatars) {
      if (!avatar) continue;
      if (avatar.x === x && avatar.y === y) {
        if (actorId && avatar.actor_id === actorId) {
          continue;
        }
        return false;
      }
    }
  }

  return true;
}

export function findPath(room, start, target, options = {}) {
  const {
    maxNodes = 4096,
    allowDiagonal = false,
    ignoreAvatars = false,
    actorId = null,
    reducedMobility = true,
    catalogue = DEFAULT_CATALOGUE,
  } = options;

  if (!room || typeof room.width !== 'number' || typeof room.height !== 'number') {
    return { found: false, path: [], cost: 0, steps: 0, reason: 'INVALID_ROOM' };
  }

  if (!start || !target || !Number.isInteger(start.x) || !Number.isInteger(start.y) ||
      !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
    return { found: false, path: [], cost: 0, steps: 0, reason: 'INVALID_COORDINATES' };
  }

  if (start.x < 0 || start.x >= room.width || start.y < 0 || start.y >= room.height) {
    return { found: false, path: [], cost: 0, steps: 0, reason: 'START_OUT_OF_BOUNDS' };
  }

  if (start.x === target.x && start.y === target.y) {
    return { found: true, path: [{ x: start.x, y: start.y }], cost: 0, steps: 0, reducedMobility };
  }

  if (!isTileWalkable(room, target.x, target.y, { ignoreAvatars, actorId, catalogue })) {
    return { found: false, path: [], cost: 0, steps: 0, reason: 'TARGET_BLOCKED' };
  }

  const visited = new Map();
  const parentMap = new Map();
  const keyOf = (cx, cy) => `${cx},${cy}`;

  const startKey = keyOf(start.x, start.y);
  visited.set(startKey, 0);

  const queue = [{ x: start.x, y: start.y }];
  let head = 0;
  let nodeCount = 0;

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];

  if (allowDiagonal) {
    directions.push(
      { dx: 1, dy: -1, diag: true },
      { dx: 1, dy: 1, diag: true },
      { dx: -1, dy: 1, diag: true },
      { dx: -1, dy: -1, diag: true }
    );
  }

  let found = false;

  while (head < queue.length) {
    nodeCount++;
    if (nodeCount > maxNodes) {
      return { found: false, path: [], cost: 0, steps: 0, reason: 'CPU_LIMIT_EXCEEDED' };
    }

    const current = queue[head++];
    const currentKey = keyOf(current.x, current.y);

    if (current.x === target.x && current.y === target.y) {
      found = true;
      break;
    }

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const nKey = keyOf(nx, ny);

      if (visited.has(nKey)) continue;

      if (!isTileWalkable(room, nx, ny, { ignoreAvatars, actorId, catalogue })) {
        continue;
      }

      if (dir.diag) {
        const side1Walkable = isTileWalkable(room, current.x + dir.dx, current.y, { ignoreAvatars, actorId, catalogue });
        const side2Walkable = isTileWalkable(room, current.x, current.y + dir.dy, { ignoreAvatars, actorId, catalogue });
        if (!side1Walkable || !side2Walkable) continue;
      }

      const stepCost = dir.diag ? Math.SQRT2 : 1;
      visited.set(nKey, visited.get(currentKey) + stepCost);
      parentMap.set(nKey, currentKey);
      queue.push({ x: nx, y: ny });
    }
  }

  if (!found) {
    return { found: false, path: [], cost: 0, steps: 0, reason: 'NO_PATH' };
  }

  const path = [];
  let currKey = keyOf(target.x, target.y);
  while (currKey) {
    const parts = currKey.split(',');
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    path.unshift({ x: cx, y: cy });
    if (currKey === startKey) break;
    currKey = parentMap.get(currKey);
  }

  const totalCost = visited.get(keyOf(target.x, target.y));
  const steps = path.length - 1;

  return {
    found: true,
    path,
    cost: totalCost,
    steps,
    reducedMobility,
  };
}

export const KEY_MAPPINGS = Object.freeze({
  ArrowUp: { dx: 0, dy: -1, name: 'UP' },
  ArrowDown: { dx: 0, dy: 1, name: 'DOWN' },
  ArrowLeft: { dx: -1, dy: 0, name: 'LEFT' },
  ArrowRight: { dx: 1, dy: 0, name: 'RIGHT' },
  w: { dx: 0, dy: -1, name: 'UP' },
  W: { dx: 0, dy: -1, name: 'UP' },
  s: { dx: 0, dy: 1, name: 'DOWN' },
  S: { dx: 0, dy: 1, name: 'DOWN' },
  a: { dx: -1, dy: 0, name: 'LEFT' },
  A: { dx: -1, dy: 0, name: 'LEFT' },
  d: { dx: 1, dy: 0, name: 'RIGHT' },
  D: { dx: 1, dy: 0, name: 'RIGHT' },
});

export function resolveKeyboardMove(room, currentPos, keyInput, options = {}) {
  const dir = KEY_MAPPINGS[keyInput];
  if (!dir) {
    return {
      valid: false,
      position: { x: currentPos?.x ?? 0, y: currentPos?.y ?? 0 },
      reason: 'UNRECOGNIZED_KEY',
    };
  }

  if (!currentPos || !Number.isInteger(currentPos.x) || !Number.isInteger(currentPos.y)) {
    return {
      valid: false,
      position: { x: 0, y: 0 },
      reason: 'INVALID_POSITION',
    };
  }

  const nx = currentPos.x + dir.dx;
  const ny = currentPos.y + dir.dy;

  const walkable = isTileWalkable(room, nx, ny, options);

  if (!walkable) {
    return {
      valid: false,
      position: { x: currentPos.x, y: currentPos.y },
      direction: dir.name,
      targetPosition: { x: nx, y: ny },
      reason: 'BLOCKED_STEP',
    };
  }

  return {
    valid: true,
    position: { x: nx, y: ny },
    direction: dir.name,
    previousPosition: { x: currentPos.x, y: currentPos.y },
  };
}

export function validateRoomAccess(room, context) {
  if (!room || !context) return false;
  if (!Array.isArray(context.capabilities) || !context.capabilities.includes('space.read')) {
    return false;
  }
  if (room.scope === 'personal') {
    return room.owner_id === context.owner_id;
  }
  if (room.scope === 'common') {
    return context.capabilities.includes('space.edit_common') || context.capabilities.includes('space.read');
  }
  return true;
}
