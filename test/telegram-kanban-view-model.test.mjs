import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTelegramKanbanViewModel, pseudonymizeIdentity } from '../src/telegram-kanban-view-model.mjs';

const mockPolicy = {
  version: 1,
  members: [
    { id: 'marea', label: 'Equipo Marea', githubLogin: 'marea-dev', keyHash: '1111111111111111111111111111111111111111111111111111111111111111' },
    { id: 'aurora', label: 'Equipo Aurora', githubLogin: 'aurora-dev', keyHash: '2222222222222222222222222222222222222222222222222222222222222222' }
  ],
  projects: [
    {
      repo: 'EspacioKoop/espaciokoop-office',
      label: 'Oficina Local',
      readers: ['marea', 'aurora'],
      tasks: [{ issue: 29, pullRequest: null }]
    },
    {
      repo: 'EspacioKoop/marea-private',
      label: 'Marea Privado',
      readers: ['marea'],
      tasks: [{ issue: 10, pullRequest: null }]
    }
  ]
};

test('telegram-kanban-view-model: fail-closed ante authorized=false, snapshot nulo o error HTTP', () => {
  const unauthorized = projectTelegramKanbanViewModel({ tasks: [] }, { authorized: false, agentIdentity: 'marea/bot' });
  assert.equal(unauthorized.status, 'unauthorized');
  assert.equal(unauthorized.isAvailable, false);
  assert.equal(unauthorized.text, 'Acceso no autorizado.');

  const nullSnapshot = projectTelegramKanbanViewModel(null, { authorized: true, agentIdentity: 'marea/bot' });
  assert.equal(nullSnapshot.status, 'error');
  assert.equal(nullSnapshot.isAvailable, false);

  const httpError = projectTelegramKanbanViewModel({ status: 500, error: 'SERVER_ERROR' }, { authorized: true, agentIdentity: 'marea/bot' });
  assert.equal(httpError.status, 'error');
  assert.equal(httpError.isAvailable, false);
});

test('telegram-kanban-view-model: fail-closed ante falta de identidad de agente o agente no registrado en política', () => {
  const noIdentity = projectTelegramKanbanViewModel({ tasks: [] }, { authorized: true, agentIdentity: null });
  assert.equal(noIdentity.status, 'unauthorized');
  assert.equal(noIdentity.message, 'Identidad de agente requerida.');

  const unknownIdentity = projectTelegramKanbanViewModel({ tasks: [] }, { authorized: true, agentIdentity: 'unknown-team/bot', policy: mockPolicy });
  assert.equal(unknownIdentity.status, 'unauthorized');
  assert.equal(unknownIdentity.message, 'Equipo no autorizado en política.');
});

test('telegram-kanban-view-model: aislamiento ACL por equipo y proyecto autorizado', () => {
  const snapshot = [
    { id: 'EspacioKoop/espaciokoop-office#29', project_id: 'EspacioKoop/espaciokoop-office', issue: 29, team_id: 'marea', title: 'Tarea Marea 1', stage: 'requested', url: 'https://github.com/EspacioKoop/espaciokoop-office/issues/29' },
    { id: 'EspacioKoop/espaciokoop-office#30', project_id: 'EspacioKoop/espaciokoop-office', issue: 30, team_id: 'aurora', title: 'Tarea Aurora 1', stage: 'requested', url: 'https://github.com/EspacioKoop/espaciokoop-office/issues/30' },
    { id: 'EspacioKoop/marea-private#10', project_id: 'EspacioKoop/marea-private', issue: 10, team_id: 'marea', title: 'Tarea Privada Marea', stage: 'accepted', url: 'https://github.com/EspacioKoop/marea-private/issues/10' }
  ];

  const mareaView = projectTelegramKanbanViewModel(snapshot, {
    authorized: true,
    agentIdentity: 'marea/bot',
    policy: mockPolicy
  });

  assert.equal(mareaView.status, 'available');
  assert.equal(mareaView.totalTasks, 2);
  assert.ok(mareaView.tasks.some(t => t.id === 'EspacioKoop/espaciokoop-office#29'));
  assert.ok(mareaView.tasks.some(t => t.id === 'EspacioKoop/marea-private#10'));
  assert.ok(!mareaView.tasks.some(t => t.id === 'EspacioKoop/espaciokoop-office#30'));

  const auroraView = projectTelegramKanbanViewModel(snapshot, {
    authorized: true,
    agentIdentity: 'aurora/worker',
    policy: mockPolicy
  });

  assert.equal(auroraView.status, 'available');
  assert.equal(auroraView.totalTasks, 1);
  assert.equal(auroraView.tasks[0].id, 'EspacioKoop/espaciokoop-office#30');
});

test('telegram-kanban-view-model: redacción de datos privados (tokens, cookies, rutas internas, URLs no permitidas)', () => {
  const snapshot = [
    {
      id: 'EspacioKoop/espaciokoop-office#29',
      project_id: 'EspacioKoop/espaciokoop-office',
      issue: 29,
      team_id: 'marea',
      title: 'Fix con ghp_1234567890abcdefghijklmnopqrstuv y token=secret123 en /var/secret/file.txt',
      stage: 'requested',
      url: 'https://evil.com/phishing',
      reasons: ['Error en C:\\Users\\Admin\\config.ini con cookie=sess_abc123xyz890']
    }
  ];

  const view = projectTelegramKanbanViewModel(snapshot, {
    authorized: true,
    agentIdentity: 'marea/bot',
    policy: mockPolicy
  });

  const task = view.tasks[0];
  assert.ok(!task.title.includes('ghp_'));
  assert.ok(!task.title.includes('/var/secret/file.txt'));
  assert.ok(task.title.includes('[REDACTADO]'));
  assert.ok(task.title.includes('[RUTA_REDACTADA]'));

  assert.equal(task.url, '[ENLACE_REDACTADO]');

  assert.ok(!task.reasons[0].includes('cookie=sess_abc123xyz890'));
  assert.ok(!task.reasons[0].includes('C:\\Users\\Admin\\config.ini'));

  assert.ok(!view.text.includes('ghp_'));
  assert.ok(!view.text.includes('evil.com'));
});

test('telegram-kanban-view-model: seudónimos deterministas para responsables y solicitantes', () => {
  const pseudo1 = pseudonymizeIdentity('marea-dev');
  const pseudo2 = pseudonymizeIdentity('marea-dev');
  const pseudoOther = pseudonymizeIdentity('aurora-dev');

  assert.equal(pseudo1, pseudo2);
  assert.notEqual(pseudo1, pseudoOther);
  assert.ok(pseudo1.startsWith('Agente-'));

  const snapshot = [
    {
      id: 'EspacioKoop/espaciokoop-office#29',
      project_id: 'EspacioKoop/espaciokoop-office',
      issue: 29,
      team_id: 'marea',
      title: 'Tarea test',
      stage: 'accepted',
      url: 'https://github.com/EspacioKoop/espaciokoop-office/issues/29',
      assignee: 'marea-dev',
      author: 'aurora-dev'
    }
  ];

  const view = projectTelegramKanbanViewModel(snapshot, {
    authorized: true,
    agentIdentity: 'marea/bot',
    policy: mockPolicy
  });

  const task = view.tasks[0];
  assert.equal(task.assignee, pseudo1);
  assert.equal(task.author, pseudoOther);
  assert.ok(!view.text.includes('marea-dev'));
  assert.ok(!view.text.includes('aurora-dev'));
  assert.ok(view.text.includes(pseudo1));
  assert.ok(view.text.includes(pseudoOther));
});

test('telegram-kanban-view-model: paginación de texto para Telegram', () => {
  const snapshot = [];
  for (let i = 1; i <= 12; i++) {
    snapshot.push({
      id: `EspacioKoop/espaciokoop-office#${i}`,
      project_id: `EspacioKoop/espaciokoop-office`,
      issue: i,
      team_id: 'marea',
      title: `Tarea número ${i}`,
      stage: i % 2 === 0 ? 'accepted' : 'requested',
      url: `https://github.com/EspacioKoop/espaciokoop-office/issues/${i}`
    });
  }

  const viewPage1 = projectTelegramKanbanViewModel(snapshot, {
    authorized: true,
    agentIdentity: 'marea/bot',
    policy: mockPolicy,
    page: 1,
    pageSize: 5
  });

  assert.equal(viewPage1.status, 'available');
  assert.equal(viewPage1.totalTasks, 12);
  assert.equal(viewPage1.totalPages, 3);
  assert.equal(viewPage1.currentPage, 1);
  assert.ok(viewPage1.text.includes('Página 1/3'));
  assert.ok(viewPage1.text.includes('EspacioKoop/espaciokoop-office#1'));
  assert.ok(viewPage1.text.includes('EspacioKoop/espaciokoop-office#5'));
  assert.ok(!viewPage1.text.includes('EspacioKoop/espaciokoop-office#6'));

  const viewPage2 = projectTelegramKanbanViewModel(snapshot, {
    authorized: true,
    agentIdentity: 'marea/bot',
    policy: mockPolicy,
    page: 2,
    pageSize: 5
  });

  assert.equal(viewPage2.currentPage, 2);
  assert.ok(viewPage2.text.includes('Página 2/3'));
  assert.ok(viewPage2.text.includes('EspacioKoop/espaciokoop-office#6'));
  assert.ok(viewPage2.text.includes('EspacioKoop/espaciokoop-office#10'));
});

test('telegram-kanban-view-model: cola vacía genera estado empty y mensaje informativo sin errores', () => {
  const emptyView = projectTelegramKanbanViewModel([], {
    authorized: true,
    agentIdentity: 'marea/bot',
    policy: mockPolicy
  });

  assert.equal(emptyView.status, 'empty');
  assert.equal(emptyView.isAvailable, true);
  assert.equal(emptyView.hasTasks, false);
  assert.equal(emptyView.totalTasks, 0);
  assert.equal(emptyView.totalPages, 1);
  assert.ok(emptyView.text.includes('No hay tareas visibles'));
});
