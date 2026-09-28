import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/space.mjs';
import * as storage from '../src/store.mjs';
import { context, create, place, project, runChild } from './fixtures.mjs';

const initial = () => domain.createSpaceState(project);
const ready = () => domain.applySpaceCommand(initial(), create(), context()).state;
const reject = (fn, code) => assert.throws(fn, { name: 'SpaceError', code, message: code });

test('compatibilidad: conserva exportaciones, clase y métodos integrados', () => {
  assert.deepEqual(Object.keys(domain).sort(), ['CATALOGUE', 'LIMITS', 'SpaceError', 'applySpaceCommand',
    'assertSpaceContext', 'createSpaceState', 'spaceView', 'validateSpaceState'].sort());
  assert.deepEqual(Object.keys(storage), ['SpaceFileStore']);
  assert.deepEqual(Object.getOwnPropertyNames(storage.SpaceFileStore.prototype).sort(),
    ['constructor', 'prepare', 'load', 'read', 'apply', 'persist'].sort());
});
for (const key of ['type', 'label']) test(`regresión: getter de comando ${key} no se ejecuta`, () => {
  const command = create(); let calls = 0;
  Object.defineProperty(command, key, { get() { calls++; return create()[key]; } });
  reject(() => domain.applySpaceCommand(initial(), command, context()), 'INVALID_INPUT');
  assert.equal(calls, 0);
});
for (const [name, mutate] of [
  ['raíz', (s, getter) => Object.defineProperty(s, 'revision', { get: getter })],
  ['sala', (s, getter) => Object.defineProperty(s.rooms[0], 'label', { get: getter })],
]) test(`regresión: getter de estado ${name} no se ejecuta`, () => {
  const state = ready(); let calls = 0;
  mutate(state, () => { calls++; return 'unexpected'; });
  reject(() => domain.validateSpaceState(state), 'CORRUPT_STATE'); assert.equal(calls, 0);
});
for (const key of ['type', 'kind']) test(`regresión: ${key} no acepta coerción a cadena`, () => {
  const command = key === 'type' ? create() : place(); let calls = 0;
  command[key] = { toString() { calls++; return key === 'type' ? 'room.create' : 'desk'; } };
  reject(() => domain.applySpaceCommand(key === 'type' ? initial() : ready(), command, context()), 'INVALID_INPUT');
  assert.equal(calls, 0);
});
for (const key of ['kind', 'type']) test(`regresión: ${key} persistido exige cadena`, () => {
  const state = domain.applySpaceCommand(ready(), place(), context()).state;
  if (key === 'kind') state.rooms[0].items[0].kind = ['desk'];
  else state.events[0].type = ['room.create'];
  reject(() => domain.validateSpaceState(state), 'CORRUPT_STATE');
});
test('regresión: error de guardia se sanea sin revelar su mensaje', () => {
  const ctx = context({ assertAuthorized() { throw new Error('synthetic-private-detail'); } });
  reject(() => domain.applySpaceCommand(initial(), create(), ctx), 'ACCESS_REVOKED');
  reject(() => domain.spaceView(initial(), ctx), 'ACCESS_REVOKED');
});
test('regresión: guardia rechazada no deja un rechazo de Promise sin gestionar', async () => {
  assert.deepEqual(await runChild(`
    let unhandled = 0, code;
    process.on('unhandledRejection', () => unhandled++);
    try { applySpaceCommand(createSpaceState(project), create(), context({
      assertAuthorized: async () => { throw new Error('synthetic-private-detail'); }
    })); } catch (error) { code = error.code; }
    await new Promise(resolve => setImmediate(resolve));
    console.log(JSON.stringify({ code, unhandled }));
  `), { code: 'ACCESS_REVOKED', unhandled: 0 });
});

for (const [name, mutate] of [
  ['símbolo', (c) => { c[Symbol('extra')] = true; }],
  ['prototipo nulo', (c) => Object.setPrototypeOf(c, null)],
  ['ID ausente', (c) => { c.room_id = null; }],
  ['clave larga', (c) => { c.idempotency_key = 'a'.repeat(65); }],
  ['dimensión fraccionaria', (c) => { c.height = 4.5; }],
  ['etiqueta bidi', (c) => { c.label = 'a\u202Eb'; }],
]) test(`cobertura: comando inválido ${name}`, () => {
  const command = create(); mutate(command);
  reject(() => domain.applySpaceCommand(initial(), command, context()), 'INVALID_INPUT');
});
for (const [name, mutate] of [
  ['esquema', (s) => s.schema_version++], ['recibo ausente', (s) => s.receipts.pop()],
  ['sala duplicada', (s) => s.rooms.push(s.rooms[0])], ['etiqueta vacía', (s) => { s.rooms[0].label = ''; }],
  ['revisión de sala', (s) => { s.rooms[0].revision = 100; }], ['evento', (s) => { s.events[0].type = 'exec'; }],
  ['propietario de recibo', (s) => { s.receipts[0].owner_id = null; }], ['digest', (s) => { s.receipts[0].hash = 'bad'; }],
]) test(`cobertura: snapshot inválido ${name}`, () => {
  const state = ready(); mutate(state); reject(() => domain.validateSpaceState(state), 'CORRUPT_STATE');
});
test('cobertura: reloj inválido y lectura sin permiso de edición', () => {
  reject(() => domain.applySpaceCommand(initial(), create(), context({ now: NaN })), 'INVALID_CONTEXT');
  assert.equal(domain.spaceView(ready(), context({ capabilities: ['space.read'] })).revision, 1);
  reject(() => domain.applySpaceCommand(initial(), create(), context({ capabilities: ['space.read'] })), 'FORBIDDEN');
});
test('cobertura: capacidad restante se expone en la proyección', () => {
  assert.equal(domain.spaceView(initial(), context()).capacity.commands_remaining, domain.LIMITS.receipts);
  assert.equal(domain.spaceView(ready(), context()).capacity.commands_remaining, domain.LIMITS.receipts - 1);
});
test('cobertura: recibo original y estado reciente desligados tras reintento', () => {
  const first = domain.applySpaceCommand(initial(), create(), context());
  const state = domain.applySpaceCommand(first.state, place(), context()).state;
  const retry = domain.applySpaceCommand(state, create(), context());
  assert.equal(retry.duplicate, true); assert.deepEqual(retry.receipt, first.receipt);
  assert.deepEqual(retry.state, state); assert.notEqual(retry.state, state);
  retry.receipt.revision = 100; retry.state.rooms[0].label = 'Changed';
  assert.equal(state.receipts[0].result.revision, 1);
  assert.equal(state.rooms[0].label, create().label);
});
test('cobertura: huella girada bloquea su segunda celda', () => {
  const state = domain.applySpaceCommand(ready(), place({ x: 11, y: 3, rotation: 90 }), context()).state;
  reject(() => domain.applySpaceCommand(state, place({ item_id: 'plant', kind: 'plant', x: 11, y: 4,
    idempotency_key: 'collision', expected_revision: 2 }), context()), 'POSITION_BLOCKED');
});
test('cobertura: salir conserva revisión del avatar y rechaza suplantación', () => {
  const move = { type: 'avatar.move', room_id: 'lobby', x: 0, y: 0, expected_revision: 0, idempotency_key: 'move' };
  let state = domain.applySpaceCommand(ready(), move, context()).state;
  state = domain.applySpaceCommand(state, { type: 'avatar.leave', expected_revision: 1, idempotency_key: 'leave' }, context()).state;
  assert.equal(state.avatars[0].revision, 2);
  reject(() => domain.applySpaceCommand(state, { ...move, idempotency_key: 'stale' }, context()), 'REVISION_CONFLICT');
  reject(() => domain.applySpaceCommand(state, { ...move, actor_id: 'human-b' }, context()), 'INVALID_INPUT');
});
