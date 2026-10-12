// Tipos y contratos para el motor de recuperación determinista.

export const ERROR_CATEGORIES = Object.freeze({
  NETWORK: 'NETWORK',
  AUTH: 'AUTH',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
});

export const RECOVERABLE_CATEGORIES = Object.freeze(
  new Set([ERROR_CATEGORIES.NETWORK, ERROR_CATEGORIES.SERVER_ERROR, ERROR_CATEGORIES.TIMEOUT])
);

export function validatePresenceRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (typeof record.id !== 'string' || !record.id) return false;
  return true;
}

export function validateQueueOperation(op) {
  if (!op || typeof op !== 'object') return false;
  if (typeof op.operation_id !== 'string' || !op.operation_id) return false;
  return true;
}

export function validateJournalEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (typeof event.eventId !== 'string' || !event.eventId) return false;
  return true;
}
