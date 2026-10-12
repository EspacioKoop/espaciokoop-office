import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEEDS_SNAPSHOT_VERSION,
  NEED_KEYS,
  DEFAULT_TICK_RATES,
  LifeNeedsError,
  createAvatarNeeds,
  tickNeeds,
  applyNeedsAction,
  setNeedsPaused,
  exportNeedsSnapshot,
  restoreNeedsSnapshot,
  createLifeNeedsEngine,
} from '../src/life-needs.mjs';

test('necesidades de avatar: creación nominal con valores por defecto', () => {
  const state = createAvatarNeeds('avatar-alpha');
  assert.equal(state.version, NEEDS_SNAPSHOT_VERSION);
  assert.equal(state.avatar_id, 'avatar-alpha');
  assert.equal(state.paused, false);
  assert.equal(state.tick_count, 0);
  assert.deepEqual(state.needs, {
    energia: 100,
    hambre: 0,
    descanso: 100,
    moral: 100,
  });
});

test('necesidades de avatar: creación con valores iniciales y saturación 0..100', () => {
  const state = createAvatarNeeds('avatar-beta', {
    energia: 150, // Debe saturar en 100
    hambre: -20, // Debe saturar en 0
    descanso: 50,
    moral: 75,
  });
  assert.deepEqual(state.needs, {
    energia: 100,
    hambre: 0,
    descanso: 50,
    moral: 75,
  });
});

test('necesidades de avatar: validación de ID de avatar negativo/inválido', () => {
  assert.throws(() => createAvatarNeeds(''), LifeNeedsError);
  assert.throws(() => createAvatarNeeds('../invalid'), LifeNeedsError);
  assert.throws(() => createAvatarNeeds('avatar con espacios'), LifeNeedsError);
  assert.throws(() => createAvatarNeeds(12345), LifeNeedsError);
});

test('necesidades de avatar: ticks discretos y degradación determinista', () => {
  const initial = createAvatarNeeds('avatar-1');
  const after1 = tickNeeds(initial, 1);

  assert.equal(after1.tick_count, 1);
  assert.equal(after1.needs.energia, 99);
  assert.equal(after1.needs.hambre, 1);
  assert.equal(after1.needs.descanso, 99);
  assert.equal(after1.needs.moral, 99.5);

  const after10 = tickNeeds(initial, 10);
  assert.equal(after10.tick_count, 10);
  assert.equal(after10.needs.energia, 90);
  assert.equal(after10.needs.hambre, 10);
  assert.equal(after10.needs.descanso, 90);
  assert.equal(after10.needs.moral, 95);
});

test('necesidades de avatar: asociatividad y determinismo de ticks', () => {
  const initial = createAvatarNeeds('avatar-1');

  // tick(1) aplicado 5 veces consecutivas
  let stepByStep = initial;
  for (let i = 0; i < 5; i++) {
    stepByStep = tickNeeds(stepByStep, 1);
  }

  // tick(5) directamente
  const direct5 = tickNeeds(initial, 5);

  assert.deepEqual(stepByStep, direct5);
});

test('necesidades de avatar: saturación en límites de 0 y 100 con ticks masivos', () => {
  const initial = createAvatarNeeds('avatar-1');
  const exhausted = tickNeeds(initial, 200); // 200 ticks

  assert.equal(exhausted.needs.energia, 0);
  assert.equal(exhausted.needs.hambre, 100);
  assert.equal(exhausted.needs.descanso, 0);
  assert.equal(exhausted.needs.moral, 0);
});

test('necesidades de avatar: pausa detiene la evolución de ticks', () => {
  const initial = createAvatarNeeds('avatar-1');
  const paused = setNeedsPaused(initial, true);

  const ticked = tickNeeds(paused, 10);
  assert.equal(ticked.tick_count, 0); // No avanzó
  assert.deepEqual(ticked.needs, initial.needs);
});

test('necesidades de avatar: acción alimentarse con recurso sintético', () => {
  const hungryState = createAvatarNeeds('avatar-1', {
    energia: 50,
    hambre: 60,
    moral: 50,
  });

  const action = {
    type: 'alimentarse',
    resource: { synthetic: true, item: 'synthetic_apple', amount: 30 },
  };

  const updated = applyNeedsAction(hungryState, action);

  assert.equal(updated.needs.hambre, 30); // 60 - 30
  assert.equal(updated.needs.energia, 65); // 50 + (30 * 0.5)
  assert.equal(updated.needs.moral, 56); // 50 + (30 * 0.2)
});

test('necesidades de avatar: acción descansar con recurso sintético', () => {
  const tiredState = createAvatarNeeds('avatar-1', {
    energia: 40,
    descanso: 30,
    hambre: 20,
  });

  const action = {
    type: 'descansar',
    resource: { synthetic: true, duration: 'short', amount: 40 },
  };

  const updated = applyNeedsAction(tiredState, action);

  assert.equal(updated.needs.descanso, 70); // 30 + 40
  assert.equal(updated.needs.energia, 64); // 40 + (40 * 0.6)
  assert.equal(updated.needs.hambre, 24); // 20 + (40 * 0.1)
});

test('necesidades de avatar: seguridad - rechazo de recursos no sintéticos o con permisos/presupuestos reales', () => {
  const state = createAvatarNeeds('avatar-1');

  // Sin synthetic: true
  assert.throws(() => {
    applyNeedsAction(state, {
      type: 'alimentarse',
      resource: { item: 'real_food', amount: 20 },
    });
  }, (err) => err instanceof LifeNeedsError && err.code === 'NON_SYNTHETIC_RESOURCE');

  // Con intento de inyección de permisos/presupuestos/tokens reales
  assert.throws(() => {
    applyNeedsAction(state, {
      type: 'alimentarse',
      resource: { synthetic: true, permissions: ['admin'], amount: 10 },
    });
  }, (err) => err instanceof LifeNeedsError && err.code === 'SECURITY_VIOLATION');

  assert.throws(() => {
    applyNeedsAction(state, {
      type: 'descansar',
      resource: { synthetic: true, budget: 1000, amount: 10 },
    });
  }, (err) => err instanceof LifeNeedsError && err.code === 'SECURITY_VIOLATION');
});

test('necesidades de avatar: exportación e importación reproducible (snapshot) y rollback', () => {
  const engine = createLifeNeedsEngine('avatar-1');
  engine.tick(5);
  engine.applyAction({
    type: 'descansar',
    resource: { synthetic: true, amount: 20 },
  });

  const snapshot1 = engine.exportSnapshot();

  // Avanzar más ticks
  engine.tick(10);
  const snapshot2 = engine.exportSnapshot();
  assert.notDeepEqual(snapshot1, snapshot2);

  // Rollback a snapshot1
  const restored = engine.restoreSnapshot(snapshot1);
  assert.deepEqual(restored, snapshot1);
  assert.deepEqual(engine.getState(), snapshot1);
});

test('necesidades de avatar: validación estricta de snapshot corrupto o versión mismatch', () => {
  const validSnapshot = createAvatarNeeds('avatar-1');

  assert.throws(() => {
    restoreNeedsSnapshot({ ...validSnapshot, version: 999 });
  }, (err) => err instanceof LifeNeedsError && err.code === 'VERSION_MISMATCH');

  assert.throws(() => {
    restoreNeedsSnapshot({ ...validSnapshot, avatar_id: 'bad id!!' });
  }, (err) => err instanceof LifeNeedsError && err.code === 'INVALID_AVATAR_ID');

  assert.throws(() => {
    restoreNeedsSnapshot({ ...validSnapshot, needs: { energia: 'invalid' } });
  }, (err) => err instanceof LifeNeedsError && err.code === 'INVALID_SNAPSHOT');

  assert.throws(() => {
    restoreNeedsSnapshot({ ...validSnapshot, extraField: 'not allowed' });
  }, (err) => err instanceof LifeNeedsError && err.code === 'INVALID_SNAPSHOT');
});

test('necesidades de avatar: motor lúdico encadenado y pausa/resume', () => {
  const engine = createLifeNeedsEngine('avatar-x', { energia: 80 });
  assert.equal(engine.getAvatarId(), 'avatar-x');
  assert.equal(engine.isPaused(), false);

  engine.pause();
  assert.equal(engine.isPaused(), true);
  engine.tick(5);
  assert.equal(engine.getState().needs.energia, 80);

  engine.resume();
  assert.equal(engine.isPaused(), false);
  engine.tick(5);
  assert.equal(engine.getState().needs.energia, 75);
});

test('security: estado manipulado no puede entrar en ticks, acciones ni pausa', () => {
  const valid = createAvatarNeeds('avatar-1');
  const malformed = { ...valid, tick_count: -1 };
  assert.throws(() => tickNeeds(malformed, 1), err => err instanceof LifeNeedsError);
  assert.throws(() => applyNeedsAction(malformed, {
    type: 'alimentarse', resource: { synthetic: true, amount: 10 },
  }), err => err instanceof LifeNeedsError);
  assert.throws(() => setNeedsPaused(malformed, true), err => err instanceof LifeNeedsError);
});

test('security: no se permite desbordar tick_count ni inyectar campos extra', () => {
  const valid = createAvatarNeeds('avatar-1');
  assert.throws(() => createAvatarNeeds('avatar-2', { permissions: ['admin'] }),
    err => err instanceof LifeNeedsError && err.code === 'INVALID_INPUT');
  const almostFull = { ...valid, tick_count: Number.MAX_SAFE_INTEGER };
  assert.throws(() => tickNeeds(almostFull, 1),
    err => err instanceof LifeNeedsError && err.code === 'INVALID_DELTA_TICKS');
  assert.equal(tickNeeds(almostFull, 0).tick_count, Number.MAX_SAFE_INTEGER);
});
