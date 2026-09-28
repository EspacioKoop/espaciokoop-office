// Synthetic data only; importing fixtures never registers tests.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const project = 'fixture/office';
export const context = (changes = {}) => ({ actor_id: 'human-a', owner_id: 'human-a', kind: 'human',
  project_id: project, capabilities: ['space.read', 'space.edit', 'space.edit_common', 'space.move'],
  now: 1700000000000, assertAuthorized: () => true, ...changes });
export const create = (changes = {}) => ({ type: 'room.create', idempotency_key: 'room-1', expected_revision: 0,
  room_id: 'lobby', label: 'Sala común de prueba', scope: 'common', width: 12, height: 10, ...changes });
export const place = (changes = {}) => ({ type: 'furniture.place', idempotency_key: 'put-1', expected_revision: 1,
  room_id: 'lobby', item_id: 'desk-1', kind: 'desk', x: 3, y: 3, rotation: 0, ...changes });
export const childImports = `
  import { SpaceFileStore } from ${JSON.stringify(new URL('../src/store.mjs', import.meta.url).href)};
  import { createSpaceState, applySpaceCommand } from ${JSON.stringify(new URL('../src/space.mjs', import.meta.url).href)};
  import { project, context, create, place } from ${JSON.stringify(import.meta.url)};
`;
export const runChild = async (source, args = []) => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath,
    ['--input-type=module', '-e', childImports + source, ...args],
    { env: {}, timeout: 10000, maxBuffer: 65536 });
  if (stderr) throw new Error('Unexpected child diagnostics');
  return JSON.parse(stdout);
};
