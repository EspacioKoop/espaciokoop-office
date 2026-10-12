import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  mkdirSync,
  statSync,
  readdirSync,
  watch
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  saveJournal,
  loadJournal,
  saveRecipe,
  loadRecipe,
  snapshotAll,
  restoreSnapshot
} from '../src/persistence-adapter.mjs';
import { PersistenceError } from '../src/persistence-types.mjs';

function withTempDataDir(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'office-restore-failures-test-'));
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
  title: 'Diario de prueba',
  entries: [
    {
      id: 'e-1',
      timestamp: new Date().toISOString(),
      author: 'eloy',
      content: 'Contenido inicial.'
    }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const sampleRecipe = {
  id: 'r-202',
  title: 'Receta de prueba',
  description: 'Descripción de prueba.',
  steps: ['Paso 1', 'Paso 2'],
  tags: ['test'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

test('snapshots parcialmente inválidos no pisan datos existentes', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await saveRecipe(sampleRecipe);
  const originalSnapshot = await snapshotAll();

  const invalidSnapshots = [
    {
      description: 'receta con esquema inválido',
      snapshot: {
        version: 1,
        journals: [sampleJournal],
        recipes: [{ ...sampleRecipe, steps: 'invalid_type_not_array' }]
      }
    },
    {
      description: 'diario con propiedad extra no permitida',
      snapshot: {
        version: 1,
        journals: [{ ...sampleJournal, forbiddenProperty: true }],
        recipes: [sampleRecipe]
      }
    },
    {
      description: 'identificadores duplicados en diarios',
      snapshot: {
        version: 1,
        journals: [sampleJournal, sampleJournal],
        recipes: [sampleRecipe]
      }
    },
    {
      description: 'versión de snapshot inválida',
      snapshot: {
        version: 999,
        journals: [sampleJournal],
        recipes: [sampleRecipe]
      }
    },
    {
      description: 'propiedad principal extra en snapshot',
      snapshot: {
        version: 1,
        journals: [sampleJournal],
        recipes: [sampleRecipe],
        unknownField: 'bad'
      }
    }
  ];

  for (const { description, snapshot } of invalidSnapshots) {
    await assert.rejects(
      () => restoreSnapshot(snapshot, { replace: true }),
      (err) => err instanceof PersistenceError && err.code === 'INVALID_SCHEMA',
      `Debería fallar por ${description}`
    );

    const currentSnapshot = await snapshotAll();
    assert.deepEqual(currentSnapshot, originalSnapshot, `Los datos en disco cambiaron tras error por ${description}`);
  }
}));

test('reemplazo exige replace:true para restaurar sobre datos existentes', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await saveRecipe(sampleRecipe);
  const originalSnapshot = await snapshotAll();

  const newSnapshot = {
    version: 1,
    journals: [{ ...sampleJournal, title: 'Diario reemplazado' }],
    recipes: [{ ...sampleRecipe, title: 'Receta reemplazada' }]
  };

  await assert.rejects(
    () => restoreSnapshot(newSnapshot),
    (err) => err instanceof PersistenceError && err.code === 'ALREADY_EXISTS'
  );

  await assert.rejects(
    () => restoreSnapshot(newSnapshot, { replace: false }),
    (err) => err instanceof PersistenceError && err.code === 'ALREADY_EXISTS'
  );

  assert.deepEqual(await snapshotAll(), originalSnapshot);
}));

test('el journal y las recetas previas se preservan si una restauración falla', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await saveRecipe(sampleRecipe);
  const originalSnapshot = await snapshotAll();

  const targetSnapshot = {
    version: 1,
    journals: [{ ...sampleJournal, title: 'Diario nuevo' }],
    recipes: [{ ...sampleRecipe, title: 'Receta nueva' }]
  };

  const root = process.env.OFFICE_DATA_DIR;
  const watcher = watch(root, (_eventType, filename) => {
    if (filename && filename.includes('.restore-backup-')) {
      const entries = readdirSync(root);
      for (const entry of entries) {
        if (entry.startsWith('.restore-stage-')) {
          rmSync(join(root, entry, 'recipes'), { recursive: true, force: true });
        }
      }
    }
  });

  try {
    await assert.rejects(
      () => restoreSnapshot(targetSnapshot, { replace: true }),
      (err) => err instanceof PersistenceError && err.code === 'RESTORE_FAILED'
    );
  } finally {
    watcher.close();
  }

  assert.deepEqual(await snapshotAll(), originalSnapshot);
  assert.deepEqual(await loadJournal('j-101'), sampleJournal);
  assert.deepEqual(await loadRecipe('r-202'), sampleRecipe);
}));

test('rechazar documentos con ID distinto a fichero', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await saveRecipe(sampleRecipe);

  const journalPath = join(process.env.OFFICE_DATA_DIR, 'journals', 'j-101.json');
  writeFileSync(
    journalPath,
    JSON.stringify({ ...sampleJournal, id: 'j-spoofed-id' }, null, 2),
    'utf8'
  );

  await assert.rejects(
    () => loadJournal('j-101'),
    (err) => err instanceof PersistenceError && err.code === 'CORRUPT_FILE'
  );

  await assert.rejects(
    () => snapshotAll(),
    (err) => err instanceof PersistenceError && err.code === 'CORRUPT_FILE'
  );

  const recipePath = join(process.env.OFFICE_DATA_DIR, 'recipes', 'r-202.json');
  writeFileSync(
    recipePath,
    JSON.stringify({ ...sampleRecipe, id: 'r-spoofed-id' }, null, 2),
    'utf8'
  );

  await assert.rejects(
    () => loadRecipe('r-202'),
    (err) => err instanceof PersistenceError && err.code === 'CORRUPT_FILE'
  );
}));

test('enlaces simbólicos a ficheros o colecciones no permiten salir de OFFICE_DATA_DIR', withTempDataDir(async () => {
  const outsideDir = mkdtempSync(join(tmpdir(), 'office-outside-dir-'));
  try {
    const victimFile = join(outsideDir, 'victim.json');
    writeFileSync(victimFile, JSON.stringify({ secret: 'sensible' }), 'utf8');

    const root = process.env.OFFICE_DATA_DIR;
    mkdirSync(join(root, 'journals'), { recursive: true });

    const symlinkFile = join(root, 'journals', 'j-symlink.json');
    symlinkSync(victimFile, symlinkFile);

    await assert.rejects(
      () => loadJournal('j-symlink'),
      (err) => err instanceof PersistenceError && err.code === 'UNSAFE_PATH'
    );

    await assert.rejects(
      () => snapshotAll(),
      (err) => err instanceof PersistenceError && err.code === 'UNSAFE_PATH'
    );

    await assert.rejects(
      () => saveJournal({ ...sampleJournal, id: 'j-symlink' }),
      (err) => err instanceof PersistenceError && err.code === 'UNSAFE_PATH'
    );

    rmSync(symlinkFile, { force: true });
    rmSync(join(root, 'journals'), { recursive: true, force: true });

    const outsideCollectionDir = join(outsideDir, 'external-journals');
    mkdirSync(outsideCollectionDir, { recursive: true });
    symlinkSync(outsideCollectionDir, join(root, 'journals'));

    await assert.rejects(
      () => snapshotAll(),
      (err) => err instanceof PersistenceError && err.code === 'UNSAFE_PATH'
    );

    await assert.rejects(
      () => saveJournal(sampleJournal),
      (err) => err instanceof PersistenceError && err.code === 'UNSAFE_PATH'
    );

    await assert.rejects(
      () => restoreSnapshot({ version: 1, journals: [sampleJournal], recipes: [] }, { replace: true }),
      (err) => err instanceof PersistenceError && err.code === 'UNSAFE_PATH'
    );
  } finally {
    rmSync(outsideDir, { recursive: true, force: true });
  }
}));

test('archivos auxiliares de staging no aparecen como documentos', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await saveRecipe(sampleRecipe);

  const root = process.env.OFFICE_DATA_DIR;

  mkdirSync(join(root, '.restore-stage-9999', 'journals'), { recursive: true });
  writeFileSync(
    join(root, '.restore-stage-9999', 'journals', 'j-fake.json'),
    JSON.stringify({ ...sampleJournal, id: 'j-fake' }),
    'utf8'
  );

  mkdirSync(join(root, '.restore-backup-8888-journals'), { recursive: true });
  writeFileSync(
    join(root, '.restore-backup-8888-journals', 'j-backup.json'),
    JSON.stringify({ ...sampleJournal, id: 'j-backup' }),
    'utf8'
  );

  writeFileSync(join(root, 'journals', 'j-101.json.tmp-1234.tmp'), 'tmp_data', 'utf8');
  writeFileSync(join(root, 'journals', 'notas.txt'), 'texto libre', 'utf8');
  writeFileSync(join(root, 'recipes', 'auxiliar.sh'), '#!/bin/sh', 'utf8');
  writeFileSync(join(root, 'fuera.json'), '{}', 'utf8');

  const snapshot = await snapshotAll();
  assert.equal(snapshot.journals.length, 1);
  assert.equal(snapshot.recipes.length, 1);
  assert.deepEqual(snapshot.journals[0], sampleJournal);
  assert.deepEqual(snapshot.recipes[0], sampleRecipe);

  const journalFiles = readdirSync(join(root, 'journals'));
  assert.ok(journalFiles.includes('j-101.json.tmp-1234.tmp'));
  assert.ok(journalFiles.includes('notas.txt'));
}));

test('permisos 0600 en documentos JSON y 0700 en directorios de colecciones', withTempDataDir(async () => {
  await saveJournal(sampleJournal);
  await saveRecipe(sampleRecipe);

  const root = process.env.OFFICE_DATA_DIR;

  if (process.platform !== 'win32') {
    const journalDirStat = statSync(join(root, 'journals'));
    assert.equal(journalDirStat.mode & 0o777, 0o700);

    const recipeDirStat = statSync(join(root, 'recipes'));
    assert.equal(recipeDirStat.mode & 0o777, 0o700);

    const journalFileStat = statSync(join(root, 'journals', 'j-101.json'));
    assert.equal(journalFileStat.mode & 0o777, 0o600);

    const recipeFileStat = statSync(join(root, 'recipes', 'r-202.json'));
    assert.equal(recipeFileStat.mode & 0o777, 0o600);
  }

  const newSnapshot = {
    version: 1,
    journals: [{ ...sampleJournal, id: 'j-303' }],
    recipes: [{ ...sampleRecipe, id: 'r-404' }]
  };

  await restoreSnapshot(newSnapshot, { replace: true });

  if (process.platform !== 'win32') {
    const restoredJournalStat = statSync(join(root, 'journals', 'j-303.json'));
    assert.equal(restoredJournalStat.mode & 0o777, 0o600);

    const restoredRecipeStat = statSync(join(root, 'recipes', 'r-404.json'));
    assert.equal(restoredRecipeStat.mode & 0o777, 0o600);
  }
}));
