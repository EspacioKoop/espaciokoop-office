import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile, stat, chmod, symlink, link, mkdir } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSpaceStore } from '../src/store.mjs';
import { context, create, place } from './fixtures.mjs';

const project_id = 'demo/shared';
const basename = createHash('sha256').update(project_id).digest('hex');
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'office-space-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: await openSpaceStore({ directory, project_id }),
    target: join(directory, `${basename}.json`), lock: join(directory, `${basename}.lock`) };
}
const rejects = (run, code) => assert.rejects(run, (e) => e.code === code && e.message === code);

test('state and idempotency survive store restart, without client-specific copies', async (t) => {
  const { directory, store } = await setup(t);
  const created = await store.execute(create(), context());
  await store.execute(place(), context('team-b'));
  const reopened = await openSpaceStore({ directory, project_id });
  const retry = await reopened.execute(create(), context());
  assert.equal(retry.duplicate, true); assert.deepEqual(retry.receipt, created.receipt);
  assert.equal(retry.view.rooms[0].items.length, 1); assert.equal(retry.view.revision, 2);
  assert.deepEqual(await reopened.read(context('team-b')), await store.read(context()));
});
test('two store instances racing cannot lose a committed edit', async (t) => {
  const { directory, store } = await setup(t);
  await store.execute(create(), context());
  const second = await openSpaceStore({ directory, project_id });
  const results = await Promise.allSettled([
    store.execute(place('a'), context()), second.execute(place('b', 1, { x: 5 }), context('team-b')),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(['STORE_BUSY', 'REVISION_CONFLICT'].includes(results.find((r) => r.status === 'rejected').reason.code));
  const firstView = await store.read(context()); assert.equal(firstView.rooms[0].items.length, 1);
  const missing = firstView.rooms[0].items[0].id === 'a' ? 'b' : 'a';
  await second.execute(place(missing, 2, { x: missing === 'a' ? 2 : 5 }), context(missing === 'a' ? 'team-a' : 'team-b'));
  assert.equal((await store.read(context())).rooms[0].items.length, 2);
});

test('separate OS processes share the same lock and revision boundary', async (t) => {
  const { directory, store } = await setup(t); await store.execute(create(), context());
  const program = `import {openSpaceStore} from ${JSON.stringify(new URL('../src/store.mjs', import.meta.url).href)};
    import {context,place} from ${JSON.stringify(new URL('./fixtures.mjs', import.meta.url).href)};
    const store=await openSpaceStore({directory:process.argv[1],project_id:'demo/shared'});
    try { await store.execute(place(process.argv[2],1,{x:Number(process.argv[3])}),context()); console.log('COMMITTED'); }
    catch(e) { console.log(e.code); }`;
  const run = (id, x) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', program, directory, id, String(x)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', (data) => out += data);
    child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve(out.trim()) : reject(new Error('CHILD_FAILED')));
  });
  const results = await Promise.all([run('a', 2), run('b', 5)]);
  assert.equal(results.filter((r) => r === 'COMMITTED').length, 1);
  assert.ok(results.every((r) => ['COMMITTED', 'STORE_BUSY', 'REVISION_CONFLICT'].includes(r)));
  assert.equal((await store.read(context())).revision, 2);
});

test('failed edits leave state unchanged and release the lock', async (t) => {
  const { store, directory, target } = await setup(t); await store.execute(create(), context());
  const before = await readFile(target);
  await rejects(() => store.execute(place('bad', 0), context()), 'REVISION_CONFLICT');
  assert.deepEqual(await readFile(target), before);
  assert.deepEqual(await readdir(directory), [`${basename}.json`]);
  await store.execute(place(), context());
});
test('project-isolated stores and cross-project reads fail closed', async (t) => {
  const { directory, store } = await setup(t); await store.execute(create(), context());
  const other = await openSpaceStore({ directory, project_id: 'demo/other' });
  await rejects(() => other.read(context()), 'FORBIDDEN');
  assert.equal((await other.read(context('team-a', { project_id: 'demo/other' }))).revision, 0);
  assert.equal((await store.read(context())).revision, 1);
});
test('state files are private and all temporary files are removed after commit', async (t) => {
  const { store, directory, target } = await setup(t); await store.execute(create(), context());
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(target)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), [`${basename}.json`]);
});
test('revocation after temp write but before rename prevents the effect', async (t) => {
  const { store, directory } = await setup(t);
  const ctx = context('team-a', { assertAuthorized: () => !readdirSync(directory).some((f) => f.endsWith('.tmp')) });
  await rejects(() => store.execute(create(), ctx), 'ACCESS_REVOKED');
  assert.equal((await store.read(context())).revision, 0);
  assert.deepEqual(await readdir(directory), []);
});
test('pre-revoked access never creates a lock or state file', async (t) => {
  const { store, directory } = await setup(t);
  await rejects(() => store.execute(create(), context('team-a', { signal: AbortSignal.abort() })), 'ACCESS_REVOKED');
  assert.deepEqual(await readdir(directory), []);
});
test('a lingering lock is not stolen or expired heuristically', async (t) => {
  const { store, lock, directory } = await setup(t); await writeFile(lock, '', { mode: 0o600 });
  await rejects(() => store.execute(create(), context()), 'STORE_BUSY');
  assert.deepEqual(await readdir(directory), [`${basename}.lock`]);
});
test('request is detached before awaiting disk, and strict fields are not silently stripped', async (t) => {
  const { store } = await setup(t); const cmd = create(); const pending = store.execute(cmd, context());
  cmd.label = 'Changed after submission'; await pending;
  assert.equal((await store.read(context())).rooms[0].label, 'Sala compartida');
  await rejects(() => store.execute({ ...place(), [Symbol('hidden')]: 1 }, context()), 'INVALID_INPUT');
});

for (const [name, tamper, code] of [
  ['invalid JSON', async ({ target }) => writeFile(target, '{'), 'CORRUPT_STATE'],
  ['invalid schema', async ({ target }) => writeFile(target, '{}'), 'CORRUPT_STATE'],
  ['oversized file', async ({ target }) => writeFile(target, ' '.repeat(16 * 1024 * 1024 + 1)), 'CORRUPT_STATE'],
  ['unsafe mode', async ({ target }) => chmod(target, 0o644), 'UNSAFE_STORAGE'],
  ['symlink file', async ({ target, directory }) => { await rm(target); await writeFile(join(directory, 'outside'), '{}'); await symlink(join(directory, 'outside'), target); }, 'UNSAFE_STORAGE'],
  ['hardlink file', async ({ target, directory }) => link(target, join(directory, 'copy')), 'UNSAFE_STORAGE'],
  ['directory in place of file', async ({ target }) => { await rm(target); await mkdir(target); }, 'UNSAFE_STORAGE'],
]) test(`unsafe persisted data: ${name}`, async (t) => {
  const fixture = await setup(t); await fixture.store.execute(create(), context()); await tamper(fixture);
  await rejects(() => fixture.store.read(context()), code);
  await rejects(() => fixture.store.execute(place(), context()), code);
  assert.ok(!(await readdir(fixture.directory)).some((f) => f.endsWith('.lock') || f.endsWith('.tmp')));
});
test('wrong project in a valid stored snapshot is not served', async (t) => {
  const { store, target } = await setup(t); await store.execute(create(), context());
  const state = JSON.parse(await readFile(target, 'utf8')); state.project_id = 'demo/other';
  await writeFile(target, JSON.stringify(state)); await rejects(() => store.read(context()), 'CORRUPT_STATE');
});
test('symlink and permissive storage directories are refused', async (t) => {
  const { directory } = await setup(t), actual = join(directory, 'actual'), linked = join(directory, 'linked');
  await mkdir(actual, { mode: 0o700 }); await symlink(actual, linked);
  await rejects(() => openSpaceStore({ directory: linked, project_id }), 'UNSAFE_STORAGE');
  await chmod(actual, 0o755); await rejects(() => openSpaceStore({ directory: actual, project_id }), 'UNSAFE_STORAGE');
});
test('invalid project identifier cannot escape the storage directory', async (t) => {
  const { directory } = await setup(t);
  await rejects(() => openSpaceStore({ directory, project_id: '../outside' }), 'INVALID_INPUT');
  assert.deepEqual(await readdir(directory), []);
});

for (const phase of ['before-rename', 'after-rename']) test(`process crash ${phase} preserves a complete snapshot and safe retry`, async (t) => {
  const { directory, store, target, lock } = await setup(t); await store.execute(create(), context());
  const program = `import {openSpaceStore} from ${JSON.stringify(new URL('../src/store.mjs', import.meta.url).href)};
    import {context,place} from ${JSON.stringify(new URL('./fixtures.mjs', import.meta.url).href)};
    import {readdirSync,readFileSync} from 'node:fs';
    const directory=process.argv[1], target=process.argv[2], phase=process.argv[3];
    const guard=()=>{ if(phase==='before-rename' ? readdirSync(directory).some(f=>f.endsWith('.tmp')) :
      JSON.parse(readFileSync(target,'utf8')).revision===2) process.exit(0); };
    const store=await openSpaceStore({directory,project_id:'demo/shared'});
    await store.execute(place('crash'),context('team-a',{assertAuthorized:guard})); process.exit(2);`;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', program, directory, target, phase],
      { stdio: 'ignore', timeout: 5000 });
    child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('CRASH_TEST_FAILED')));
  });
  assert.equal((await store.read(context())).revision, phase === 'before-rename' ? 1 : 2);
  await rejects(() => store.execute(place('crash'), context()), 'STORE_BUSY');
  // The test has verified child exit. Production recovery must stop/verify ALL writers first.
  await rm(lock);
  for (const file of await readdir(directory)) if (file.endsWith('.tmp')) await rm(join(directory, file));
  const reopened = await openSpaceStore({ directory, project_id });
  const retry = await reopened.execute(place('crash'), context());
  assert.equal(retry.duplicate, phase === 'after-rename');
  assert.equal(retry.view.revision, 2); assert.equal(retry.view.rooms[0].items.length, 1);
});
