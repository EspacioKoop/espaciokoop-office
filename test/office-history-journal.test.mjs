import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPolicy } from '../src/fixtures.mjs';
import {
  createOfficeHistoryJournal,
  validateJournalEvent,
  EVENT_CATEGORY_OPERATIONAL,
  EVENT_CATEGORY_GAME,
  EVENT_CATEGORY_NARRATIVE,
} from '../src/office-history-journal.mjs';

function makeOpEvent(id = 'evt-op-1', overrides = {}) {
  return {
    id,
    category: EVENT_CATEGORY_OPERATIONAL,
    type: 'task.delivered',
    author: 'aurora/atlas',
    origin: 'github',
    timestamp: 1000,
    ownerId: 'aurora',
    projectId: 'demo/observatorio',
    payload: { issue: 11, pr: 21, status: 'delivered' },
    evidence: [{ kind: 'delivered', label: 'PR #21', url: 'https://github.com/demo/observatorio/pull/21', sha: '1234567890abcdef1234567890abcdef12345678' }],
    refId: null,
    ...overrides,
  };
}

function makeGameEvent(id = 'evt-game-1', overrides = {}) {
  return {
    id,
    category: EVENT_CATEGORY_GAME,
    type: 'badge.earned',
    author: 'aurora/atlas',
    origin: 'game-engine',
    timestamp: 2000,
    ownerId: 'aurora',
    projectId: 'demo/observatorio',
    payload: { badgeId: 'first_delivery', points: 100 },
    evidence: null,
    refId: null,
    ...overrides,
  };
}

function makeNarrativeEvent(id = 'evt-nar-1', overrides = {}) {
  return {
    id,
    category: EVENT_CATEGORY_NARRATIVE,
    type: 'newspaper.chronicle',
    author: 'aurora/cronista',
    origin: 'journal',
    timestamp: 3000,
    ownerId: 'aurora',
    projectId: 'demo/observatorio',
    payload: { summary: 'Gran hito de integración alcanzado por el equipo.' },
    evidence: null,
    refId: null,
    ...overrides,
  };
}

test('validacion de evento nominal en sus tres categorias', () => {
  const op = validateJournalEvent(makeOpEvent());
  assert.equal(op.category, 'operational');
  assert.equal(op.timestamp, 1000);

  const game = validateJournalEvent(makeGameEvent());
  assert.equal(game.category, 'game');

  const nar = validateJournalEvent(makeNarrativeEvent());
  assert.equal(nar.category, 'narrative');
});

test('prohibe contenido confidencial, claves prohibidas o tokens', () => {
  assert.throws(() => validateJournalEvent(makeOpEvent('evt-1', {
    payload: { secret_token: '12345' },
  })), { code: 'JOURNAL_FORBIDDEN_CONTENT' });

  assert.throws(() => validateJournalEvent(makeOpEvent('evt-2', {
    payload: { chat_log: 'Conversación privada entre agentes' },
  })), { code: 'JOURNAL_FORBIDDEN_CONTENT' });

  assert.throws(() => validateJournalEvent(makeOpEvent('evt-3', {
    payload: { header: 'Bearer secret_access_token_abc' },
  })), { code: 'JOURNAL_FORBIDDEN_CONTENT' });

  assert.throws(() => validateJournalEvent(makeOpEvent('evt-4', {
    payload: { password: 'my-password' },
  })), { code: 'JOURNAL_FORBIDDEN_CONTENT' });
});

test('prohibe confundir texto narrativo con evidencia operativa', () => {
  assert.throws(() => validateJournalEvent(makeNarrativeEvent('evt-nar-bad', {
    evidence: [{ kind: 'delivered', label: 'Invento', url: 'https://github.com/demo/observatorio/pull/1', sha: null }],
  })), { code: 'JOURNAL_EVIDENCE_MISMATCH' });
});

test('historial vacio genera peri\u00f3dico y consultas v\u00e1lidas', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  const result = journal.getEvents({ ownerId: 'aurora' });
  assert.equal(result.totalItems, 0);
  assert.equal(result.items.length, 0);

  const newspaper = journal.generateNewspaper({ ownerId: 'aurora' });
  assert.equal(newspaper.summary.totalOperational, 0);
  assert.equal(newspaper.summary.totalGame, 0);
  assert.equal(newspaper.summary.totalNarrative, 0);
  assert.equal(newspaper.pagination.totalItems, 0);
});

test('idempotencia y deduplicacion al registrar eventos', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  const event = makeOpEvent('evt-idemp-1');

  const first = journal.appendEvent(event);
  const second = journal.appendEvent(event);

  assert.deepEqual(first, second);
  const list = journal.getEvents({ ownerId: 'aurora' });
  assert.equal(list.totalItems, 1);

  assert.throws(() => journal.appendEvent({ ...event, timestamp: 9999 }), {
    code: 'JOURNAL_IDEMPOTENCY_CONFLICT',
  });
});

test('orden estable y paginacion de eventos', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  journal.appendEvent(makeNarrativeEvent('evt-3', { timestamp: 3000 }));
  journal.appendEvent(makeOpEvent('evt-1', { timestamp: 1000 }));
  journal.appendEvent(makeGameEvent('evt-2', { timestamp: 2000 }));

  const page1 = journal.getEvents({ ownerId: 'aurora', page: 1, pageSize: 2 });
  assert.equal(page1.totalItems, 3);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.items[0].id, 'evt-1');
  assert.equal(page1.items[1].id, 'evt-2');

  const page2 = journal.getEvents({ ownerId: 'aurora', page: 2, pageSize: 2 });
  assert.equal(page2.items[0].id, 'evt-3');
});

test('aislamiento de visibilidad por propietario y proyecto', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });

  // demo/observatorio es legible por aurora y marea
  journal.appendEvent(makeOpEvent('evt-shared', { projectId: 'demo/observatorio' }));
  // demo/archivo es legible solo por aurora
  journal.appendEvent(makeOpEvent('evt-private', { projectId: 'demo/archivo' }));

  const auroraView = journal.getEvents({ ownerId: 'aurora' });
  assert.equal(auroraView.totalItems, 2);

  const mareaView = journal.getEvents({ ownerId: 'marea' });
  assert.equal(mareaView.totalItems, 1);
  assert.equal(mareaView.items[0].id, 'evt-shared');
});

test('deshacer, corregir y tombstones de eventos', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  journal.appendEvent(makeOpEvent('evt-to-undo', { timestamp: 1000 }));

  const undoRecord = journal.undoEvent({ eventId: 'evt-to-undo', author: 'aurora', reason: 'Error en registro', timestamp: 1050 });
  assert.equal(undoRecord.refId, 'evt-to-undo');

  // Sin includeTombstones, el evento deshecho queda oculto
  const normalView = journal.getEvents({ ownerId: 'aurora' });
  assert.equal(normalView.totalItems, 1);
  assert.equal(normalView.items[0].id, undoRecord.id);

  // Con includeTombstones, se recupera el evento deshecho con marcador
  const tombstoneView = journal.getEvents({ ownerId: 'aurora', includeTombstones: true });
  assert.equal(tombstoneView.totalItems, 2);
  const undoneItem = tombstoneView.items.find(i => i.id === 'evt-to-undo');
  assert.equal(undoneItem.tombstone, true);
  assert.equal(undoneItem.tombstoneInfo.reason, 'Error en registro');
});

test('corregir evento tombstoniea el original y registra la correccion', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  journal.appendEvent(makeOpEvent('evt-orig', { timestamp: 1000 }));

  const correctedInput = makeOpEvent('evt-corrected', { timestamp: 1100, payload: { issue: 11, status: 'reviewed' } });
  const corrected = journal.correctEvent({ eventId: 'evt-orig', correction: correctedInput, author: 'aurora', reason: 'Actualizar estado' });

  assert.equal(corrected.refId, 'evt-orig');
  const view = journal.getEvents({ ownerId: 'aurora' });
  assert.equal(view.totalItems, 1);
  assert.equal(view.items[0].id, 'evt-corrected');
});

test('revocacion de evento, agente, propietario y proyecto con propagacion', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  journal.appendEvent(makeOpEvent('evt-p1', { projectId: 'demo/observatorio', author: 'aurora/atlas', timestamp: 1000 }));
  journal.appendEvent(makeOpEvent('evt-p2', { projectId: 'demo/archivo', author: 'aurora/lumen', timestamp: 2000 }));

  journal.revokeAgent('aurora/atlas');
  const viewAfterAgentRevoke = journal.getEvents({ ownerId: 'aurora' });
  assert.equal(viewAfterAgentRevoke.totalItems, 1);
  assert.equal(viewAfterAgentRevoke.items[0].id, 'evt-p2');

  journal.revokeProject('demo/archivo');
  const viewAfterProjectRevoke = journal.getEvents({ ownerId: 'aurora' });
  assert.equal(viewAfterProjectRevoke.totalItems, 0);
});

test('vista de periódico para personas que regresan con secciones segregadas', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  journal.appendEvent(makeOpEvent('evt-op-1', { timestamp: 1000 }));
  journal.appendEvent(makeGameEvent('evt-game-1', { timestamp: 2000 }));
  journal.appendEvent(makeNarrativeEvent('evt-nar-1', { timestamp: 3000 }));

  const newspaper = journal.generateNewspaper({ ownerId: 'aurora' });
  assert.equal(newspaper.summary.totalOperational, 1);
  assert.equal(newspaper.summary.totalGame, 1);
  assert.equal(newspaper.summary.totalNarrative, 1);

  assert.equal(newspaper.sections.operational.length, 1);
  assert.equal(newspaper.sections.game.length, 1);
  assert.equal(newspaper.sections.narrative.length, 1);
  assert.equal(newspaper.sections.narrative[0].evidence, null);
});

test('rewind (reproduccion temporal punto en el tiempo)', () => {
  const journal = createOfficeHistoryJournal({ policy: demoPolicy });
  journal.appendEvent(makeOpEvent('evt-t1000', { timestamp: 1000 }));
  journal.appendEvent(makeOpEvent('evt-t2000', { timestamp: 2000 }));
  journal.appendEvent(makeOpEvent('evt-t3000', { timestamp: 3000 }));

  const rewound = journal.rewind(2500);
  const view = rewound.getEvents({ ownerId: 'aurora' });
  assert.equal(view.totalItems, 2);
  assert.equal(view.items[0].id, 'evt-t1000');
  assert.equal(view.items[1].id, 'evt-t2000');
});

test('exportacion e importacion de estado (serializacion roundtrip)', () => {
  const journal1 = createOfficeHistoryJournal({ policy: demoPolicy });
  journal1.appendEvent(makeOpEvent('evt-s1', { timestamp: 1000 }));
  journal1.appendEvent(makeGameEvent('evt-s2', { timestamp: 2000 }));
  journal1.undoEvent({ eventId: 'evt-s1', author: 'aurora', reason: 'Prueba export' });

  const state = journal1.exportState();
  const journal2 = createOfficeHistoryJournal({ policy: demoPolicy });
  journal2.importState(state);

  const view1 = journal1.getEvents({ ownerId: 'aurora', includeTombstones: true });
  const view2 = journal2.getEvents({ ownerId: 'aurora', includeTombstones: true });

  assert.deepEqual(view1, view2);
});
