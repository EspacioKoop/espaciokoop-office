import {
  applySpaceCommand,
  validateSpaceState,
  spaceView,
  CATALOGUE,
  LIMITS,
  SpaceError,
  assertSpaceContext,
} from '../packages/office-space/src/space.mjs';

export {
  CATALOGUE,
  LIMITS,
  SpaceError,
  assertSpaceContext,
  spaceView,
};

/**
 * Calculates item dimensions based on kind and rotation angle (0, 90, 180, 270).
 */
export function calculateItemDimensions(kind, rotation = 0) {
  if (typeof kind !== 'string' || !Object.hasOwn(CATALOGUE, kind)) {
    throw new SpaceError('INVALID_INPUT');
  }
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new SpaceError('INVALID_INPUT');
  }
  const size = CATALOGUE[kind];
  return rotation % 180 === 0 ? [size[0], size[1]] : [size[1], size[0]];
}

/**
 * Returns array of [x, y] cells occupied by a furniture item.
 */
export function getOccupiedCells(item) {
  const [w, h] = calculateItemDimensions(item.kind, item.rotation);
  const cells = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      cells.push([item.x + dx, item.y + dy]);
    }
  }
  return cells;
}

/**
 * Checks if two furniture items intersect spatially.
 */
export function checkItemCollision(itemA, itemB) {
  const [aw, ah] = calculateItemDimensions(itemA.kind, itemA.rotation);
  const [bw, bh] = calculateItemDimensions(itemB.kind, itemB.rotation);
  return (
    itemA.x < itemB.x + bw &&
    itemB.x < itemA.x + aw &&
    itemA.y < itemB.y + bh &&
    itemB.y < itemA.y + ah
  );
}

/**
 * Checks if a furniture item fits inside a room and does not block the entry cell (0, 0).
 */
export function checkItemFitsInRoom(room, item) {
  const [w, h] = calculateItemDimensions(item.kind, item.rotation);
  const insideBounds =
    item.x >= 0 &&
    item.y >= 0 &&
    item.x + w <= room.width &&
    item.y + h <= room.height;
  const containsEntry = item.x <= 0 && 0 < item.x + w && item.y <= 0 && 0 < item.y + h;
  return insideBounds && !containsEntry;
}

/**
 * Checks if a furniture item collides with any avatar in the room.
 */
export function checkAvatarCollision(item, avatars, roomId) {
  const [w, h] = calculateItemDimensions(item.kind, item.rotation);
  return avatars.some(
    (avatar) =>
      avatar.room_id === roomId &&
      avatar.x !== null &&
      avatar.y !== null &&
      avatar.x >= item.x &&
      avatar.x < item.x + w &&
      avatar.y >= item.y &&
      avatar.y < item.y + h
  );
}

/**
 * Validates room edit authorization based on context capabilities and room scope/owner.
 */
export function checkRoomAccess(room, context) {
  assertSpaceContext({ project_id: context.project_id }, context, 'space.edit');
  if (room.scope === 'personal') {
    if (room.owner_id !== context.owner_id) {
      throw new SpaceError('FORBIDDEN');
    }
  } else if (room.scope === 'common') {
    if (!context.capabilities.includes('space.edit_common')) {
      throw new SpaceError('FORBIDDEN');
    }
  }
}

/**
 * Builds a strictly formatted layout command.
 */
export function prepareLayoutCommand(type, params) {
  if (typeof type !== 'string' || !type.length ||
      !params || typeof params !== 'object' || Array.isArray(params) ||
      Object.hasOwn(params, 'type')) {
    throw new SpaceError('INVALID_INPUT');
  }
  // A user-provided params.type must not replace the operation authorised by
  // the caller. Keep the canonical type last even on prototype-bearing inputs.
  return { ...params, type };
}

/**
 * Dry-run prevalidation adapter for a layout operation without state mutation.
 */
export function validateLayoutOperation(state, command, context) {
  assertSpaceContext(state, context);
  validateSpaceState(state);

  const clone = structuredClone(state);
  const result = applySpaceCommand(clone, command, context);
  return {
    valid: true,
    duplicate: result.duplicate,
    receipt: result.receipt,
    projectedState: result.state,
  };
}

/**
 * Executes a single layout command on state.
 */
export function executePlannerCommand(state, command, context) {
  return applySpaceCommand(state, command, context);
}

/**
 * Multi-command transactional planner with guaranteed atomic rollback.
 * If any command in the sequence fails, the initial state is untouched and error is thrown.
 */
export function planLayoutTransaction(state, commands, context) {
  if (!Array.isArray(commands)) {
    throw new SpaceError('INVALID_INPUT');
  }
  assertSpaceContext(state, context);
  validateSpaceState(state);

  const initialCopy = structuredClone(state);
  let currentState = initialCopy;
  const receipts = [];

  for (const command of commands) {
    const res = executePlannerCommand(currentState, command, context);
    currentState = res.state;
    receipts.push(res.receipt);
  }

  return {
    ok: true,
    state: currentState,
    receipts,
  };
}
