import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ rooms: 64, items: 128, avatars: 128, receipts: 8192, events: 128 });
export const CATALOGUE = Object.freeze(Object.fromEntries(Object.entries({
  desk: [2, 1], chair: [1, 1], plant: [1, 1], sofa: [2, 1], table: [2, 2], board: [2, 1],
}).map(([kind, size]) => [kind, Object.freeze(size)])));
const BASE = ['type', 'idempotency_key', 'expected_revision'];
const FIELDS = Object.freeze({
  'room.create': ['room_id', 'label', 'scope', 'width', 'height'],
  'room.update': ['room_id', 'label', 'width', 'height'],
  'room.delete': ['room_id'],
  'furniture.place': ['room_id', 'item_id', 'kind', 'x', 'y', 'rotation'],
  'furniture.move': ['room_id', 'item_id', 'x', 'y', 'rotation'],
  'furniture.remove': ['room_id', 'item_id'],
  'avatar.move': ['room_id', 'x', 'y'],
  'avatar.leave': [],
});

export class SpaceError extends Error {
  constructor(code) { super(code); this.name = 'SpaceError'; this.code = code; }
}
const fail = (code) => { throw new SpaceError(code); };
const requireThat = (value, code = 'INVALID_INPUT') => { if (!value) fail(code); };
const integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
const id = (s) => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(s);
const project = (s) => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}(\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63})?$/.test(s);
const label = (s) => typeof s === 'string' && s.trim() === s && s.length >= 1 && s.length <= 80 && !/[\x00-\x1f\x7f<>\u202a-\u202e\u2066-\u2069]/u.test(s);
const exact = (value, keys) => {
  requireThat(value && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
};
const unique = (values) => new Set(values).size === values.length;
const canonical = (value) => JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])));
const fingerprint = (command) => createHash('sha256').update(canonical(command)).digest('hex');
const nextRevision = (expected, actual) => { requireThat(expected === actual, 'REVISION_CONFLICT'); return actual + 1; };

export function assertSpaceContext(state, context, capability = 'space.read') {
  requireThat(context && id(context.actor_id) && id(context.owner_id) &&
    context.kind === 'human' && context.project_id === state.project_id &&
    Array.isArray(context.capabilities) && context.capabilities.includes('space.read') &&
    context.capabilities.includes(capability), 'FORBIDDEN');
  requireThat(typeof context.assertAuthorized === 'function', 'INVALID_CONTEXT');
  requireThat(!context.signal?.aborted, 'ACCESS_REVOKED');
  // The host must provide a synchronous guard, never a client-supplied boolean.
  const valid = context.assertAuthorized();
  requireThat(valid === undefined || valid === true, 'ACCESS_REVOKED');
}
function canEdit(room, context) {
  assertSpaceContext({ project_id: context.project_id }, context, 'space.edit');
  requireThat(room.scope === 'personal' ? room.owner_id === context.owner_id :
    context.capabilities.includes('space.edit_common'), 'FORBIDDEN');
}
function dimensions(item) {
  const size = CATALOGUE[item.kind];
  return item.rotation % 180 === 0 ? size : [size[1], size[0]];
}
function intersects(a, b) {
  const [aw, ah] = dimensions(a), [bw, bh] = dimensions(b);
  return a.x < b.x + bw && b.x < a.x + aw && a.y < b.y + bh && b.y < a.y + ah;
}
function contains(item, x, y) {
  const [w, h] = dimensions(item);
  return x >= item.x && x < item.x + w && y >= item.y && y < item.y + h;
}
function fits(room, item) {
  const [w, h] = dimensions(item);
  return item.x + w <= room.width && item.y + h <= room.height && !contains(item, 0, 0);
}
function validItem(item) {
  exact(item, ['id', 'kind', 'x', 'y', 'rotation']);
  requireThat(id(item.id) && Object.hasOwn(CATALOGUE, item.kind) && integer(item.x, 0, 63) &&
    integer(item.y, 0, 63) && [0, 90, 180, 270].includes(item.rotation));
}
function commandShape(command) {
  requireThat(command && Object.hasOwn(FIELDS, command.type));
  exact(command, [...BASE, ...FIELDS[command.type]]);
  requireThat(id(command.idempotency_key) && integer(command.expected_revision));
  for (const field of ['room_id', 'item_id']) if (Object.hasOwn(command, field)) requireThat(id(command[field]));
  if (Object.hasOwn(command, 'label')) requireThat(label(command.label));
  if (Object.hasOwn(command, 'width')) requireThat(integer(command.width, 4, 64) && integer(command.height, 4, 64));
  if (Object.hasOwn(command, 'x')) requireThat(integer(command.x, 0, 63) && integer(command.y, 0, 63));
  if (Object.hasOwn(command, 'rotation')) requireThat([0, 90, 180, 270].includes(command.rotation));
  if (Object.hasOwn(command, 'kind')) requireThat(Object.hasOwn(CATALOGUE, command.kind));
  if (Object.hasOwn(command, 'scope')) requireThat(['common', 'personal'].includes(command.scope));
}

export function createSpaceState(projectId) {
  requireThat(project(projectId));
  return { schema_version: 1, project_id: projectId, revision: 0, rooms: [], retired_rooms: [], avatars: [], receipts: [], events: [] };
}

/** Validate trusted persistence before serving it. This is NOT an import API for clients. */
export function validateSpaceState(state) {
  try {
    exact(state, ['schema_version', 'project_id', 'revision', 'rooms', 'retired_rooms', 'avatars', 'receipts', 'events']);
    requireThat(state.schema_version === 1 && project(state.project_id) && integer(state.revision));
    for (const field of ['rooms', 'retired_rooms', 'avatars', 'receipts', 'events']) requireThat(Array.isArray(state[field]));
    requireThat(state.rooms.length + state.retired_rooms.length <= LIMITS.rooms && state.avatars.length <= LIMITS.avatars &&
      state.receipts.length <= LIMITS.receipts && state.revision === state.receipts.length &&
      state.events.length === Math.min(state.revision, LIMITS.events));
    requireThat(state.retired_rooms.every(id) && unique([...state.rooms.map((r) => r.id), ...state.retired_rooms]));
    requireThat(unique(state.avatars.map((a) => a.actor_id)));
    for (const room of state.rooms) {
      exact(room, ['id', 'label', 'scope', 'owner_id', 'width', 'height', 'revision', 'items']);
      requireThat(id(room.id) && label(room.label) && ['personal', 'common'].includes(room.scope) &&
        (room.scope === 'personal' ? id(room.owner_id) : room.owner_id === null) &&
        integer(room.width, 4, 64) && integer(room.height, 4, 64) && integer(room.revision, 1, state.revision) &&
        Array.isArray(room.items) && room.items.length <= LIMITS.items && unique(room.items.map((item) => item.id)));
      for (const item of room.items) { validItem(item); requireThat(fits(room, item)); }
      for (let i = 0; i < room.items.length; i++) for (let j = i + 1; j < room.items.length; j++)
        requireThat(!intersects(room.items[i], room.items[j]));
    }
    for (const avatar of state.avatars) {
      exact(avatar, ['actor_id', 'owner_id', 'room_id', 'x', 'y', 'revision']);
      requireThat(id(avatar.actor_id) && id(avatar.owner_id) && integer(avatar.revision, 1, state.revision));
      if (avatar.room_id === null) requireThat(avatar.x === null && avatar.y === null);
      else {
        const room = state.rooms.find((r) => r.id === avatar.room_id);
        requireThat(room && integer(avatar.x, 0, room.width - 1) && integer(avatar.y, 0, room.height - 1) &&
          !room.items.some((item) => contains(item, avatar.x, avatar.y)));
      }
    }
    requireThat(unique(state.receipts.map((r) => JSON.stringify([r.actor_id, r.key]))));
    state.receipts.forEach((r, index) => {
      exact(r, ['actor_id', 'owner_id', 'shared', 'key', 'hash', 'result']); exact(r.result, ['revision', 'resource_revision']);
      requireThat(id(r.actor_id) && id(r.owner_id) && typeof r.shared === 'boolean' && id(r.key) && typeof r.hash === 'string' && /^[a-f0-9]{64}$/.test(r.hash) &&
        r.result.revision === index + 1 && integer(r.result.resource_revision, 1, index + 1));
    });
    state.events.forEach((event, index) => {
      exact(event, ['revision', 'type', 'actor_id', 'room_id', 'at']);
      requireThat(event.revision === state.revision - state.events.length + index + 1 && Object.hasOwn(FIELDS, event.type) &&
        id(event.actor_id) && (event.room_id === null || id(event.room_id)) && integer(event.at));
    });
    return state;
  } catch { fail('CORRUPT_STATE'); }
}

/** Pure transaction: the host must serialize/CAS persistence, not just call this twice. */
export function applySpaceCommand(state, command, context) {
  assertSpaceContext(state, context);
  validateSpaceState(state);
  commandShape(command);
  requireThat(integer(context.now), 'INVALID_CONTEXT');
  const avatarOperation = command.type.startsWith('avatar.');
  let originalRoom = state.rooms.find((room) => room.id === command.room_id);
  if (avatarOperation) assertSpaceContext(state, context, 'space.move');
  else if (command.type === 'room.create') canEdit({ scope: command.scope, owner_id: context.owner_id }, context);
  else {
    // Deleted rooms have no content. Do not leak or replay a receipt without edit authority.
    if (!originalRoom) assertSpaceContext(state, context, 'space.edit');
    else canEdit(originalRoom, context);
  }
  const hash = fingerprint(command);
  const previous = state.receipts.find((r) => r.actor_id === context.actor_id && r.key === command.idempotency_key);
  if (previous) {
    requireThat(previous.owner_id === context.owner_id && (!previous.shared || context.capabilities.includes('space.edit_common')), 'FORBIDDEN');
    requireThat(previous.hash === hash, 'IDEMPOTENCY_CONFLICT');
    return { state: structuredClone(state), receipt: structuredClone(previous.result), duplicate: true };
  }
  requireThat(state.receipts.length < LIMITS.receipts, 'CAPACITY_EXCEEDED');
  const next = structuredClone(state);
  let room = next.rooms.find((r) => r.id === command.room_id);
  let resourceRevision;
  if (avatarOperation) {
    let avatar = next.avatars.find((a) => a.actor_id === context.actor_id);
    requireThat(!avatar || avatar.owner_id === context.owner_id, 'FORBIDDEN');
    resourceRevision = nextRevision(command.expected_revision, avatar?.revision ?? 0);
    if (command.type === 'avatar.move') {
      requireThat(room, 'NOT_FOUND');
      requireThat(command.x < room.width && command.y < room.height &&
        !room.items.some((item) => contains(item, command.x, command.y)), 'POSITION_BLOCKED');
    }
    if (!avatar) {
      requireThat(next.avatars.length < LIMITS.avatars, 'CAPACITY_EXCEEDED');
      avatar = { actor_id: context.actor_id, owner_id: context.owner_id }; next.avatars.push(avatar);
    }
    Object.assign(avatar, { room_id: command.room_id ?? null, x: command.x ?? null, y: command.y ?? null, revision: resourceRevision });
  } else if (command.type === 'room.create') {
    requireThat(!room && !next.retired_rooms.includes(command.room_id), 'RESOURCE_EXISTS');
    resourceRevision = nextRevision(command.expected_revision, 0);
    requireThat(next.rooms.length + next.retired_rooms.length < LIMITS.rooms, 'CAPACITY_EXCEEDED');
    next.rooms.push({ id: command.room_id, label: command.label, scope: command.scope,
      owner_id: command.scope === 'personal' ? context.owner_id : null, width: command.width, height: command.height,
      revision: resourceRevision, items: [] });
  } else {
    requireThat(room, 'NOT_FOUND');
    resourceRevision = nextRevision(command.expected_revision, room.revision);
    room.revision = resourceRevision;
    if (command.type === 'room.delete') {
      requireThat(room.items.length === 0 && !next.avatars.some((a) => a.room_id === room.id), 'ROOM_NOT_EMPTY');
      next.rooms = next.rooms.filter((r) => r.id !== room.id); next.retired_rooms.push(room.id);
    } else if (command.type === 'room.update') {
      const resized = { ...room, width: command.width, height: command.height };
      requireThat(room.items.every((item) => fits(resized, item)) && next.avatars.every((a) =>
        a.room_id !== room.id || (a.x < command.width && a.y < command.height)), 'ROOM_NOT_EMPTY');
      Object.assign(room, { label: command.label, width: command.width, height: command.height });
    } else {
      const existing = room.items.find((item) => item.id === command.item_id);
      if (command.type === 'furniture.remove') {
        requireThat(existing, 'NOT_FOUND'); room.items = room.items.filter((item) => item.id !== command.item_id);
      } else {
        const placing = command.type === 'furniture.place';
        requireThat(placing ? !existing : existing, placing ? 'RESOURCE_EXISTS' : 'NOT_FOUND');
        requireThat(!placing || room.items.length < LIMITS.items, 'CAPACITY_EXCEEDED');
        const item = { id: command.item_id, kind: placing ? command.kind : existing.kind,
          x: command.x, y: command.y, rotation: command.rotation };
        requireThat(fits(room, item) && !room.items.some((other) => other.id !== item.id && intersects(item, other)) &&
          !next.avatars.some((a) => a.room_id === room.id && contains(item, a.x, a.y)), 'POSITION_BLOCKED');
        room.items = room.items.filter((other) => other.id !== item.id); room.items.push(item);
      }
    }
  }
  next.revision++;
  const receipt = { revision: next.revision, resource_revision: resourceRevision };
  next.receipts.push({ actor_id: context.actor_id, owner_id: context.owner_id, shared: !avatarOperation && (command.scope ?? originalRoom?.scope) === 'common', key: command.idempotency_key, hash, result: receipt });
  next.events.push({ revision: next.revision, type: command.type, actor_id: context.actor_id, room_id: command.room_id ?? null, at: context.now });
  next.events = next.events.slice(-LIMITS.events);
  validateSpaceState(next);
  return { state: next, receipt: structuredClone(receipt), duplicate: false };
}

/** Only this projection may cross the authenticated transport; never return internal receipts. */
export function spaceView(state, context) {
  assertSpaceContext(state, context); validateSpaceState(state);
  return structuredClone({ schema_version: state.schema_version, project_id: state.project_id, revision: state.revision,
    rooms: state.rooms, avatars: state.avatars, events: state.events,
    capacity: { commands_remaining: LIMITS.receipts - state.receipts.length, rooms_remaining: LIMITS.rooms - state.rooms.length - state.retired_rooms.length } });
}
