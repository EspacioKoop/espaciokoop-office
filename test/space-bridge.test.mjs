import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spaceFailure, createSpaceBridge } from '../src/space-bridge.mjs';
import { SpaceError } from '../packages/office-space/src/space.mjs';

test('spaceFailure: mapea correctamente errores conocidos de SpaceError a códigos HTTP', () => {
  const expectedMappings = [
    ['FORBIDDEN', 403],
    ['ACCESS_REVOKED', 403],
    ['NOT_FOUND', 404],
    ['REVISION_CONFLICT', 409],
    ['IDEMPOTENCY_CONFLICT', 409],
    ['RESOURCE_EXISTS', 409],
    ['POSITION_BLOCKED', 409],
    ['ROOM_NOT_EMPTY', 409],
    ['CAPACITY_EXCEEDED', 409],
    ['INVALID_INPUT', 400],
    ['STORE_BUSY', 503],
    ['COMMIT_UNCERTAIN', 503],
  ];

  for (const [code, expectedStatus] of expectedMappings) {
    const error = new SpaceError(code);
    const result = spaceFailure(error);
    assert.deepEqual(result, {
      status: expectedStatus,
      body: { error: code },
    });
  }
});

test('spaceFailure: convierte errores no mapeados o internos en SPACE_UNAVAILABLE 503 y registra en console.error', () => {
  const originalConsoleError = console.error;
  let loggedMessage = '';
  console.error = (msg) => {
    loggedMessage = msg;
  };

  try {
    const genericError = new Error('Database disk error');
    const res1 = spaceFailure(genericError);
    assert.deepEqual(res1, {
      status: 503,
      body: { error: 'SPACE_UNAVAILABLE' },
    });
    assert.equal(loggedMessage, 'Office space: operación no disponible (error interno).');

    loggedMessage = '';
    const unmappedSpaceError = new SpaceError('CORRUPT_STATE');
    const res2 = spaceFailure(unmappedSpaceError);
    assert.deepEqual(res2, {
      status: 503,
      body: { error: 'SPACE_UNAVAILABLE' },
    });
    assert.equal(loggedMessage, 'Office space: operación no disponible (error interno).');
  } finally {
    console.error = originalConsoleError;
  }
});

test('createSpaceBridge: valida configuración requerida (projectId y directory si no es demo)', async () => {
  const noProject = createSpaceBridge({ mode: 'demo', projectId: '', now: () => 1000, onCommit: () => {} });
  await assert.rejects(
    () => noProject.read('aurora', () => true),
    { message: 'Space not configured' }
  );

  const noDir = createSpaceBridge({ mode: 'live', projectId: 'demo/observatorio', now: () => 1000, onCommit: () => {} });
  await assert.rejects(
    () => noDir.read('aurora', () => true),
    { message: 'Space not configured' }
  );
});

test('createSpaceBridge: flujo en modo demo crea directorio temporal y lo elimina al cerrar', async () => {
  const bridge = createSpaceBridge({
    mode: 'demo',
    projectId: 'demo/observatorio',
    now: () => 1000,
    onCommit: () => {},
  });

  const view = await bridge.read('aurora', () => true);
  assert.equal(view.project_id, 'demo/observatorio');
  assert.equal(view.revision, 0);

  await bridge.close();

  await assert.rejects(
    () => bridge.read('aurora', () => true),
    { message: 'Space closed' }
  );
});

test('createSpaceBridge: flujo en modo live conserva el directorio asignado tras cerrar', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'space-bridge-test-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  let commits = 0;
  const bridge = createSpaceBridge({
    mode: 'live',
    directory: dir,
    projectId: 'demo/observatorio',
    now: () => 1000,
    onCommit: () => { commits++; },
  });

  let guardCalls = 0;
  const guard = () => { guardCalls++; return true; };

  const viewBefore = await bridge.read('aurora', guard);
  assert.ok(guardCalls > 0);
  assert.equal(viewBefore.revision, 0);

  const command = {
    type: 'room.create',
    idempotency_key: 'init-room',
    expected_revision: 0,
    room_id: 'lobby',
    label: 'Sala principal',
    scope: 'common',
    width: 10,
    height: 10,
  };

  guardCalls = 0;
  const applyResult = await bridge.apply('aurora', guard, command);
  assert.ok(guardCalls > 0);
  assert.equal(commits, 1);
  assert.equal(applyResult.duplicate, false);
  assert.equal(applyResult.view.revision, 1);

  // Reintento idéntico no incrementa commits ni ejecuta onCommit
  const duplicateResult = await bridge.apply('aurora', guard, command);
  assert.equal(commits, 1);
  assert.equal(duplicateResult.duplicate, true);

  await bridge.close();

  // El directorio en disco persistente debe conservarse tras close()
  const dirInfo = await stat(dir);
  assert.ok(dirInfo.isDirectory());
});

test('createSpaceBridge: guardias de autorización fallidas rechazan promesas de forma segura', async () => {
  const bridge = createSpaceBridge({
    mode: 'demo',
    projectId: 'demo/observatorio',
    now: () => 1000,
    onCommit: () => {},
  });

  const revokedGuard = () => {
    throw new SpaceError('FORBIDDEN');
  };

  await assert.rejects(
    () => bridge.read('aurora', revokedGuard),
    (err) => err instanceof SpaceError && err.code === 'FORBIDDEN'
  );

  const command = {
    type: 'room.create',
    idempotency_key: 'room-fail',
    expected_revision: 0,
    room_id: 'lobby',
    label: 'Sala',
    scope: 'common',
    width: 10,
    height: 10,
  };

  await assert.rejects(
    () => bridge.apply('aurora', revokedGuard, command),
    (err) => err instanceof SpaceError && err.code === 'FORBIDDEN'
  );

  await bridge.close();
});

test('createSpaceBridge: al cerrar (close), rechaza operaciones posteriores y espera tareas en curso', async () => {
  const bridge = createSpaceBridge({
    mode: 'demo',
    projectId: 'demo/observatorio',
    now: () => 1000,
    onCommit: () => {},
  });

  const readPromise = bridge.read('aurora', () => true);
  const closePromise = bridge.close();

  const [view] = await Promise.all([readPromise, closePromise]);
  assert.equal(view.project_id, 'demo/observatorio');

  await assert.rejects(
    () => bridge.apply('aurora', () => true, {}),
    { message: 'Space closed' }
  );
});
