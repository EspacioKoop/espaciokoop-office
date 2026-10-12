import { chmod, lstat, mkdir, mkdtemp, open, readdir, readFile, rename, rm, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PersistenceError, validateJournal, validateRecipe } from './persistence-types.mjs';

// Library-only adapter; API/host layers still enforce authentication and policy.
const MAX_RECORDS_PER_TYPE = 1000;

function getDataDir() {
  return resolve(process.env.OFFICE_DATA_DIR || '.office-data');
}

function validatedId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new PersistenceError('INVALID_INPUT', 'ID no válido.');
  }
  return id;
}

function documentPath(kind, id) {
  return join(getDataDir(), kind, `${validatedId(id)}.json`);
}

async function existingType(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new PersistenceError('UNSAFE_PATH', 'Enlace simbólico no permitido.');
    return stat;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function safeDirectory(path) {
  const before = await existingType(path);
  if (before && !before.isDirectory()) throw new PersistenceError('UNSAFE_PATH', 'Ruta de datos no es directorio.');
  if (!before) await mkdir(path, { recursive: true, mode: 0o700 });
  const after = await existingType(path);
  if (!after?.isDirectory()) throw new PersistenceError('UNSAFE_PATH', 'Directorio no seguro.');
}

async function safeExistingFile(path) {
  const st = await existingType(path);
  if (st && !st.isFile()) throw new PersistenceError('UNSAFE_PATH', 'Archivo no regular.');
  return st;
}

async function atomicWriteFile(filepath, text) {
  await safeDirectory(getDataDir());
  await safeDirectory(dirname(filepath));
  await safeExistingFile(filepath);
  const tmpPath = `${filepath}.${randomUUID()}.tmp`;
  let handle;
  let committed = false;
  try {
    handle = await open(tmpPath, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await safeExistingFile(filepath);
    await rename(tmpPath, filepath);
    committed = true;
  } catch {
    throw new PersistenceError('WRITE_FAILED', 'No se pudo escribir el documento.');
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (!committed) await unlink(tmpPath).catch(() => {});
  }
}

async function readAndParseJson(filepath) {
  const existing = await safeExistingFile(filepath);
  if (!existing) throw new PersistenceError('NOT_FOUND', 'Documento no encontrado.');
  let content;
  try {
    content = await readFile(filepath, 'utf8');
  } catch {
    throw new PersistenceError('READ_FAILED', 'No se pudo leer el documento.');
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new PersistenceError('CORRUPT_FILE', 'Documento JSON no válido.');
  }
}

export async function saveJournal(journal) {
  const validated = validateJournal(journal);
  await atomicWriteFile(documentPath('journals', validated.id), JSON.stringify(validated, null, 2));
  return structuredClone(validated);
}

export async function loadJournal(id) {
  const validated = validateJournal(await readAndParseJson(documentPath('journals', id)));
  if (validated.id !== id) throw new PersistenceError('CORRUPT_FILE', 'ID interno del documento incoherente.');
  return structuredClone(validated);
}

export async function saveRecipe(recipe) {
  const validated = validateRecipe(recipe);
  await atomicWriteFile(documentPath('recipes', validated.id), JSON.stringify(validated, null, 2));
  return structuredClone(validated);
}

export async function loadRecipe(id) {
  const validated = validateRecipe(await readAndParseJson(documentPath('recipes', id)));
  if (validated.id !== id) throw new PersistenceError('CORRUPT_FILE', 'ID interno del documento incoherente.');
  return structuredClone(validated);
}

async function listFiles(dirPath) {
  const status = await existingType(dirPath);
  if (!status) return [];
  if (!status.isDirectory()) throw new PersistenceError('UNSAFE_PATH', 'Colección no válida.');
  const files = (await readdir(dirPath)).filter(f => f.endsWith('.json')).sort();
  for (const name of files) await safeExistingFile(join(dirPath, name));
  return files.map(name => join(dirPath, name));
}

export async function snapshotAll() {
  const root = getDataDir();
  const journals = [];
  const recipes = [];
  for (const kind of ['journals', 'recipes']) {
    const paths = await listFiles(join(root, kind));
    if (paths.length > MAX_RECORDS_PER_TYPE) throw new PersistenceError('INVALID_SCHEMA', 'Colección demasiado grande.');
    for (const file of paths) {
      const record = kind === 'journals'
        ? validateJournal(await readAndParseJson(file))
        : validateRecipe(await readAndParseJson(file));
      if (`${record.id}.json` !== file.split('/').at(-1)) {
        throw new PersistenceError('CORRUPT_FILE', 'ID de documento no coincide con su fichero.');
      }
      (kind === 'journals' ? journals : recipes).push(record);
    }
  }
  journals.sort((a, b) => a.id.localeCompare(b.id));
  recipes.sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, journals, recipes };
}

function validateSnapshot(snapshot) {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object' ||
      Object.keys(snapshot).sort().join(',') !== 'journals,recipes,version' ||
      snapshot.version !== 1 ||
      !Array.isArray(snapshot.journals) || !Array.isArray(snapshot.recipes)) {
    throw new PersistenceError('INVALID_SCHEMA', 'Snapshot no válido.');
  }
  if (snapshot.journals.length > MAX_RECORDS_PER_TYPE || snapshot.recipes.length > MAX_RECORDS_PER_TYPE) {
    throw new PersistenceError('INVALID_SCHEMA', 'Snapshot demasiado grande.');
  }
  const journals = snapshot.journals.map(validateJournal);
  const recipes = snapshot.recipes.map(validateRecipe);
  for (const records of [journals, recipes]) {
    const names = records.map(row => row.id);
    if (new Set(names).size !== names.length) {
      throw new PersistenceError('INVALID_SCHEMA', 'Identificadores duplicados en snapshot.');
    }
  }
  return { journals, recipes };
}

export async function restoreSnapshot(snapshot, { replace = false } = {}) {
  const records = validateSnapshot(snapshot);
  const root = getDataDir();
  await safeDirectory(root);
  // Restoring over populated datasets requires explicit operator opt-in.
  for (const kind of ['journals', 'recipes']) {
    const current = await listFiles(join(root, kind));
    if (current.length && replace !== true) {
      throw new PersistenceError('ALREADY_EXISTS', 'Restaurar sobre datos existentes requiere replace=true.');
    }
  }
  const stage = await mkdtemp(join(root, '.restore-stage-'));
  await chmod(stage, 0o700);
  const backups = new Map();
  const installed = [];
  const backupNames = new Map();
  const token = randomUUID();
  let success = false;
  try {
    for (const kind of ['journals', 'recipes']) {
      const dir = join(stage, kind);
      await mkdir(dir, { mode: 0o700 });
      for (const record of records[kind]) {
        await (await open(join(dir, `${record.id}.json`), 'wx', 0o600))
          .then(async handle => {
            try { await handle.writeFile(JSON.stringify(record, null, 2), 'utf8'); await handle.sync(); }
            finally { await handle.close(); }
          });
      }
    }
    for (const kind of ['journals', 'recipes']) {
      const destination = join(root, kind);
      const current = await existingType(destination);
      if (current) {
        if (!current.isDirectory()) throw new PersistenceError('UNSAFE_PATH', 'Colección no segura.');
        const backup = join(root, `.restore-backup-${token}-${kind}`);
        await rename(destination, backup);
        backups.set(kind, backup);
      }
      await rename(join(stage, kind), destination);
      installed.push(kind);
    }
    success = true;
  } catch {
    // Roll back in reverse order; leave backed-up directories intact if rollback fails.
    for (const kind of ['recipes', 'journals']) {
      const destination = join(root, kind);
      if (installed.includes(kind)) await rm(destination, { recursive: true, force: true });
      if (backups.has(kind)) await rename(backups.get(kind), destination);
    }
    throw new PersistenceError('RESTORE_FAILED', 'Restauración interrumpida; comprueba el respaldo local.');
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  if (success) {
    for (const backup of backups.values()) await rm(backup, { recursive: true, force: true });
  }
  return { version: 1, journals: records.journals.length, recipes: records.recipes.length };
}
