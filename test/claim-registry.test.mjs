import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaimRegistry, validateClaimEvent, isClaimActive, DEFAULT_LEASE_HOURS } from '../src/claim-registry.mjs';

const BASE = Date.parse('2026-10-01T00:00:00.000Z');
const iso = hours => new Date(BASE + hours * 3600 * 1000).toISOString();

function claimEvent(overrides = {}) {
  return {
    id: 1, at: iso(0), type: 'CLAIM', issue: 18, agent: 'ARQUÍMEDES', branch: 'agent/18-registry-core',
    files: ['src/claim-registry.mjs'], goal: 'Implementar el contrato del registro.', lease_hours: null, reason: null,
    ...overrides,
  };
}
function prReadyEvent(overrides = {}) {
  return {
    id: 2, at: iso(1), type: 'PR_READY', issue: 18, agent: 'ARQUÍMEDES', branch: 'agent/18-registry-core',
    files: [], goal: null, lease_hours: null, reason: null,
    ...overrides,
  };
}
function releaseEvent(overrides = {}) {
  return {
    id: 3, at: iso(2), type: 'RELEASE', issue: 18, agent: 'ARQUÍMEDES', branch: 'agent/18-registry-core',
    files: [], goal: null, lease_hours: null, reason: 'entrega_integrada',
    ...overrides,
  };
}

test('un CLAIM válido queda activo con la duración por defecto', () => {
  const registry = buildClaimRegistry([claimEvent()]);
  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].leaseHours, DEFAULT_LEASE_HOURS);
  assert.equal(registry.active[0].branch, 'agent/18-registry-core');
  assert.equal(registry.conflicts.length, 0);
});

test('rechaza un evento con forma incorrecta en vez de inventar un valor', () => {
  const expectCode = code => err => err.code === code;
  assert.throws(() => validateClaimEvent({ ...claimEvent(), files: [] }), expectCode('CLAIM_EVENT'));
  assert.throws(() => validateClaimEvent({ ...claimEvent(), branch: 'main ' }), expectCode('CLAIM_EVENT'));
  assert.throws(() => validateClaimEvent({ ...claimEvent(), issue: 0 }), expectCode('CLAIM_EVENT'));
  assert.throws(() => validateClaimEvent({ ...claimEvent(), lease_hours: 0 }), expectCode('CLAIM_EVENT'));
  assert.throws(() => validateClaimEvent({ ...claimEvent(), extra: 1 }), expectCode('CLAIM_EVENT'));
});

test('unicidad: dos agentes distintos no pueden reservar el mismo archivo a la vez', () => {
  const first = claimEvent({ id: 1, at: iso(0), agent: 'ARQUÍMEDES', branch: 'agent/18-a', files: ['README.md'] });
  const second = claimEvent({ id: 2, at: iso(0.5), agent: 'Odiseo', branch: 'agent/18-b', files: ['README.md', 'ESTADO.md'] });
  const registry = buildClaimRegistry([second, first]); // orden de llegada invertido a propósito
  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].agent, 'ARQUÍMEDES');
  assert.equal(registry.conflicts.length, 1);
  assert.equal(registry.conflicts[0].kind, 'FILES_RESERVED');
  assert.equal(registry.conflicts[0].event.agent, 'Odiseo');
});

test('unicidad: el mismo agente puede renovar su propia reserva sin conflicto', () => {
  const first = claimEvent({ id: 1, at: iso(0) });
  const renewal = claimEvent({ id: 4, at: iso(10), goal: 'Objetivo actualizado tras revisión.' });
  const registry = buildClaimRegistry([first, renewal]);
  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].createdId, 1, 'la fecha de creación original se conserva');
  assert.equal(registry.active[0].goal, 'Objetivo actualizado tras revisión.');
});

test('desempate de concurrencia: misma fecha, gana el id de comentario menor (orden de llegada irrelevante)', () => {
  const a = claimEvent({ id: 5, at: iso(0), agent: 'ARQUÍMEDES', branch: 'agent/18-a', files: ['docs/x.md'] });
  const b = claimEvent({ id: 2, at: iso(0), agent: 'Odiseo', branch: 'agent/18-b', files: ['docs/x.md'] });
  const order1 = buildClaimRegistry([a, b]);
  const order2 = buildClaimRegistry([b, a]);
  assert.equal(order1.active[0].agent, 'Odiseo');
  assert.equal(order2.active[0].agent, 'Odiseo');
  assert.deepEqual(order1, order2, 'el resultado no depende del orden de llegada de los eventos');
});

test('idempotencia: reenviar el mismo id con el mismo contenido es un no-op', () => {
  const event = claimEvent();
  const registry = buildClaimRegistry([event, { ...event }]);
  assert.equal(registry.active.length, 1);
});

test('idempotencia: reusar un id con otro contenido es un error, no una sobrescritura silenciosa', () => {
  const event = claimEvent();
  const mutated = claimEvent({ branch: 'agent/18-otra-rama' });
  assert.throws(() => buildClaimRegistry([event, mutated]), err => err.code === 'IDEMPOTENCY_CONFLICT');
});

test('idempotencia: una RELEASE repetida no falla ni reabre la reserva', () => {
  const registry = buildClaimRegistry([claimEvent(), releaseEvent(), releaseEvent({ id: 9, at: iso(3) })]);
  assert.equal(registry.released.length, 1);
  assert.equal(registry.active.length, 0);
});

test('expiración: sin actividad verificable tras el plazo, la reserva deja de proteger archivos', () => {
  const first = claimEvent({ id: 1, at: iso(0), lease_hours: 24 });
  const later = claimEvent({ id: 2, at: iso(30), agent: 'Odiseo', branch: 'agent/18-b' }); // 30h después, misma ruta
  const registry = buildClaimRegistry([first, later]);
  assert.equal(registry.expired.length, 1);
  assert.equal(registry.expired[0].agent, 'ARQUÍMEDES');
  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].agent, 'Odiseo', 'tras expirar, otro agente puede reservar los mismos archivos');
  assert.equal(registry.conflicts.length, 0);
});

test('expiración: un PR_READY sobre una reserva ya expirada se rechaza, no la revive', () => {
  const first = claimEvent({ id: 1, at: iso(0), lease_hours: 24 });
  const lateHeartbeat = prReadyEvent({ id: 2, at: iso(30) });
  const registry = buildClaimRegistry([first, lateHeartbeat]);
  assert.equal(registry.rejected.length, 1);
  assert.equal(registry.rejected[0].kind, 'EXPIRED_CLAIM');
  assert.equal(registry.expired.length, 1);
});

test('expiración: PR_READY antes del plazo renueva la actividad y evita la caducidad', () => {
  const first = claimEvent({ id: 1, at: iso(0), lease_hours: 24 });
  const onTime = prReadyEvent({ id: 2, at: iso(20) });
  const registry = buildClaimRegistry([first, onTime], { now: iso(30) });
  assert.equal(registry.active.length, 1, 'la actividad a las 20h aplaza la caducidad otras 24h');
  assert.equal(registry.active[0].prReady, true);
});

test('tras una RELEASE, otro agente puede reservar los mismos archivos sin conflicto', () => {
  const sequence = [claimEvent(), releaseEvent(), claimEvent({ id: 4, at: iso(5), agent: 'Odiseo', branch: 'agent/18-otra' })];
  const registry = buildClaimRegistry(sequence);
  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].agent, 'Odiseo');
  assert.equal(registry.conflicts.length, 0);
});

test('un PR_READY o RELEASE de otro agente sobre la misma rama no se cuela como propio', () => {
  const registry = buildClaimRegistry([claimEvent(), prReadyEvent({ agent: 'Odiseo' })]);
  assert.equal(registry.rejected.length, 1);
  assert.equal(registry.rejected[0].kind, 'ORPHAN_PR_READY');
  assert.equal(registry.active[0].prReady, false);
});

test('una RELEASE sin CLAIM previo se rechaza en vez de crear estado de la nada', () => {
  const registry = buildClaimRegistry([releaseEvent()]);
  assert.equal(registry.rejected.length, 1);
  assert.equal(registry.rejected[0].kind, 'ORPHAN_RELEASE');
  assert.equal(registry.active.length, 0);
  assert.equal(registry.released.length, 0);
});

test('isClaimActive distingue liberada, caducada y viva', () => {
  const registry = buildClaimRegistry([claimEvent({ lease_hours: 10 })]);
  const [claim] = registry.active;
  assert.equal(isClaimActive(claim, iso(5)), true);
  assert.equal(isClaimActive(claim, iso(11)), false);
  const released = buildClaimRegistry([claimEvent(), releaseEvent()]).released[0];
  assert.equal(isClaimActive(released, iso(0.5)), false);
});

test('límite: más de 5000 eventos se rechaza en vez de procesar sin cota', () => {
  const many = Array.from({ length: 5001 }, (_, i) => claimEvent({ id: i + 1, at: iso(i), branch: `agent/18-x${i}`, files: [`f${i}.md`] }));
  assert.throws(() => buildClaimRegistry(many), err => err.code === 'CLAIM_REGISTRY');
});
