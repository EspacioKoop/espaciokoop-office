import { constants, renameSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { mkdir, realpath, lstat, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SpaceError, createSpaceState, validateSpaceState, validateSpaceCommand, assertSpaceContext, applySpaceCommand, spaceView } from './space.mjs';

const MAX_BYTES = 16 * 1024 * 1024;
const deny = (code) => { throw new SpaceError(code); };
function privateFile(stat, directory = false) {
  if (!(directory ? stat.isDirectory() : stat.isFile()) ||
      (stat.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
      stat.uid !== process.getuid() || (!directory && stat.nlink !== 1)) deny('UNSAFE_STORAGE');
}
function sanitize(error) {
  if (error instanceof SpaceError) return error;
  return new SpaceError(['ELOOP', 'ENOTDIR'].includes(error?.code) ? 'UNSAFE_STORAGE' : 'STORE_IO');
}

/** Linux single-host store. Only trusted server configuration supplies this directory. */
export async function openSpaceStore({ directory, project_id }) {
  const empty = createSpaceState(project_id);
  if (process.platform !== 'linux' || !constants.O_NOFOLLOW) deny('UNSUPPORTED_PLATFORM');
  if (typeof directory !== 'string' || !directory || directory.includes('\0')) deny('INVALID_INPUT');
  const root = resolve(directory);
  let rootStat;
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if (await realpath(root) !== root) deny('UNSAFE_STORAGE');
    rootStat = await lstat(root); privateFile(rootStat, true);
  } catch (error) { throw sanitize(error); }
  const name = createHash('sha256').update(project_id).digest('hex');
  const target = join(root, `${name}.json`), lock = join(root, `${name}.lock`);
  async function checkRoot() {
    const stat = await lstat(root); privateFile(stat, true);
    if (stat.dev !== rootStat.dev || stat.ino !== rootStat.ino || await realpath(root) !== root) deny('UNSAFE_STORAGE');
  }
  async function load() {
    let handle;
    try {
      handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(empty);
      throw error;
    }
    try {
      const stat = await handle.stat(); privateFile(stat);
      if (stat.size > MAX_BYTES) deny('CORRUPT_STATE');
      const text = await handle.readFile('utf8');
      if (Buffer.byteLength(text) > MAX_BYTES) deny('CORRUPT_STATE');
      let state;
      try { state = JSON.parse(text); } catch { deny('CORRUPT_STATE'); }
      validateSpaceState(state);
      if (state.project_id !== project_id) deny('CORRUPT_STATE');
      return state;
    } finally { await handle.close(); }
  }
  async function read(context) {
    assertSpaceContext(empty, context);
    try {
      await checkRoot();
      return spaceView(await load(), context); // Rechecks revocation after I/O.
    } catch (error) { throw sanitize(error); }
  }
  async function execute(command, context) {
    assertSpaceContext(empty, context);
    // Detach request data before the first await, not after it can be changed by a caller.
    validateSpaceCommand(command);
    let detached;
    try { detached = structuredClone(command); } catch { deny('INVALID_INPUT'); }
    let lockHandle, tempHandle, tempPath, committed = false, outcome, failure;
    try {
      await checkRoot();
      try { lockHandle = await open(lock, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') deny('STORE_BUSY'); throw error; }
      const result = applySpaceCommand(await load(), detached, context);
      if (!result.duplicate) {
        const encoded = JSON.stringify(result.state);
        if (Buffer.byteLength(encoded) > MAX_BYTES) deny('CAPACITY_EXCEEDED');
        tempPath = join(root, `${name}.${randomUUID()}.tmp`);
        tempHandle = await open(tempPath, 'wx', 0o600);
        await tempHandle.writeFile(encoded, 'utf8');
        await tempHandle.sync();
        await tempHandle.close(); tempHandle = undefined;
        await checkRoot();
        // No await between the final guard and atomic rename: same-event-loop revocation
        // cannot sneak into that gap. External policy changes need a synchronous host guard.
        assertSpaceContext(empty, context);
        const dirFd = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try {
          renameSync(tempPath, target); committed = true; tempPath = undefined;
          fsyncSync(dirFd);
        } finally { closeSync(dirFd); }
      }
      outcome = { receipt: result.receipt, duplicate: result.duplicate, view: spaceView(result.state, context) };
    } catch (error) { failure = committed ? new SpaceError('COMMIT_UNCERTAIN') : sanitize(error); }
    finally {
      try {
        if (tempHandle) await tempHandle.close();
        if (tempPath) await unlink(tempPath);
        if (lockHandle) { await lockHandle.close(); await unlink(lock); }
      } catch (error) { failure ??= committed ? new SpaceError('COMMIT_UNCERTAIN') : sanitize(error); }
    }
    if (failure) throw failure;
    // Awaited cleanup can outlive a revocation. Never return a view after access was removed.
    assertSpaceContext(empty, context);
    return outcome;
  }
  return Object.freeze({ read, execute });
}
