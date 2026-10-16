export class PersistenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
  }
}

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function fail(code, message) {
  throw new PersistenceError(code, message);
}

function isPlainObject(obj) {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj) && Object.getPrototypeOf(obj) === Object.prototype;
}

function assertExactKeys(obj, allowedKeys, requiredKeys = allowedKeys) {
  if (!isPlainObject(obj)) {
    fail('INVALID_SCHEMA', 'El valor debe ser un objeto plano.');
  }
  const keys = Object.keys(obj);
  if (keys.length !== allowedKeys.length || !keys.every((k) => allowedKeys.includes(k))) {
    fail('INVALID_SCHEMA', 'El objeto contiene claves no permitidas o faltantes.');
  }
  for (const req of requiredKeys) {
    if (!Object.hasOwn(obj, req)) {
      fail('INVALID_SCHEMA', `Falta la clave requerida: ${req}`);
    }
  }
}

export function validateJournal(journal) {
  assertExactKeys(journal, ['id', 'title', 'entries', 'createdAt', 'updatedAt']);

  if (typeof journal.id !== 'string' || !ID_PATTERN.test(journal.id)) {
    fail('INVALID_SCHEMA', 'ID de diario no válido.');
  }
  if (typeof journal.title !== 'string' || journal.title.length === 0 || journal.title.length > 200) {
    fail('INVALID_SCHEMA', 'Título de diario no válido.');
  }
  if (!Array.isArray(journal.entries)) {
    fail('INVALID_SCHEMA', 'Las entradas del diario deben ser una lista.');
  }
  for (const entry of journal.entries) {
    assertExactKeys(entry, ['id', 'timestamp', 'author', 'content']);
    if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
      fail('INVALID_SCHEMA', 'ID de entrada no válido.');
    }
    if (typeof entry.timestamp !== 'string' || Number.isNaN(Date.parse(entry.timestamp))) {
      fail('INVALID_SCHEMA', 'Timestamp de entrada no válido.');
    }
    if (typeof entry.author !== 'string' || entry.author.length === 0 || entry.author.length > 80) {
      fail('INVALID_SCHEMA', 'Autor de entrada no válido.');
    }
    if (typeof entry.content !== 'string' || entry.content.length > 10000) {
      fail('INVALID_SCHEMA', 'Contenido de entrada no válido.');
    }
  }
  if (typeof journal.createdAt !== 'string' || Number.isNaN(Date.parse(journal.createdAt))) {
    fail('INVALID_SCHEMA', 'createdAt no válido.');
  }
  if (typeof journal.updatedAt !== 'string' || Number.isNaN(Date.parse(journal.updatedAt))) {
    fail('INVALID_SCHEMA', 'updatedAt no válido.');
  }

  return journal;
}

export function validateRecipe(recipe) {
  assertExactKeys(recipe, ['id', 'title', 'description', 'steps', 'tags', 'createdAt', 'updatedAt']);

  if (typeof recipe.id !== 'string' || !ID_PATTERN.test(recipe.id)) {
    fail('INVALID_SCHEMA', 'ID de receta no válido.');
  }
  if (typeof recipe.title !== 'string' || recipe.title.length === 0 || recipe.title.length > 200) {
    fail('INVALID_SCHEMA', 'Título de receta no válido.');
  }
  if (typeof recipe.description !== 'string' || recipe.description.length > 1000) {
    fail('INVALID_SCHEMA', 'Descripción de receta no válida.');
  }
  if (!Array.isArray(recipe.steps) || recipe.steps.some((s) => typeof s !== 'string' || s.length === 0 || s.length > 2000)) {
    fail('INVALID_SCHEMA', 'Pasos de receta no válidos.');
  }
  if (!Array.isArray(recipe.tags) || recipe.tags.some((t) => typeof t !== 'string' || t.length === 0 || t.length > 50)) {
    fail('INVALID_SCHEMA', 'Etiquetas de receta no válidas.');
  }
  if (typeof recipe.createdAt !== 'string' || Number.isNaN(Date.parse(recipe.createdAt))) {
    fail('INVALID_SCHEMA', 'createdAt no válido.');
  }
  if (typeof recipe.updatedAt !== 'string' || Number.isNaN(Date.parse(recipe.updatedAt))) {
    fail('INVALID_SCHEMA', 'updatedAt no válido.');
  }

  return recipe;
}
