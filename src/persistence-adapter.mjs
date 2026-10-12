import { mkdir, open, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PersistenceError, validateJournal, validateRecipe } from './persistence-types.mjs';

function getDataDir() {
  return resolve(process.env.OFFICE_DATA_DIR || '.office-data');
}

function getJournalPath(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new PersistenceError('INVALID_INPUT', 'ID de diario no válido.');
  }
  return join(getDataDir(), 'journals', `${id}.json`);
}

function getRecipePath(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new PersistenceError('INVALID_INPUT', 'ID de receta no válido.');
  }
  return join(getDataDir(), 'recipes', `${id}.json`);
}

async function atomicWriteFile(filepath, text) {
  const dir = dirname(filepath);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${filepath}.${randomUUID()}.tmp`;

  let handle;
  let committed = false;
  try {
    handle = await open(tmpPath, 'w', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;

    await rename(tmpPath, filepath);
    committed = true;
  } catch (error) {
    throw new PersistenceError('WRITE_FAILED', `Error al escribir el archivo: ${error.message}`);
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
    if (!committed) {
      await unlink(tmpPath).catch(() => {});
    }
  }
}

async function readAndParseJson(filepath) {
  let content;
  try {
    content = await readFile(filepath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new PersistenceError('NOT_FOUND', `Archivo no encontrado: ${filepath}`);
    }
    throw new PersistenceError('READ_FAILED', `Error al leer el archivo: ${error.message}`);
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new PersistenceError('CORRUPT_FILE', `Archivo JSON corrompido o no válido: ${filepath}`);
  }
}

export async function saveJournal(journal) {
  const validated = validateJournal(journal);
  const filepath = getJournalPath(validated.id);
  const jsonText = JSON.stringify(validated, null, 2);
  await atomicWriteFile(filepath, jsonText);
  return structuredClone(validated);
}

export async function loadJournal(id) {
  const filepath = getJournalPath(id);
  const rawData = await readAndParseJson(filepath);
  const validated = validateJournal(rawData);
  return structuredClone(validated);
}

export async function saveRecipe(recipe) {
  const validated = validateRecipe(recipe);
  const filepath = getRecipePath(validated.id);
  const jsonText = JSON.stringify(validated, null, 2);
  await atomicWriteFile(filepath, jsonText);
  return structuredClone(validated);
}

export async function loadRecipe(id) {
  const filepath = getRecipePath(id);
  const rawData = await readAndParseJson(filepath);
  const validated = validateRecipe(rawData);
  return structuredClone(validated);
}

async function listFiles(dirPath) {
  try {
    const files = await readdir(dirPath);
    return files.filter((f) => f.endsWith('.json')).map((f) => join(dirPath, f));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function snapshotAll() {
  const dataDir = getDataDir();
  const journalsDir = join(dataDir, 'journals');
  const recipesDir = join(dataDir, 'recipes');

  const journalFiles = await listFiles(journalsDir);
  const recipeFiles = await listFiles(recipesDir);

  const journals = [];
  for (const file of journalFiles) {
    const rawData = await readAndParseJson(file);
    const validated = validateJournal(rawData);
    journals.push(validated);
  }

  const recipes = [];
  for (const file of recipeFiles) {
    const rawData = await readAndParseJson(file);
    const validated = validateRecipe(rawData);
    recipes.push(validated);
  }

  journals.sort((a, b) => a.id.localeCompare(b.id));
  recipes.sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: 1,
    journals,
    recipes
  };
}

export async function restoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== 1) {
    throw new PersistenceError('INVALID_SCHEMA', 'Snapshot no válido.');
  }
  if (!Array.isArray(snapshot.journals) || !Array.isArray(snapshot.recipes)) {
    throw new PersistenceError('INVALID_SCHEMA', 'Snapshot no contiene listas válidas.');
  }

  const validatedJournals = snapshot.journals.map((j) => validateJournal(j));
  const validatedRecipes = snapshot.recipes.map((r) => validateRecipe(r));

  const dataDir = getDataDir();
  const journalsDir = join(dataDir, 'journals');
  const recipesDir = join(dataDir, 'recipes');

  await rm(journalsDir, { recursive: true, force: true });
  await rm(recipesDir, { recursive: true, force: true });

  for (const journal of validatedJournals) {
    await saveJournal(journal);
  }
  for (const recipe of validatedRecipes) {
    await saveRecipe(recipe);
  }
}

export async function corruptFile(filepath) {
  const targetPath = resolve(getDataDir(), filepath);
  await writeFile(targetPath, '<<<CORRUPT_JSON_DATA>>>', 'utf8');
}
