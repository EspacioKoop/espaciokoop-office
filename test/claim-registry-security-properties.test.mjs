import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaimRegistry,
  validateClaimEvent,
  isClaimActive,
  DEFAULT_LEASE_HOURS,
  CLAIM_REGISTRY_PROTOCOL_VERSION,
} from '../src/claim-registry.mjs';

const BASE = Date.parse('2026-10-01T00:00:00.000Z');
const iso = hours => new Date(BASE + hours * 3600 * 1000).toISOString();

function claimEvent(overrides = {}) {
  return {
    id: 10,
    at: iso(0),
    type: 'CLAIM',
    issue: 18,
    agent: 'AGENT_ALPHA',
    branch: 'agent/18-feature-alpha',
    files: ['src/feature.mjs'],
    goal: 'Reservar modulo para desarrollo.',
    lease_hours: null,
    reason: null,
    ...overrides,
  };
}

function prReadyEvent(overrides = {}) {
  return {
    id: 20,
    at: iso(1),
    type: 'PR_READY',
    issue: 18,
    agent: 'AGENT_ALPHA',
    branch: 'agent/18-feature-alpha',
    files: [],
    goal: null,
    lease_hours: null,
    reason: null,
    ...overrides,
  };
}

function releaseEvent(overrides = {}) {
  return {
    id: 30,
    at: iso(2),
    type: 'RELEASE',
    issue: 18,
    agent: 'AGENT_ALPHA',
    branch: 'agent/18-feature-alpha',
    files: [],
    goal: null,
    lease_hours: null,
    reason: 'entrega_completada',
    ...overrides,
  };
}

test('seguridad: RELEASE emitido por un agente no autorizado sobre la reserva de otro es rechazado', () => {
  const initial = claimEvent();
  const maliciousRelease = releaseEvent({ id: 31, agent: 'AGENT_INTRUDER', reason: 'intento_de_liberacion' });
  const registry = buildClaimRegistry([initial, maliciousRelease]);

  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].agent, 'AGENT_ALPHA');
  assert.equal(registry.released.length, 0);
  assert.equal(registry.rejected.length, 1);
  assert.equal(registry.rejected[0].kind, 'ORPHAN_RELEASE');
  assert.equal(registry.rejected[0].event.agent, 'AGENT_INTRUDER');
});

test('seguridad: PR_READY emitido por un agente no autorizado sobre la reserva de otro es rechazado', () => {
  const initial = claimEvent();
  const maliciousPrReady = prReadyEvent({ id: 21, agent: 'AGENT_INTRUDER' });
  const registry = buildClaimRegistry([initial, maliciousPrReady]);

  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].prReady, false);
  assert.equal(registry.rejected.length, 1);
  assert.equal(registry.rejected[0].kind, 'ORPHAN_PR_READY');
  assert.equal(registry.rejected[0].event.agent, 'AGENT_INTRUDER');
});

test('seguridad y suplantación de issue: PR_READY o RELEASE con issue falso o alterado son rechazados', () => {
  const initial = claimEvent({ issue: 18 });
  const fakePr = prReadyEvent({ id: 21, issue: 99 });
  const fakeRelease = releaseEvent({ id: 31, issue: 99 });

  const registry = buildClaimRegistry([initial, fakePr, fakeRelease]);

  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].prReady, false);
  assert.equal(registry.released.length, 0);
  assert.equal(registry.rejected.length, 2);
  assert.deepEqual(registry.rejected.map(r => r.kind), ['ORPHAN_PR_READY', 'ORPHAN_RELEASE']);
});

test('seguridad y suplantación de agente: intentar cambiar el agente mediante CLAIM en la misma rama falla', () => {
  const first = claimEvent({ id: 10, agent: 'AGENT_ALPHA', issue: 18 });
  const takeover = claimEvent({ id: 11, at: iso(0.5), agent: 'AGENT_TAKEOVER', issue: 18, goal: 'Intento apoderarse' });

  const registry = buildClaimRegistry([first, takeover]);

  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].agent, 'AGENT_ALPHA');
  assert.equal(registry.conflicts.length, 1);
  assert.equal(registry.conflicts[0].kind, 'BRANCH_OWNED_BY_OTHER');
  assert.equal(registry.conflicts[0].holder.agent, 'AGENT_ALPHA');
});

test('seguridad y suplantación: CLAIM sobre rama activa no puede alterar el issue asignado', () => {
  const first = claimEvent({ id: 10, agent: 'AGENT_ALPHA', issue: 18 });
  const alterIssue = claimEvent({ id: 11, at: iso(0.5), agent: 'AGENT_ALPHA', issue: 99, goal: 'Cambiar de issue' });

  const registry = buildClaimRegistry([first, alterIssue]);

  assert.equal(registry.active.length, 1);
  assert.equal(registry.active[0].issue, 18);
  assert.equal(registry.conflicts.length, 1);
  assert.equal(registry.conflicts[0].kind, 'BRANCH_ISSUE_MISMATCH');
  assert.equal(registry.conflicts[0].holder.issue, 18);
});

test('determinismo e invariancia: permutationes en el orden de llegada producen exactamente el mismo registro', () => {
  const events = [
    claimEvent({ id: 10, at: iso(0), agent: 'ALPHA', branch: 'agent/18-a', files: ['a.mjs'] }),
    claimEvent({ id: 20, at: iso(1), agent: 'BETA', branch: 'agent/18-b', files: ['b.mjs'] }),
    prReadyEvent({ id: 30, at: iso(2), agent: 'ALPHA', branch: 'agent/18-a' }),
    releaseEvent({ id: 40, at: iso(3), agent: 'ALPHA', branch: 'agent/18-a' }),
    claimEvent({ id: 50, at: iso(4), agent: 'GAMMA', branch: 'agent/18-c', files: ['a.mjs'] }),
  ];

  const canonical = buildClaimRegistry(events, { now: iso(5) });

  const permutations = [
    [...events].reverse(),
    [events[2], events[0], events[4], events[1], events[3]],
    [events[4], events[3], events[2], events[1], events[0]],
  ];

  for (const perm of permutations) {
    const result = buildClaimRegistry(perm, { now: iso(5) });
    assert.deepEqual(result, canonical);
  }
});

test('determinismo e igual timestamp: desempate estricto por menor id de comentario', () => {
  const sameTimeIso = iso(2);
  const event1 = claimEvent({ id: 105, at: sameTimeIso, agent: 'AGENT_BETA', branch: 'agent/18-beta', files: ['shared.mjs'] });
  const event2 = claimEvent({ id: 42, at: sameTimeIso, agent: 'AGENT_ALPHA', branch: 'agent/18-alpha', files: ['shared.mjs'] });

  const res1 = buildClaimRegistry([event1, event2]);
  const res2 = buildClaimRegistry([event2, event1]);

  assert.deepEqual(res1, res2);
  assert.equal(res1.active.length, 1);
  assert.equal(res1.active[0].agent, 'AGENT_ALPHA', 'El evento con id=42 prevalece sobre id=105');
  assert.equal(res1.conflicts.length, 1);
  assert.equal(res1.conflicts[0].event.agent, 'AGENT_BETA');
});

test('idempotencia: repetición de eventos RELEASE o PR_READY no degrada estado ni abre reservas', () => {
  const c = claimEvent();
  const pr1 = prReadyEvent({ id: 20, at: iso(1) });
  const rel1 = releaseEvent({ id: 30, at: iso(2) });
  const rel2 = releaseEvent({ id: 31, at: iso(3) });

  const registry = buildClaimRegistry([c, pr1, rel1, rel2]);

  assert.equal(registry.active.length, 0);
  assert.equal(registry.released.length, 1);
  assert.equal(registry.released[0].prReady, true);
  assert.equal(registry.rejected.length, 0);
});

test('rechazo estricto de alias de rutas no canónicas POSIX en CLAIM', () => {
  const badPaths = [
    './src/file.mjs',
    '../src/file.mjs',
    'src/./file.mjs',
    'src/../file.mjs',
    'src//file.mjs',
    '//src/file.mjs',
    'src/file.mjs/',
    'src\\\\file.mjs',
    'src/file.mjs ',
    ' src/file.mjs',
    'src/\x00file.mjs',
    'src/\nfile.mjs',
    '/abs/path.mjs',
  ];

  for (const badPath of badPaths) {
    assert.throws(
      () => validateClaimEvent(claimEvent({ files: [badPath] })),
      err => err.code === 'CLAIM_EVENT',
      `Debe rechazar la ruta no canónica: ${JSON.stringify(badPath)}`
    );
  }
});

test('rechazo de listas de archivos inválidas (duplicadas, vacías o >20)', () => {
  assert.throws(
    () => validateClaimEvent(claimEvent({ files: ['a.mjs', 'a.mjs'] })),
    err => err.code === 'CLAIM_EVENT',
    'Debe rechazar archivos duplicados'
  );

  assert.throws(
    () => validateClaimEvent(claimEvent({ files: [] })),
    err => err.code === 'CLAIM_EVENT',
    'CLAIM debe requerir al menos 1 archivo'
  );

  const tooMany = Array.from({ length: 21 }, (_, i) => `file_${i}.mjs`);
  assert.throws(
    () => validateClaimEvent(claimEvent({ files: tooMany })),
    err => err.code === 'CLAIM_EVENT',
    'CLAIM debe limitar el numero maximo de archivos a 20'
  );
});

test('invariante de inmutabilidad: buildClaimRegistry no muta el array de eventos ni sus objetos (soporta Object.freeze)', () => {
  const originalEvents = [
    claimEvent({ id: 10, files: ['a.mjs', 'b.mjs'] }),
    prReadyEvent({ id: 20 }),
    releaseEvent({ id: 30 }),
  ];

  const cloneBefore = JSON.parse(JSON.stringify(originalEvents));

  const frozenEvents = originalEvents.map(e => Object.freeze({ ...e, files: Object.freeze([...e.files]) }));
  Object.freeze(frozenEvents);

  const registry = buildClaimRegistry(frozenEvents);

  assert.equal(registry.released.length, 1);
  assert.deepEqual(originalEvents, cloneBefore, 'Los objetos de evento originales no deben sufrir mutaciones');
});

test('contención entre dos escritores: exclusión de archivos y liberación secuencial', () => {
  const writerA = claimEvent({ id: 10, at: iso(0), agent: 'WRITER_A', branch: 'agent/18-a', files: ['src/shared.mjs'] });
  const writerB = claimEvent({ id: 11, at: iso(0.5), agent: 'WRITER_B', branch: 'agent/18-b', files: ['src/shared.mjs'] });

  const reg1 = buildClaimRegistry([writerA, writerB]);
  assert.equal(reg1.active.length, 1);
  assert.equal(reg1.active[0].agent, 'WRITER_A');
  assert.equal(reg1.conflicts.length, 1);
  assert.equal(reg1.conflicts[0].kind, 'FILES_RESERVED');

  const releaseA = releaseEvent({ id: 12, at: iso(1), agent: 'WRITER_A', branch: 'agent/18-a' });
  const writerBRetry = claimEvent({ id: 13, at: iso(1.5), agent: 'WRITER_B', branch: 'agent/18-b', files: ['src/shared.mjs'] });

  const reg2 = buildClaimRegistry([writerA, writerB, releaseA, writerBRetry]);
  assert.equal(reg2.active.length, 1);
  assert.equal(reg2.active[0].agent, 'WRITER_B');
  assert.equal(reg2.released.length, 1);
  assert.equal(reg2.released[0].agent, 'WRITER_A');
});

test('expiración con reloj controlado (now): límites exactos de caducidad', () => {
  const leaseHours = 10;
  const claim = claimEvent({ id: 10, at: iso(0), lease_hours: leaseHours });

  const exactlyAtLimit = iso(leaseHours);
  const justAfterLimit = iso(leaseHours + 0.0001); // unos milisegundos despues

  const regActive = buildClaimRegistry([claim], { now: exactlyAtLimit });
  assert.equal(regActive.active.length, 1);
  assert.equal(regActive.expired.length, 0);

  const regExpired = buildClaimRegistry([claim], { now: justAfterLimit });
  assert.equal(regExpired.active.length, 0);
  assert.equal(regExpired.expired.length, 1);
  assert.equal(regExpired.expired[0].agent, 'AGENT_ALPHA');
});

test('cotas y límites: límite exacto de 5000 eventos permitidos y rechazo a 5001', () => {
  const buildEvents = count => Array.from({ length: count }, (_, i) => claimEvent({
    id: i + 1,
    at: iso(i * 0.001),
    branch: `agent/18-b${i}`,
    files: [`src/f_${i}.mjs`],
  }));

  const validBatch = buildEvents(5000);
  const result = buildClaimRegistry(validBatch);
  assert.equal(result.active.length, 5000);

  const overflowBatch = buildEvents(5001);
  assert.throws(
    () => buildClaimRegistry(overflowBatch),
    err => err.code === 'CLAIM_REGISTRY',
    'Debe lanzar error CLAIM_REGISTRY cuando excede los 5000 eventos'
  );
});

test('contrato de respuesta pública: protocolo de versión y estructura canónica', () => {
  const events = [claimEvent()];
  const reg = buildClaimRegistry(events, { now: iso(1) });

  assert.equal(reg.protocolVersion, CLAIM_REGISTRY_PROTOCOL_VERSION);
  assert.equal(typeof reg.now, 'string');
  assert.ok(Array.isArray(reg.active));
  assert.ok(Array.isArray(reg.expired));
  assert.ok(Array.isArray(reg.released));
  assert.ok(Array.isArray(reg.conflicts));
  assert.ok(Array.isArray(reg.rejected));

  const active = reg.active[0];
  assert.deepEqual(Object.keys(active).sort(), [
    'agent',
    'branch',
    'createdAt',
    'createdId',
    'files',
    'goal',
    'issue',
    'lastActivityAt',
    'lastActivityId',
    'leaseHours',
    'prReady',
    'releaseReason',
    'released',
    'releasedAt',
  ]);
});
