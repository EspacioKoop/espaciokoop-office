import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, stat, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpaceFileStore } from '../src/store.mjs';

const project = 'fixture/office';
const context = (actor = 'human-a', extra = {}) => ({ actor_id: actor, owner_id: actor, kind: 'human', project_id: project,
  capabilities: ['space.read', 'space.edit', 'space.edit_common', 'space.move'], now: 1700000000000,
  assertAuthorized: () => true, ...extra });
const create = (extra = {}) => ({ type: 'room.create', room_id: 'lobby', scope: 'common', label: 'Fixture común',
  width: 12, height: 10, expected_revision: 0, idempotency_key: 'r1', ...extra });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'office-space-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new SpaceFileStore({ directory, project_id: project }) };
}
const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('un segundo proceso/servicio puede restaurar el mismo estado y recibo', async (t) => {
  const { directory, store } = await fixture(t), original = await store.apply(create(), context());
  const reopened = new SpaceFileStore({ directory, project_id: project });
  assert.deepEqual(await reopened.read(context('human-b')), original.view);
  assert.equal((await reopened.apply(create(), context())).duplicate, true);
  assert.equal((await stat(store.filename)).mode & 0o077, 0);
});
test('dos instancias compiten por un único escritor; no hay actualización perdida', async (t) => {
  const { directory, store } = await fixture(t);
  const other = new SpaceFileStore({ directory, project_id: project });
  const results = await Promise.allSettled([store.apply(create(), context()), other.apply(create(), context('human-b'))]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(['STORE_BUSY', 'RESOURCE_EXISTS'].includes(results.find((r) => r.status === 'rejected').reason.code));
  assert.equal((await other.read(context())).revision, 1);
});
test('dos propietarios obtienen conflicto y pueden reaplicar sobre nueva revisión', async (t) => {
  const { store } = await fixture(t); await store.apply(create(), context());
  const command = { type: 'room.update', room_id: 'lobby', label: 'Editada A', width: 12, height: 10,
    expected_revision: 1, idempotency_key: 'e-a' };
  await store.apply(command, context());
  const b = { ...command, label: 'Editada B', idempotency_key: 'e-b' };
  await rejects(store.apply(b, context('human-b')), 'REVISION_CONFLICT');
  await store.apply({ ...b, expected_revision: 2 }, context('human-b'));
  assert.equal((await store.read(context())).rooms[0].label, 'Editada B');
});
test('revocación antes del rename impide escribir y limpia temporales/bloqueo', async (t) => {
  const { directory, store } = await fixture(t); await store.apply(create(), context());
  const before = await readFile(store.filename, 'utf8'); let revoked = false;
  const persist = store.persist.bind(store);
  store.persist = async (...args) => { revoked = true; return persist(...args); };
  await rejects(store.apply(create({ room_id: 'other', idempotency_key: 'r2' }),
    context('human-a', { assertAuthorized: () => !revoked })), 'ACCESS_REVOKED');
  assert.equal(await readFile(store.filename, 'utf8'), before);
  assert.deepEqual((await readdir(directory)).map((name) => name.slice(-5)), ['.json']);
});
test('revocación durante lectura no devuelve la proyección ya cargada', async (t) => {
  const { store } = await fixture(t); await store.apply(create(), context()); let revoked = false;
  const load = store.load.bind(store); store.load = async () => { const s = await load(); revoked = true; return s; };
  await rejects(store.read(context('human-a', { assertAuthorized: () => !revoked })), 'ACCESS_REVOKED');
});
test('proyecto ajeno no se lee ni se escribe; nombres no se usan como rutas', async (t) => {
  const { directory, store } = await fixture(t);
  await rejects(store.read(context('human-b', { project_id: 'other' })), 'FORBIDDEN');
  await rejects(store.apply(create(), context('human-b', { project_id: 'other' })), 'FORBIDDEN');
  assert.deepEqual(await readdir(directory), []);
  assert.equal(store.filename.includes('fixture/office'), false);
});
test('corrupción no reinicia silenciosamente el mundo', async (t) => {
  const { store } = await fixture(t); await writeFile(store.filename, '{broken', { mode: 0o600 });
  await rejects(store.read(context()), 'CORRUPT_STATE');
  await rejects(store.apply(create(), context()), 'CORRUPT_STATE');
  assert.equal(await readFile(store.filename, 'utf8'), '{broken');
});
test('snapshot de otro proyecto se rechaza aunque esté en el fichero correcto', async (t) => {
  const { store } = await fixture(t); await store.apply(create(), context());
  const s = JSON.parse(await readFile(store.filename)); s.project_id = 'another';
  await writeFile(store.filename, JSON.stringify(s));
  await rejects(store.read(context()), 'CORRUPT_STATE');
});
test('archivo demasiado grande y permisos inseguros se rechazan', async (t) => {
  const { store } = await fixture(t);
  await writeFile(store.filename, ' '.repeat(16 * 1024 * 1024 + 1), { mode: 0o600 });
  await rejects(store.read(context()), 'CORRUPT_STATE');
  await rm(store.filename); await store.apply(create(), context()); await chmod(store.filename, 0o644);
  await rejects(store.read(context()), 'CORRUPT_STATE');
});
test('bloqueo preexistente no se roba ni borra automáticamente', async (t) => {
  const { store } = await fixture(t); await writeFile(store.lockname, '', { mode: 0o600 });
  await rejects(store.apply(create(), context()), 'STORE_BUSY');
  assert.equal((await stat(store.lockname)).isFile(), true);
});
test('directorio inseguro y enlaces simbólicos no permiten salir del almacenamiento', async (t) => {
  const { directory, store } = await fixture(t); await chmod(directory, 0o755);
  await rejects(store.read(context()), 'UNSAFE_STORE_DIRECTORY'); await chmod(directory, 0o700);
  const target = join(directory, 'target'); await writeFile(target, 'untouched', { mode: 0o600 });
  await symlink(target, store.filename); await rejects(store.read(context()), 'CORRUPT_STATE');
  assert.equal(await readFile(target, 'utf8'), 'untouched');
});
test('petición mutable queda capturada antes de las esperas', async (t) => {
  const { store } = await fixture(t), command = create(), c = context();
  const pending = store.apply(command, c); command.label = 'Changed outside'; c.actor_id = 'other';
  const result = await pending; assert.equal(result.view.rooms[0].label, 'Fixture común');
  const raw = JSON.parse(await readFile(store.filename)); assert.equal(raw.receipts[0].actor_id, 'human-a');
});

test('reinicio en un proceso Node separado conserva mundo e idempotencia', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { directory, store } = await fixture(t); await store.apply(create(), context());
  const source = `import { SpaceFileStore } from ${JSON.stringify(new URL('../src/store.mjs', import.meta.url).href)};
    const store = new SpaceFileStore(${JSON.stringify({ directory, project_id: project })});
    const context = ${JSON.stringify(context())}; context.assertAuthorized = () => true;
    const result = await store.apply(${JSON.stringify(create())}, context);
    console.log(JSON.stringify({ duplicate: result.duplicate, revision: result.view.revision }));`;
  // A fixed test program in a fresh process, with no shell and no inherited credentials.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', env: {}, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { duplicate: true, revision: 1 });
});
