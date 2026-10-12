import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recoverPresence,
  recoverQueue,
  recoverJournal,
  exponentialBackoff,
  isRecoverableError,
  classifyError
} from '../src/recovery-engine.mjs';
import { ERROR_CATEGORIES } from '../src/recovery-types.mjs';

test('recoverPresence: snapshot vacío y estado del servidor vacío', () => {
  const result = recoverPresence([], []);
  assert.deepEqual(Array.from(result), []);
  assert.deepEqual(result.revokedAgents, []);
  assert.deepEqual(result.revokedProjects, []);
});

test('recoverPresence: snapshot con datos y estado fusionado', () => {
  const localSnapshot = [
    { id: 'marea/agent1', status: 'online', sequence: 1, seenAt: 100 }
  ];
  const serverState = [
    { id: 'marea/agent1', status: 'online', sequence: 2, seenAt: 200 },
    { id: 'marea/agent2', status: 'online', sequence: 1, seenAt: 150 }
  ];

  const result = recoverPresence(localSnapshot, serverState);
  assert.equal(result.length, 2);

  const agent1 = result.find(a => a.id === 'marea/agent1');
  assert.equal(agent1.sequence, 2);
  assert.equal(agent1.seenAt, 200);

  const agent2 = result.find(a => a.id === 'marea/agent2');
  assert.equal(agent2.sequence, 1);
  assert.equal(agent2.seenAt, 150);
});

test('recoverPresence: respeta revocación de agente durante recuperación', () => {
  const localSnapshot = {
    agents: [
      { id: 'marea/agent1', status: 'online', sequence: 5, seenAt: 1000 },
      { id: 'marea/agent2', status: 'online', sequence: 1, seenAt: 1000 }
    ],
    revokedAgents: ['marea/agent1']
  };

  const serverState = {
    agents: [
      { id: 'marea/agent1', status: 'online', sequence: 6, seenAt: 2000 },
      { id: 'marea/agent2', status: 'online', sequence: 2, seenAt: 2000 }
    ]
  };

  const result = recoverPresence(localSnapshot, serverState);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'marea/agent2');
  assert.deepEqual(result.revokedAgents, ['marea/agent1']);
});

test('recoverPresence: respeta revocación implícita por status "revoked"', () => {
  const localSnapshot = [
    { id: 'marea/agent1', status: 'revoked' }
  ];
  const serverState = [
    { id: 'marea/agent1', status: 'online', sequence: 10 }
  ];

  const result = recoverPresence(localSnapshot, serverState);
  assert.equal(result.length, 0);
  assert.ok(result.revokedAgents.includes('marea/agent1'));
});

test('recoverQueue: reenvía operaciones no confirmadas y descarta duplicados', () => {
  const localOps = [
    { operation_id: 'op-1', action: 'claim', issue: 10 },
    { operation_id: 'op-2', action: 'update', issue: 10 },
    { operation_id: 'op-1', action: 'claim', issue: 10 } // duplicado local
  ];

  const serverQueue = [
    { operation_id: 'op-1', status: 'completed' }
  ];

  const result = recoverQueue(localOps, serverQueue);
  assert.equal(result.length, 1);
  assert.equal(result[0].operation_id, 'op-2');
  assert.equal(result.discarded.length, 2);
});

test('recoverJournal: reenvía eventos no confirmados y detecta conflictos por eventId', () => {
  const localEvents = [
    { eventId: 'evt-101', type: 'STATE_CHANGE', payload: { state: 'draft' } },
    { eventId: 'evt-102', type: 'STATE_CHANGE', payload: { state: 'ready' } }
  ];

  const serverJournal = [
    { eventId: 'evt-101', type: 'STATE_CHANGE', payload: { state: 'draft' }, confirmedAt: 12345 }
  ];

  const result = recoverJournal(localEvents, serverJournal);
  assert.equal(result.length, 1);
  assert.equal(result[0].eventId, 'evt-102');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].eventId, 'evt-101');
  assert.equal(result.conflicts[0].server.confirmedAt, 12345);
});

test('exponentialBackoff: cálculo determinista con seed', () => {
  const delay1a = exponentialBackoff(1, 1000, 30000, 0.2, 'seed-abc');
  const delay1b = exponentialBackoff(1, 1000, 30000, 0.2, 'seed-abc');
  assert.equal(delay1a, delay1b);

  const delay2 = exponentialBackoff(2, 1000, 30000, 0.2, 'seed-abc');
  assert.ok(typeof delay1a === 'number');
  assert.ok(typeof delay2 === 'number');

  const delayNoJitter = exponentialBackoff(2, 1000, 30000, 0);
  assert.equal(delayNoJitter, 4000);

  const delayCap = exponentialBackoff(10, 1000, 5000, 0);
  assert.equal(delayCap, 5000);
});

test('isRecoverableError: clasifica adecuadamente los errores', () => {
  assert.equal(isRecoverableError({ code: 'ECONNRESET' }), true);
  assert.equal(isRecoverableError({ message: 'fetch failed' }), true);
  assert.equal(isRecoverableError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isRecoverableError({ status: 503 }), true);
  assert.equal(isRecoverableError({ status: 500 }), true);

  assert.equal(isRecoverableError({ status: 401 }), false);
  assert.equal(isRecoverableError({ status: 403 }), false);
  assert.equal(isRecoverableError({ code: 'AUTH' }), false);
  assert.equal(isRecoverableError({ code: 'PRESENCE_FORBIDDEN' }), false);

  assert.equal(classifyError({ status: 401 }), ERROR_CATEGORIES.AUTH);
  assert.equal(classifyError({ code: 'ECONNRESET' }), ERROR_CATEGORIES.NETWORK);
  assert.equal(classifyError({ status: 502 }), ERROR_CATEGORIES.SERVER_ERROR);
  assert.equal(classifyError({ code: 'TIMEOUT' }), ERROR_CATEGORIES.TIMEOUT);
  assert.equal(classifyError(null), ERROR_CATEGORIES.UNKNOWN);
});
