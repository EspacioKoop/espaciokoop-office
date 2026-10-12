import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  saveJournal,
  loadJournal,
  saveRecipe,
  loadRecipe,
  snapshotAll,
  restoreSnapshot,
  corruptFile
} from '../src/persistence-adapter.mjs';
import { PersistenceError } from '../src/persistence-types.mjs';

function withTempDataDir(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'office-data-test-'));
    const oldDir = process.env.OFFICE_DATA_DIR;
    process.env.OFFICE_DATA_DIR = dir;
    try {
      await fn();
    } finally {
      if (oldDir !== undefined) {
        process.env.OFFICE_DATA_DIR = oldDir;
      } else {
        delete process.env.OFFICE_DATA_DIR;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

const sampleJournal = {
  id: 'j-101',
  title: 'Diario de pruebas',
  entries: [
    {
      id: 'e-1',
      timestamp: new Date().toISOString(),
      author: 'eloy',
      content: 'Inicio del diario de pruebas.'
    }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const sampleRecipe = {
  id: 'r-202',
  title: 'Receta de despliegue',
  description: 'Pasos para el despliegue automático.',
  steps: ['Clonar repo', 'Ejecutar npm test', 'Publicar artefacto'],
  tags: ['ci', 'devops'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

test('saveJournal y loadJournal guardan y leen correctamente', withTempDataDir(async () => {
  const saved = await saveJournal(sampleJournal);
  assert.deepEqual(saved, sampleJournal);

  const loaded = await loadJournal('j-101');
  assert.deepEqual(loaded, sampleJournal);
}));

test('loadJournal lanza error NOT_FOUND para diarios inexistentes', withTempDataDir(async () => {
  await assert.rejects(
    async () => loadJournal('inexistente'),
    (err) => err instanceof PersistenceError && err.code === 'NOT_FOUND'
  );
}));

test('saveRecipe y loadRecipe guardan y leen correctamente', withTempDataDir(async () => {
  const saved = await saveRecipe(sampleRecipe);
  assert.deepEqual(saved, sampleRecipe);

  const loaded = await loadRecipe('r-202');
  assert.deepEqual(loaded, sampleRecipe);
}));

test('loadRecipe lanza error NOT_FOUND para recetas inexistentes', withTempDataDir(async () => {
  await assert.rejects(
    async () => loadRecipe('inexistente'),
    (err) => err instanceof PersistenceError && err.code === 'NOT_FOUND'
  );
}));

test('los identificadores no válidos son rechazados', withTempDataDir(async () => {
  await assert.rejects(
    async () => loadJournal('../bad-id'),
    (err) => err instanceof PersistenceError && err.code === 'INVALID_INPUT'
  );

  await assert.rejects(
    async () => loadRecipe('../bad-id'),
    (err) => err instanceof PersistenceError && err.code === 'INVALID_INPUT'
  );
}));

test('corruptFile simula corrupción y loadX lanza CORRUPT_FILE', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await corruptFile('journals/j-101.json');

  await assert.rejects(
    async () => loadJournal('j-101'),
    (err) => err instanceof PersistenceError && err.code === 'CORRUPT_FILE'
  );
}));

test('saveJournal y saveRecipe rechazan esquemas inválidos con INVALID_SCHEMA', withTempDataDir(async () => {
  const badJournal = { ...sampleJournal, extraProperty: 'not_allowed' };
  await assert.rejects(
    async () => saveJournal(badJournal),
    (err) => err instanceof PersistenceError && err.code === 'INVALID_SCHEMA'
  );

  const badRecipe = { ...sampleRecipe, steps: 'not_an_array' };
  await assert.rejects(
    async () => saveRecipe(badRecipe),
    (err) => err instanceof PersistenceError && err.code === 'INVALID_SCHEMA'
  );
}));

test('snapshotAll y restoreSnapshot realizan round-trip exacto', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await saveRecipe(sampleRecipe);

  const snapshot = await snapshotAll();
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.journals.length, 1);
  assert.equal(snapshot.recipes.length, 1);
  assert.deepEqual(snapshot.journals[0], sampleJournal);
  assert.deepEqual(snapshot.recipes[0], sampleRecipe);

  const secondDir = mkdtempSync(join(tmpdir(), 'office-data-test2-'));
  const firstDir = process.env.OFFICE_DATA_DIR;
  try {
    process.env.OFFICE_DATA_DIR = secondDir;
    await restoreSnapshot(snapshot);

    const restoredSnapshot = await snapshotAll();
    assert.deepEqual(restoredSnapshot, snapshot);
  } finally {
    process.env.OFFICE_DATA_DIR = firstDir;
    rmSync(secondDir, { recursive: true, force: true });
  }
}));

test('escritura y lectura simultáneas sintéticas operan de forma segura', withTempDataDir(async () => {
  await saveJournal(sampleJournal);

  const writeOperations = Array.from({ length: 10 }, (_, i) => {
    const updatedJournal = {
      ...sampleJournal,
      title: `Diario iteración ${i}`,
      updatedAt: new Date().toISOString()
    };
    return saveJournal(updatedJournal);
  });

  const readOperations = Array.from({ length: 10 }, () => loadJournal('j-101'));

  const results = await Promise.allSettled([...writeOperations, ...readOperations]);
  for (const res of results) {
    assert.equal(res.status, 'fulfilled');
  }

  const finalJournal = await loadJournal('j-101');
  assert.ok(finalJournal.title.startsWith('Diario iteración'));
}));
