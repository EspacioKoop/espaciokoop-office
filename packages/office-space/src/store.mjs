import { constants, renameSync } from 'node:fs';
import { mkdir, lstat, realpath, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createSpaceState, applySpaceCommand, spaceView, validateSpaceState, assertSpaceContext, SpaceError } from './space.mjs';

const MAX_BYTES = 16 * 1024 * 1024;
const fail = (code) => { throw new SpaceError(code); };

/** A single-host, private local-filesystem store behind the shared remote service.
 * No browser filesystem access and no implied localhost/LAN restriction.
 * All writers of the same project MUST use this lock protocol.
 */
export class SpaceFileStore {
  #rootIdentity;

  constructor({ directory, project_id }) {
    createSpaceState(project_id);
    if (typeof directory !== 'string' || directory.length === 0) fail('INVALID_STORE_PATH');
    this.directory = resolve(directory);
    this.projectId = project_id;
    const key = createHash('sha256').update(project_id).digest('hex');
    this.filename = join(this.directory, `${key}.json`);
    this.lockname = join(this.directory, `${key}.lock`);
  }

  async prepare() {
    if (process.platform !== 'linux' || !constants.O_NOFOLLOW) fail('UNSUPPORTED_STORE_PLATFORM');
    if (!this.#rootIdentity) await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid() || (this.#rootIdentity &&
        (info.dev !== this.#rootIdentity.dev || info.ino !== this.#rootIdentity.ino)) ||
      await realpath(this.directory) !== this.directory) fail('UNSAFE_STORE_DIRECTORY');
    this.#rootIdentity ??= { dev: info.dev, ino: info.ino };
  }

  async load() {
    let handle;
    try {
      handle = await open(this.filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = await handle.stat();
      if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid() ||
        info.nlink !== 1 || info.size > MAX_BYTES) fail('CORRUPT_STATE');
      const text = await handle.readFile({ encoding: 'utf8' });
      if (Buffer.byteLength(text) > MAX_BYTES) fail('CORRUPT_STATE');
      let state;
      try { state = JSON.parse(text); } catch { fail('CORRUPT_STATE'); }
      validateSpaceState(state);
      if (state.project_id !== this.projectId) fail('CORRUPT_STATE');
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return createSpaceState(this.projectId);
      if (error.code === 'ELOOP') fail('CORRUPT_STATE');
      throw error;
    } finally { await handle?.close(); }
  }

  async read(context) {
    assertSpaceContext({ project_id: this.projectId }, context);
    await this.prepare();
    const state = await this.load();
    return spaceView(state, context); // Recheck revocation after I/O, before projection.
  }

  async apply(command, context) {
    // Snapshot mutable request values before the first await. Guards remain live.
    let request;
    try {
      if (!command || Object.getPrototypeOf(command) !== Object.prototype) fail('INVALID_INPUT');
      const entries = Reflect.ownKeys(command).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(command, key);
        if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') ||
          !['string', 'number'].includes(typeof descriptor.value)) fail('INVALID_INPUT');
        return [key, descriptor.value];
      });
      // Preserve non-enumerable data fields for the domain's closed-schema validation.
      request = Object.fromEntries(entries);
    } catch { fail('INVALID_INPUT'); }
    const trusted = { ...context, capabilities: context?.capabilities?.slice() };
    assertSpaceContext({ project_id: this.projectId }, trusted);
    await this.prepare();
    let lock;
    try { lock = await open(this.lockname, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('STORE_BUSY'); throw error; }
    let outcome;
    try {
      const current = await this.load();
      const result = applySpaceCommand(current, request, trusted);
      if (!result.duplicate) await this.persist(result.state, trusted);
      outcome = { receipt: result.receipt, duplicate: result.duplicate, view: spaceView(result.state, trusted) };
    } finally {
      // Never steal a lock based on its age. Crash recovery is an operator action.
      await lock.close();
      await unlink(this.lockname);
    }
    assertSpaceContext({ project_id: this.projectId }, trusted);
    return outcome;
  }

  async persist(state, context) {
    const bytes = JSON.stringify(state);
    if (Buffer.byteLength(bytes) > MAX_BYTES) fail('CAPACITY_EXCEEDED');
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    let handle;
    let committed = false;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes, 'utf8');
      await handle.sync();
      await handle.close(); handle = undefined;
      await this.prepare(); // Pin directory identity across operations and slow writes.
      assertSpaceContext(state, context); // Commit authorization boundary, after slow writes.
      renameSync(temporary, this.filename); // No event-loop turn between guard and rename.
      committed = true;
      const directoryHandle = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    } catch (error) {
      // A failed directory fsync means the rename may have committed. Never report rollback.
      if (committed) fail('COMMIT_UNCERTAIN');
      throw error;
    } finally {
      await handle?.close();
      if (!committed) await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
}
