import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpaceFileStore } from '../packages/office-space/src/store.mjs';
import { SpaceError } from '../packages/office-space/src/space.mjs';

const capabilities = Object.freeze(['space.read', 'space.edit', 'space.edit_common', 'space.move']);
const statuses = new Map([
  ['FORBIDDEN', 403], ['ACCESS_REVOKED', 403], ['NOT_FOUND', 404],
  ['REVISION_CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409], ['RESOURCE_EXISTS', 409],
  ['POSITION_BLOCKED', 409], ['ROOM_NOT_EMPTY', 409], ['CAPACITY_EXCEEDED', 409],
  ['INVALID_INPUT', 400], ['STORE_BUSY', 503], ['COMMIT_UNCERTAIN', 503],
]);

// Closed public vocabulary: never serialize exceptions, paths or disk error codes.
export function spaceFailure(error) {
  if (error instanceof SpaceError && statuses.has(error.code)) {
    return { status: statuses.get(error.code), body: { error: error.code } };
  }
  console.error('Office space: operación no disponible (error interno).');
  return { status: 503, body: { error: 'SPACE_UNAVAILABLE' } };
}

/** Only the backend calls this adapter. Identity/configuration are never JSON input. */
export function createSpaceBridge({ mode, directory, projectId, now, onCommit }) {
  let temporary; let store; let closing = false;
  const pending = new Set();
  function storage() {
    if (!projectId || (mode !== 'demo' && !directory)) throw new Error('Space not configured');
    if (!store) {
      if (mode === 'demo') temporary = mkdtempSync(join(tmpdir(), 'office-space-'));
      store = new SpaceFileStore({ directory: temporary ?? directory, project_id: projectId });
    }
    return store;
  }
  function run(memberId, assertAuthorized, command, writing) {
    if (closing) return Promise.reject(new Error('Space closed'));
    const task = (async () => {
      const context = {
        actor_id: memberId, owner_id: memberId, kind: 'human', project_id: projectId,
        capabilities, now: now(), assertAuthorized,
      };
      // This synchronous guard also runs inside the store across all I/O boundaries.
      assertAuthorized();
      const result = writing ? await storage().apply(command, context) : await storage().read(context);
      assertAuthorized();
      if (writing && !result.duplicate) onCommit();
      return result;
    })();
    pending.add(task);
    task.finally(() => pending.delete(task)).catch(() => {});
    return task;
  }
  return {
    read: (memberId, guard) => run(memberId, guard, undefined, false),
    apply: (memberId, guard, command) => run(memberId, guard, command, true),
    async close() {
      closing = true;
      await Promise.allSettled([...pending]);
      if (temporary) await rm(temporary, { recursive: true, force: true });
    },
  };
}
