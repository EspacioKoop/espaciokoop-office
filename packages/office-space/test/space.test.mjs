import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceState, applySpaceCommand, validateSpaceState, spaceView, LIMITS } from '../src/space.mjs';

const ALL = ['space.read', 'space.edit', 'space.edit_common', 'space.move'];
export const context = (actor = 'human-a', changes = {}) => ({ actor_id: actor, owner_id: actor,
  kind: 'human', project_id: 'fixture/office', capabilities: [...ALL], now: 1700000000000,
  assertAuthorized: () => true, ...changes });
export const roomCommand = (changes = {}) => ({ type: 'room.create', idempotency_key: 'room-1', expected_revision: 0,
  room_id: 'lobby', label: 'Sala común de prueba', scope: 'common', width: 12, height: 10, ...changes });
const move = (changes = {}) => ({ type: 'avatar.move', idempotency_key: 'move-1', expected_revision: 0,
  room_id: 'lobby', x: 1, y: 1, ...changes });
const put = (changes = {}) => ({ type: 'furniture.place', idempotency_key: 'put-1', expected_revision: 1,
  room_id: 'lobby', item_id: 'desk-1', kind: 'desk', x: 3, y: 3, rotation: 0, ...changes });
const run = (state, command, ctx = context()) => applySpaceCommand(state, command, ctx);
const initial = () => createSpaceState('fixture/office');
const populated = (changes = {}) => run(initial(), roomCommand(changes)).state;
const throws = (fn, code) => assert.throws(fn, (error) => error.code === code);

// Fixture objects above are synthetic identities; no owner profile, token or runtime is imported.
test('dos propietarios editan la sala común y visitan la misma proyección', () => {
  let s = populated(); s = run(s, put(), context('human-b')).state;
  s = run(s, move(), context('human-b')).state;
  s = run(s, move({ x: 0, y: 0 })).state;
  assert.deepEqual(spaceView(s, context()), spaceView(s, context('human-b')));
  assert.equal(s.avatars.length, 2); assert.equal(s.rooms[0].items.length, 1);
});
test('sala propia se puede visitar, pero solo su propietario la edita', () => {
  let s = populated({ scope: 'personal' });
  throws(() => run(s, put(), context('human-b')), 'FORBIDDEN');
  s = run(s, move(), context('human-b')).state;
  assert.equal(s.avatars[0].room_id, 'lobby');
  assert.equal(run(s, put()).state.rooms[0].owner_id, 'human-a');
});
test('sala común exige permiso común; sala propia no lo exige', () => {
  const c = context('human-a', { capabilities: ['space.read', 'space.edit'] });
  throws(() => run(initial(), roomCommand(), c), 'FORBIDDEN');
  assert.equal(run(initial(), roomCommand({ scope: 'personal' }), c).state.rooms.length, 1);
});
test('conflicto de versiones no pierde cambios del otro propietario', () => {
  const original = populated(), first = run(original, put()).state;
  throws(() => run(first, put({ idempotency_key: 'put-b', item_id: 'desk-b', x: 8 }), context('human-b')), 'REVISION_CONFLICT');
  const updated = run(first, put({ idempotency_key: 'put-b', item_id: 'desk-b', x: 8, expected_revision: 2 }), context('human-b'));
  assert.equal(updated.state.rooms[0].items.length, 2); assert.equal(original.rooms[0].items.length, 0);
});
test('versiones por sala permiten cambios en salas distintas sin falso conflicto', () => {
  let s = populated(); s = run(s, roomCommand({ room_id: 'other', idempotency_key: 'r2' })).state;
  s = run(s, put()).state;
  s = run(s, put({ room_id: 'other', idempotency_key: 'p2' }), context('human-b')).state;
  assert.deepEqual(s.rooms.map((r) => r.revision), [2, 2]);
});
test('versiones de avatar son independientes de muebles y del otro avatar', () => {
  let s = populated(); s = run(s, move()).state; s = run(s, put()).state;
  s = run(s, move(), context('human-b')).state;
  throws(() => run(s, move({ idempotency_key: 'old' })), 'REVISION_CONFLICT');
  s = run(s, move({ idempotency_key: 'new', expected_revision: 1, x: 2 })).state;
  assert.equal(s.avatars[0].revision, 2); assert.equal(s.avatars[1].revision, 1);
});
test('reintento idéntico, incluso con orden de claves distinto, es idempotente', () => {
  const c = roomCommand(), s = run(initial(), c).state;
  const reordered = Object.fromEntries(Object.entries(c).reverse());
  const result = run(s, reordered); assert.equal(result.duplicate, true); assert.deepEqual(result.state, s);
});
test('misma clave con contenido diferente se rechaza', () => {
  throws(() => run(populated(), roomCommand({ label: 'Distinta' })), 'IDEMPOTENCY_CONFLICT');
});
test('claves de actores distintos no colisionan ni suplantan identidad', () => {
  let s = populated(); s = run(s, move()).state; s = run(s, move(), context('human-b')).state;
  assert.equal(s.receipts.length, 3);
});
test('revocación se revalida también en un reintento', () => {
  throws(() => run(populated(), roomCommand(), context('human-a', { assertAuthorized: () => false })), 'ACCESS_REVOKED');
});
test('recibo no se puede reutilizar tras cambiar propietario del actor', () => {
  const s = populated({ scope: 'personal' });
  throws(() => run(s, roomCommand({ scope: 'personal' }), context('human-a', { owner_id: 'different' })), 'FORBIDDEN');
});
test('borrar sala vacía es idempotente y no permite resucitar su identidad', () => {
  const c = { type: 'room.delete', idempotency_key: 'delete', expected_revision: 1, room_id: 'lobby' };
  const s = run(populated(), c).state;
  assert.equal(run(s, c).duplicate, true);
  throws(() => run(s, roomCommand({ idempotency_key: 'recreate' })), 'RESOURCE_EXISTS');
  throws(() => run(s, c, context('human-a', { capabilities: ['space.read', 'space.edit'] })), 'FORBIDDEN');
});
test('sala con muebles no se borra silenciosamente', () => {
  const s = run(populated(), put()).state;
  throws(() => run(s, { type: 'room.delete', idempotency_key: 'd', expected_revision: 2, room_id: 'lobby' }), 'ROOM_NOT_EMPTY');
});
test('sala con avatar exige que este salga antes de borrarla', () => {
  let s = run(populated(), move()).state;
  const c = { type: 'room.delete', idempotency_key: 'd', expected_revision: 1, room_id: 'lobby' };
  throws(() => run(s, c), 'ROOM_NOT_EMPTY');
  s = run(s, { type: 'avatar.leave', idempotency_key: 'leave', expected_revision: 1 }).state;
  assert.equal(s.avatars[0].room_id, null); assert.equal(run(s, c).state.rooms.length, 0);
});
test('mover y retirar mobiliario mantiene revisión e identidad', () => {
  let s = run(populated(), put()).state;
  s = run(s, { type: 'furniture.move', idempotency_key: 'fm', expected_revision: 2,
    room_id: 'lobby', item_id: 'desk-1', x: 7, y: 3, rotation: 90 }).state;
  assert.equal(s.rooms[0].items[0].kind, 'desk');
  s = run(s, { type: 'furniture.remove', idempotency_key: 'fr', expected_revision: 3, room_id: 'lobby', item_id: 'desk-1' }).state;
  assert.equal(s.rooms[0].items.length, 0);
});
test('no reduce una sala recortando muebles ni avatares', () => {
  let s = run(populated(), move({ x: 10, y: 9 })).state;
  const c = { type: 'room.update', idempotency_key: 'resize', expected_revision: 1,
    room_id: 'lobby', label: 'Reducida', width: 4, height: 4 };
  throws(() => run(s, c), 'ROOM_NOT_EMPTY');
  s = run(populated(), put({ x: 10, y: 8 })).state;
  throws(() => run(s, { ...c, expected_revision: 2 }), 'ROOM_NOT_EMPTY');
  assert.equal(run(populated(), c).state.rooms[0].width, 4);
});
for (const change of [{ x: 0, y: 0 }, { x: 11 }, { x: 11, rotation: 90, y: 9 }])
  test(`mueble respeta entrada y límites ${JSON.stringify(change)}`, () => throws(() => run(populated(), put(change)), 'POSITION_BLOCKED'));
test('muebles no se solapan', () => {
  const s = run(populated(), put()).state;
  throws(() => run(s, put({ item_id: 'second', idempotency_key: 'second', expected_revision: 2 })), 'POSITION_BLOCKED');
});
test('mueble no se coloca encima de un avatar, ni avatar encima de mueble', () => {
  throws(() => run(run(populated(), move({ x: 3, y: 3 })).state, put()), 'POSITION_BLOCKED');
  throws(() => run(run(populated(), put()).state, move({ x: 3, y: 3 })), 'POSITION_BLOCKED');
});
for (const change of [
  { actor_id: 'spoof' }, { project_id: 'other' }, { owner_id: 'spoof' }, { prompt: 'secret' },
  { width: NaN }, { height: Infinity }, { width: 3 }, { width: 65 }, { label: '<script>' }, { label: 'x\nsecret' },
  { label: '' }, { label: ' x' }, { label: 'x'.repeat(81) }, { room_id: '__proto__' }, { room_id: '../private' },
  { expected_revision: -1 }, { expected_revision: 0.5 }, { idempotency_key: '' }, { type: 'shell.exec' }, { scope: 'public' },
]) test(`entrada estricta ${JSON.stringify(change)}`, () => throws(() => run(initial(), roomCommand(change)), 'INVALID_INPUT'));
for (const change of [ { x: -1 }, { x: 1.5 }, { y: 64 }, { rotation: 45 }, { kind: 'constructor' }, { kind: '__proto__' } ])
  test(`catálogo y coordenadas estrictos ${JSON.stringify(change)}`, () => throws(() => run(populated(), put(change)), 'INVALID_INPUT'));
for (const change of [ { kind: 'agent' }, { kind: 'admin' }, { project_id: 'fixture/other' }, { capabilities: [] }, { actor_id: undefined } ])
  test(`contexto denegado ${JSON.stringify(change)}`, () => {
    throws(() => run(initial(), roomCommand(), context('human-a', change)), 'FORBIDDEN');
    throws(() => spaceView(initial(), context('human-a', change)), 'FORBIDDEN');
  });
test('guardia obligatoria, síncrona y señal de revocación', () => {
  throws(() => run(initial(), roomCommand(), context('human-a', { assertAuthorized: undefined })), 'INVALID_CONTEXT');
  throws(() => run(initial(), roomCommand(), context('human-a', { assertAuthorized: async () => true })), 'ACCESS_REVOKED');
  throws(() => run(initial(), roomCommand(), context('human-a', { signal: AbortSignal.abort() })), 'ACCESS_REVOKED');
});
test('la proyección no filtra recibos ni permite mutar el estado interno', () => {
  const s = populated(), view = spaceView(s, context());
  assert.equal(view.receipts, undefined); assert.equal(view.retired_rooms, undefined);
  assert.equal(JSON.stringify(view).includes('idempotency_key'), false);
  view.rooms[0].label = 'Alterada'; assert.notEqual(s.rooms[0].label, 'Alterada');
});
test('persistencia malformada falla cerrado, incluida propiedad desconocida', () => {
  for (const s of [{}, { ...populated(), secret: 'not-allowed' }, { ...initial(), revision: 1 },
    { ...populated(), rooms: [{ ...populated().rooms[0], owner_id: 'forged' }] }]) throws(() => validateSpaceState(s), 'CORRUPT_STATE');
});
test('fallar una orden no altera ni el estado ni la orden recibida', () => {
  const s = populated(), before = structuredClone(s), c = put({ x: 11 }), original = structuredClone(c);
  throws(() => run(s, c), 'POSITION_BLOCKED'); assert.deepEqual(s, before); assert.deepEqual(c, original);
});
test('historial rodante conserva secuencia canónica y recibos duraderos', () => {
  let s = populated();
  for (let i = 0; i < 140; i++) s = run(s, move({ idempotency_key: `m-${i}`, expected_revision: i })).state;
  assert.equal(s.events.length, LIMITS.events); assert.equal(s.events.at(-1).revision, s.revision);
  assert.equal(s.receipts.length, 141); assert.equal(run(s, roomCommand()).duplicate, true);
});
test('límite de recibos falla cerrado sin expulsar claves y permitir reejecución', () => {
  const s = initial(); s.revision = LIMITS.receipts;
  s.receipts = Array.from({ length: LIMITS.receipts }, (_, i) => ({ actor_id: 'human-a', owner_id: 'human-a', shared: false,
    key: `k-${i}`, hash: '0'.repeat(64), result: { revision: i + 1, resource_revision: i + 1 } }));
  s.events = Array.from({ length: LIMITS.events }, (_, i) => ({ revision: s.revision - LIMITS.events + i + 1,
    type: 'avatar.leave', actor_id: 'human-a', room_id: null, at: 1 }));
  validateSpaceState(s); throws(() => run(s, roomCommand()), 'CAPACITY_EXCEEDED');
});
