import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants, readdirSync, readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpaceFileStore } from '../src/store.mjs';
import { project, context, create, place, runChild } from './fixtures.mjs';

async function setup(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'office-space-hardening-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, store: new SpaceFileStore({ directory, project_id: project }) };
}
const rejects = (fn, code) => assert.rejects(fn, { name: 'SpaceError', code, message: code });
function mockFs(t, method, replacement) {
  t.mock.method(fs, method, replacement); syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

for (const key of ['type', 'label', 'symbol', 'non-enumerable', 'prototype'])
  test(`regresión: almacén no normaliza campos prohibidos (${key})`, async (t) => {
    const { store } = await setup(t); const command = create(); let calls = 0;
    if (key === 'symbol') command[Symbol('extra')] = true;
    else if (key === 'non-enumerable') Object.defineProperty(command, 'extra', { value: true });
    else if (key === 'prototype') Object.setPrototypeOf(command, null);
    else Object.defineProperty(command, key, { get() { calls++; return create()[key]; } });
    await rejects(() => store.apply(command, context()), 'INVALID_INPUT');
    assert.equal(calls, 0); assert.equal((await store.read(context())).revision, 0);
  });
test('regresión: archivo con enlace duro no se lee ni se modifica', async (t) => {
  const { directory, store } = await setup(t); await store.apply(create(), context());
  const copy = join(directory, 'copy'); await fs.link(store.filename, copy);
  const before = await fs.readFile(copy);
  await rejects(() => store.read(context()), 'CORRUPT_STATE');
  await rejects(() => store.apply(place(), context()), 'CORRUPT_STATE');
  assert.deepEqual(await fs.readFile(copy), before);
});
test('regresión: lectura de archivo especial usa O_NONBLOCK y falla cerrado', async (t) => {
  const { store } = await setup(t); await store.prepare();
  const open = fs.open; let flags;
  mockFs(t, 'open', async (path, mode, ...args) => {
    if (path !== store.filename) return open(path, mode, ...args);
    flags = mode;
    return { stat: async () => ({ isFile: () => false }), close: async () => {} };
  });
  await rejects(() => store.read(context()), 'CORRUPT_STATE');
  assert.ok(flags & constants.O_NONBLOCK);
});
for (const target of ['directorio', 'archivo']) test(`regresión: propietario incorrecto de ${target}`, async (t) => {
  const { store } = await setup(t); await store.apply(create(), context());
  if (target === 'directorio') {
    const lstat = fs.lstat;
    mockFs(t, 'lstat', async (...args) => { const info = await lstat(...args); info.uid++; return info; });
  } else {
    const open = fs.open;
    mockFs(t, 'open', async (...args) => {
      const handle = await open(...args);
      if (args[0] === store.filename) {
        const stat = handle.stat.bind(handle);
        handle.stat = async () => { const info = await stat(); info.uid++; return info; };
      }
      return handle;
    });
  }
  await rejects(() => store.read(context()), target === 'directorio' ? 'UNSAFE_STORE_DIRECTORY' : 'CORRUPT_STATE');
});
for (const when of ['entre operaciones', 'antes de rename'])
  test(`regresión: sustitución del directorio ${when}`, async (t) => {
    const { directory, store } = await setup(t); await store.apply(create(), context());
    const displaced = `${directory}-displaced`; t.after(() => fs.rm(displaced, { recursive: true, force: true }));
    const replace = async () => { await fs.rename(directory, displaced); await fs.mkdir(directory, { mode: 0o700 }); };
    if (when === 'entre operaciones') {
      await replace(); await rejects(() => store.read(context()), 'UNSAFE_STORE_DIRECTORY');
    } else {
      const persist = store.persist.bind(store);
      store.persist = async (...args) => {
        await replace();
        // Preserve the test lock so cleanup does not mask the directory check's error.
        await fs.rename(join(displaced, store.lockname.split('/').at(-1)), store.lockname);
        return persist(...args);
      };
      await rejects(() => store.apply(place(), context()), 'UNSAFE_STORE_DIRECTORY');
      assert.equal((await fs.readdir(directory)).some(name => name.endsWith('.json')), false);
    }
    const saved = JSON.parse(await fs.readFile(join(displaced, store.filename.split('/').at(-1))));
    assert.equal(saved.revision, 1);
  });
test('regresión: revocación durante limpieza impide devolver vista confirmada', async (t) => {
  const { store } = await setup(t); let revoked = false;
  const unlink = fs.unlink;
  mockFs(t, 'unlink', async (path) => { if (path === store.lockname) revoked = true; return unlink(path); });
  await rejects(() => store.apply(create(), context({ assertAuthorized: () => !revoked })), 'ACCESS_REVOKED');
  assert.equal((await store.read(context())).revision, 1);
  assert.equal((await store.apply(create(), context())).duplicate, true);
});
test('regresión: rename no cede el turno después de la guardia final', async (t) => {
  const { directory, store } = await setup(t); await store.apply(create(), context());
  const rename = fs.rename; let revoked = false, observedRevision;
  // Model an asynchronous rename delayed behind the revocation microtask.
  mockFs(t, 'rename', async (...args) => { await Promise.resolve(); return rename(...args); });
  const ctx = context({ assertAuthorized() {
    if (!revoked && readdirSync(directory).some(name => name.endsWith('.tmp'))) {
      queueMicrotask(() => { observedRevision = JSON.parse(readFileSync(store.filename)).revision; revoked = true; });
    }
    return !revoked;
  } });
  await rejects(() => store.apply(place(), ctx), 'ACCESS_REVOKED');
  assert.equal(observedRevision, 2);
  assert.equal((await store.apply(place(), context())).duplicate, true);
});
test('cobertura: fsync de directorio fallido conserva COMMIT_UNCERTAIN y recibo', async (t) => {
  const { directory, store } = await setup(t); const open = fs.open;
  mockFs(t, 'open', async (...args) => {
    const handle = await open(...args);
    if (args[0] === directory) handle.sync = async () => { throw new Error('synthetic-fsync-failure'); };
    return handle;
  });
  await rejects(() => store.apply(create(), context()), 'COMMIT_UNCERTAIN');
  assert.equal((await store.read(context())).revision, 1);
  assert.equal((await store.apply(create(), context())).duplicate, true);
});
test('cobertura: revocación detectada tras escribir temporal deja estado intacto', async (t) => {
  const { directory, store } = await setup(t);
  await rejects(() => store.apply(create(), context({
    assertAuthorized: () => !readdirSync(directory).some(name => name.endsWith('.tmp')),
  })), 'ACCESS_REVOKED');
  assert.deepEqual(await fs.readdir(directory), []);
});
test('cobertura: fallo de dominio libera bloqueo y acceso revocado no lo crea', async (t) => {
  const { directory, store } = await setup(t);
  await rejects(() => store.apply(create(), context({ signal: AbortSignal.abort() })), 'ACCESS_REVOKED');
  assert.deepEqual(await fs.readdir(directory), []);
  await store.apply(create(), context()); const before = await fs.readFile(store.filename);
  await rejects(() => store.apply(place({ expected_revision: 0 }), context()), 'REVISION_CONFLICT');
  assert.deepEqual(await fs.readFile(store.filename), before);
  assert.equal((await fs.readdir(directory)).length, 1);
  await store.apply(place(), context());
});
test('cobertura: directorio en lugar de snapshot se rechaza', async (t) => {
  const { store } = await setup(t); await fs.mkdir(store.filename, { mode: 0o700 });
  await rejects(() => store.read(context()), 'CORRUPT_STATE');
  await rejects(() => store.apply(create(), context()), 'CORRUPT_STATE');
});
test('cobertura: permisos de creación y separación de proyectos', async (t) => {
  const { directory, store } = await setup(t); await store.apply(create(), context());
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(store.filename)).mode & 0o777, 0o600);
  const other = new SpaceFileStore({ directory, project_id: 'fixture/other' });
  await rejects(() => other.read(context()), 'FORBIDDEN');
  assert.equal((await other.read(context({ project_id: 'fixture/other' }))).revision, 0);
  assert.equal((await store.read(context())).revision, 1);
});
test('cobertura: directorio enlazado e identificador de proyecto inválido', async (t) => {
  const { directory } = await setup(t), actual = join(directory, 'actual'), alias = join(directory, 'alias');
  await fs.mkdir(actual, { mode: 0o700 }); await fs.symlink(actual, alias);
  const linked = new SpaceFileStore({ directory: alias, project_id: project });
  await rejects(() => linked.read(context()), 'UNSAFE_STORE_DIRECTORY');
  assert.throws(() => new SpaceFileStore({ directory, project_id: '../outside' }), { code: 'INVALID_INPUT' });
});
test('cobertura: dos procesos compiten por bloqueo y revisión, sin actualización perdida', async (t) => {
  const { directory, store } = await setup(t); await store.apply(create(), context());
  const program = `const store = new SpaceFileStore({ directory: process.argv[1], project_id: project });
    const id = process.argv[2]; let result;
    try { await store.apply(place({ item_id: id, idempotency_key: id, x: id === 'a' ? 3 : 8 }), context()); result = 'COMMITTED'; }
    catch (error) { result = error.code; }
    console.log(JSON.stringify(result));`;
  const outcomes = await Promise.all([runChild(program, [directory, 'a']), runChild(program, [directory, 'b'])]);
  assert.equal(outcomes.filter(value => value === 'COMMITTED').length, 1);
  assert.ok(outcomes.every(value => ['COMMITTED', 'STORE_BUSY', 'REVISION_CONFLICT'].includes(value)));
  const view = await store.read(context()); assert.equal(view.revision, 2); assert.equal(view.rooms[0].items.length, 1);
  const missing = view.rooms[0].items[0].id === 'a' ? 'b' : 'a';
  await store.apply(place({ item_id: missing, idempotency_key: missing, expected_revision: 2,
    x: missing === 'a' ? 3 : 8 }), context());
  assert.equal((await store.read(context())).rooms[0].items.length, 2);
});
for (const phase of ['before-rename', 'after-rename']) test(`cobertura: caída ${phase} y reintento seguro`, async (t) => {
  const { directory, store } = await setup(t); await store.apply(create(), context());
  const original = await fs.readFile(store.filename);
  assert.equal(await runChild(`
    import { readdirSync, readFileSync } from 'node:fs';
    const store = new SpaceFileStore({ directory: process.argv[1], project_id: project });
    const phase = process.argv[2];
    await store.apply(place(), context({ assertAuthorized() {
      const boundary = phase === 'before-rename'
        ? readdirSync(store.directory).some(name => name.endsWith('.tmp'))
        : JSON.parse(readFileSync(store.filename)).revision === 2;
      if (boundary) { console.log(JSON.stringify(phase)); process.exit(0); }
      return true;
    } }));
    process.exit(2);
  `, [directory, phase]), phase);
  const snapshot = JSON.parse(await fs.readFile(store.filename));
  assert.equal(snapshot.revision, phase === 'before-rename' ? 1 : 2);
  if (phase === 'before-rename') assert.deepEqual(await fs.readFile(store.filename), original);
  await rejects(() => store.apply(place(), context()), 'STORE_BUSY');
  // Child termination is confirmed, and these are the only writers of this synthetic fixture.
  await fs.rm(store.lockname);
  for (const name of await fs.readdir(directory)) if (name.endsWith('.tmp')) await fs.rm(join(directory, name));
  const reopened = new SpaceFileStore({ directory, project_id: project });
  const retry = await reopened.apply(place(), context());
  assert.equal(retry.duplicate, phase === 'after-rename');
  assert.equal(retry.view.revision, 2); assert.equal(retry.view.rooms[0].items.length, 1);
});
