export const context = (owner = 'team-a', changes = {}) => ({
  actor_id: `${owner}:human`, owner_id: owner, kind: 'human', project_id: 'demo/shared', now: 123456,
  capabilities: ['space.read', 'space.edit', 'space.edit_common', 'space.move'], assertAuthorized() {}, ...changes,
});
export const create = (key = 'create', room_id = 'common', scope = 'common') => ({
  type: 'room.create', idempotency_key: key, expected_revision: 0, room_id, scope, label: 'Sala compartida', width: 8, height: 8,
});
export const place = (key = 'place', rev = 1, overrides = {}) => ({
  type: 'furniture.place', idempotency_key: key, expected_revision: rev, room_id: 'common', item_id: key,
  kind: 'desk', x: 2, y: 2, rotation: 0, ...overrides,
});
