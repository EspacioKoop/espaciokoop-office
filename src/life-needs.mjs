/**
 * Motor determinista de necesidades para avatares (EspacioKoop Office #53).
 *
 * Módulo puro, lúdico y desacoplado para gestionar las necesidades
 * (energia, hambre, descanso, moral) mediante ticks discretos, saturación 0..100,
 * acciones con recursos sintéticos y restauración reproducible desde snapshot versionado.
 *
 * Sin dependencias del reloj real (Date.now), sin persistencia real y sin UI.
 * Este estado lúdico NUNCA concede permisos, presupuesto o acceso a agentes reales.
 */

export const NEEDS_SNAPSHOT_VERSION = 1;
export const NEED_KEYS = Object.freeze(['energia', 'hambre', 'descanso', 'moral']);
export const DEFAULT_TICK_RATES = Object.freeze({
  energia: -1,
  hambre: 1,
  descanso: -1,
  moral: -0.5,
});

const idPattern = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;

export class LifeNeedsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LifeNeedsError';
    this.code = code;
  }
}

function insist(condition, code, message) {
  if (!condition) {
    throw new LifeNeedsError(code, message);
  }
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function validateNumber(val, code, message) {
  insist(typeof val === 'number' && Number.isFinite(val), code, message);
}

function validateExactObject(obj, allowedKeys, code, message) {
  insist(obj && typeof obj === 'object' && !Array.isArray(obj), code, message);
  const keys = Object.keys(obj);
  insist(keys.length === allowedKeys.length && keys.every(k => allowedKeys.includes(k)), code, message);
}

export function validateAvatarId(avatarId) {
  insist(typeof avatarId === 'string' && idPattern.test(avatarId), 'INVALID_AVATAR_ID', 'Identificador de avatar no válido.');
  return avatarId;
}

export function createAvatarNeeds(avatarId, initialValues = {}) {
  validateAvatarId(avatarId);
  insist(initialValues && typeof initialValues === 'object' && !Array.isArray(initialValues), 'INVALID_INPUT', 'Valores iniciales no válidos.');

  const defaults = { energia: 100, hambre: 0, descanso: 100, moral: 100 };
  const needs = {};

  for (const key of NEED_KEYS) {
    const rawVal = initialValues[key] !== undefined ? initialValues[key] : defaults[key];
    validateNumber(rawVal, 'INVALID_NEED_VALUE', `Valor no válido para la necesidad '${key}'.`);
    needs[key] = clamp(rawVal);
  }

  return {
    version: NEEDS_SNAPSHOT_VERSION,
    avatar_id: avatarId,
    needs,
    paused: false,
    tick_count: 0,
  };
}

export function tickNeeds(state, deltaTicks = 1, customRates = {}) {
  insist(state && typeof state === 'object', 'INVALID_STATE', 'Estado no válido.');
  insist(state.version === NEEDS_SNAPSHOT_VERSION, 'VERSION_MISMATCH', 'Versión de estado no compatible.');
  insist(Number.isSafeInteger(deltaTicks) && deltaTicks >= 0 && deltaTicks <= 100000, 'INVALID_DELTA_TICKS', 'Delta de ticks no válido.');
  insist(customRates && typeof customRates === 'object' && !Array.isArray(customRates), 'INVALID_RATES', 'Tasas de tick no válidas.');

  if (state.paused || deltaTicks === 0) {
    return structuredClone(state);
  }

  const rates = { ...DEFAULT_TICK_RATES, ...customRates };
  for (const key of NEED_KEYS) {
    validateNumber(rates[key], 'INVALID_RATES', `Tasa no válida para '${key}'.`);
  }

  const updatedNeeds = {};
  for (const key of NEED_KEYS) {
    const current = state.needs[key];
    const change = rates[key] * deltaTicks;
    updatedNeeds[key] = clamp(current + change);
  }

  return {
    version: NEEDS_SNAPSHOT_VERSION,
    avatar_id: state.avatar_id,
    needs: updatedNeeds,
    paused: state.paused,
    tick_count: state.tick_count + deltaTicks,
  };
}

export function applyNeedsAction(state, action) {
  insist(state && typeof state === 'object', 'INVALID_STATE', 'Estado no válido.');
  insist(state.version === NEEDS_SNAPSHOT_VERSION, 'VERSION_MISMATCH', 'Versión de estado no compatible.');
  insist(action && typeof action === 'object' && !Array.isArray(action), 'INVALID_ACTION', 'Acción no válida.');

  const { type, resource } = action;
  insist(['descansar', 'alimentarse'].includes(type), 'UNSUPPORTED_ACTION', 'Tipo de acción no soportado.');

  // Validar recurso sintético y ausencia estricta de permisos/credenciales/reales
  insist(resource && typeof resource === 'object' && !Array.isArray(resource), 'INVALID_RESOURCE', 'Recurso sintético no válido.');
  insist(resource.synthetic === true, 'NON_SYNTHETIC_RESOURCE', 'El recurso debe ser sintético.');

  // Seguridad: El estado lúdico NUNCA concede ni acepta permisos, presupuestos ni tokens reales
  const forbiddenKeys = ['permissions', 'budget', 'credentials', 'token', 'access', 'realAgentId', 'api_key', 'wallet'];
  for (const key of forbiddenKeys) {
    insist(!(key in resource), 'SECURITY_VIOLATION', 'El recurso sintético no debe incluir datos de acceso ni presupuestos reales.');
  }

  const amount = resource.amount !== undefined ? resource.amount : 25;
  validateNumber(amount, 'INVALID_RESOURCE_AMOUNT', 'Cantidad de recurso sintético no válida.');
  insist(amount > 0 && amount <= 100, 'RESOURCE_AMOUNT_OUT_OF_BOUNDS', 'Cantidad de recurso fuera de límites (1..100).');

  const updatedNeeds = { ...state.needs };

  if (type === 'alimentarse') {
    updatedNeeds.hambre = clamp(updatedNeeds.hambre - amount);
    updatedNeeds.energia = clamp(updatedNeeds.energia + amount * 0.5);
    updatedNeeds.moral = clamp(updatedNeeds.moral + amount * 0.2);
  } else if (type === 'descansar') {
    updatedNeeds.descanso = clamp(updatedNeeds.descanso + amount);
    updatedNeeds.energia = clamp(updatedNeeds.energia + amount * 0.6);
    updatedNeeds.hambre = clamp(updatedNeeds.hambre + amount * 0.1);
  }

  return {
    version: NEEDS_SNAPSHOT_VERSION,
    avatar_id: state.avatar_id,
    needs: updatedNeeds,
    paused: state.paused,
    tick_count: state.tick_count,
  };
}

export function setNeedsPaused(state, paused) {
  insist(state && typeof state === 'object', 'INVALID_STATE', 'Estado no válido.');
  insist(typeof paused === 'boolean', 'INVALID_PAUSE_VALUE', 'Valor de pausa no válido.');
  return {
    ...structuredClone(state),
    paused,
  };
}

export function exportNeedsSnapshot(state) {
  insist(state && typeof state === 'object', 'INVALID_STATE', 'Estado no válido.');
  insist(state.version === NEEDS_SNAPSHOT_VERSION, 'VERSION_MISMATCH', 'Versión de estado no compatible.');
  validateAvatarId(state.avatar_id);
  insist(typeof state.paused === 'boolean', 'INVALID_STATE', 'Estado de pausa no válido.');
  insist(Number.isSafeInteger(state.tick_count) && state.tick_count >= 0, 'INVALID_STATE', 'Conteo de ticks no válido.');
  validateExactObject(state.needs, NEED_KEYS, 'INVALID_STATE', 'Estructura de necesidades no válida.');

  for (const key of NEED_KEYS) {
    validateNumber(state.needs[key], 'INVALID_STATE', `Valor no válido para '${key}'.`);
  }

  return structuredClone(state);
}

export function restoreNeedsSnapshot(snapshot) {
  insist(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'INVALID_SNAPSHOT', 'Snapshot no válido.');
  validateExactObject(snapshot, ['version', 'avatar_id', 'needs', 'paused', 'tick_count'], 'INVALID_SNAPSHOT', 'Estructura de snapshot no válida.');
  insist(snapshot.version === NEEDS_SNAPSHOT_VERSION, 'VERSION_MISMATCH', 'Versión de snapshot no compatible.');
  validateAvatarId(snapshot.avatar_id);
  insist(typeof snapshot.paused === 'boolean', 'INVALID_SNAPSHOT', 'Estado de pausa no válido en snapshot.');
  insist(Number.isSafeInteger(snapshot.tick_count) && snapshot.tick_count >= 0, 'INVALID_SNAPSHOT', 'Conteo de ticks no válido en snapshot.');
  validateExactObject(snapshot.needs, NEED_KEYS, 'INVALID_SNAPSHOT', 'Necesidades no válidas en snapshot.');

  const needs = {};
  for (const key of NEED_KEYS) {
    validateNumber(snapshot.needs[key], 'INVALID_SNAPSHOT', `Valor de necesidad no válido para '${key}'.`);
    needs[key] = clamp(snapshot.needs[key]);
  }

  return {
    version: NEEDS_SNAPSHOT_VERSION,
    avatar_id: snapshot.avatar_id,
    needs,
    paused: snapshot.paused,
    tick_count: snapshot.tick_count,
  };
}

export function createLifeNeedsEngine(avatarIdOrState, initialValues = {}) {
  let state;
  if (typeof avatarIdOrState === 'string') {
    state = createAvatarNeeds(avatarIdOrState, initialValues);
  } else if (avatarIdOrState && typeof avatarIdOrState === 'object') {
    state = restoreNeedsSnapshot(avatarIdOrState);
  } else {
    throw new LifeNeedsError('INVALID_INPUT', 'Se requiere id de avatar o un estado válido.');
  }

  return {
    getAvatarId: () => state.avatar_id,
    getState: () => exportNeedsSnapshot(state),
    tick: (deltaTicks = 1, customRates = {}) => {
      state = tickNeeds(state, deltaTicks, customRates);
      return exportNeedsSnapshot(state);
    },
    applyAction: (action) => {
      state = applyNeedsAction(state, action);
      return exportNeedsSnapshot(state);
    },
    pause: () => {
      state = setNeedsPaused(state, true);
      return exportNeedsSnapshot(state);
    },
    resume: () => {
      state = setNeedsPaused(state, false);
      return exportNeedsSnapshot(state);
    },
    isPaused: () => state.paused,
    exportSnapshot: () => exportNeedsSnapshot(state),
    restoreSnapshot: (snapshot) => {
      state = restoreNeedsSnapshot(snapshot);
      return exportNeedsSnapshot(state);
    },
  };
}
