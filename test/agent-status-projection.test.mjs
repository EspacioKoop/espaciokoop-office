import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPolicy } from '../src/fixtures.mjs';
import { createPresenceRegistry } from '../src/presence.mjs';
import {
  validateAgentCatalog,
  buildSyntheticFixtureCatalog,
  projectAgentStatus,
  projectFixtureAgentStatus,
} from '../src/agent-status-projection.mjs';

test('validateAgentCatalog: catálogo válido y alineado con política', () => {
  const catalog = [
    {
      id: 'aurora/hermes',
      label: 'Hermes Agent',
      ownerId: 'aurora',
      role: 'operator',
      projects: ['demo/observatorio', 'demo/archivo'],
      provider: { provider_id: 'hermes-v1', provider_type: 'adapter', adapter_id: 'adapter-hermes' },
      capabilities: ['agent.config.read'],
      authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: ['demo/observatorio'] },
    },
  ];

  const validated = validateAgentCatalog(catalog, demoPolicy);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].id, 'aurora/hermes');
  assert.equal(validated[0].ownerId, 'aurora');
  assert.equal(validated[0].provider.provider_id, 'hermes-v1');
  assert.equal(validated[0].authorityLimits.read_only, true);
  assert.equal(validated[0].authorityLimits.arbitrary_execution, false);
});

test('validateAgentCatalog: rechazo estricto ante IDs duplicados, propietarios ajenos o proyectos no autorizados', () => {
  // 1. Propietario en ID no coincide con ownerId
  assert.throws(
    () => validateAgentCatalog([
      {
        id: 'aurora/bot',
        label: 'Bot',
        ownerId: 'marea',
        role: 'engineer',
        projects: ['demo/observatorio'],
        provider: { provider_id: 'p1' },
        capabilities: [],
        authorityLimits: {},
      },
    ], demoPolicy),
    err => err.code === 'AGENT_CATALOG'
  );

  // 2. Propietario no tiene permiso de lectura sobre el proyecto declarado
  assert.throws(
    () => validateAgentCatalog([
      {
        id: 'marea/bot',
        label: 'Bot Marea',
        ownerId: 'marea',
        role: 'engineer',
        projects: ['demo/archivo'], // demo/archivo solo es accesible por aurora
        provider: { provider_id: 'p1' },
        capabilities: [],
        authorityLimits: {},
      },
    ], demoPolicy),
    err => err.code === 'AGENT_CATALOG'
  );

  // 3. ID duplicado
  assert.throws(
    () => validateAgentCatalog([
      {
        id: 'aurora/hermes',
        label: 'Hermes 1',
        ownerId: 'aurora',
        role: 'operator',
        projects: ['demo/observatorio'],
        provider: { provider_id: 'p1' },
        capabilities: [],
        authorityLimits: {},
      },
      {
        id: 'aurora/hermes',
        label: 'Hermes 2',
        ownerId: 'aurora',
        role: 'operator',
        projects: ['demo/observatorio'],
        provider: { provider_id: 'p2' },
        capabilities: [],
        authorityLimits: {},
      },
    ], demoPolicy),
    err => err.code === 'AGENT_CATALOG'
  );
});

test('projectAgentStatus: clasificación de estados connected, stale, offline, unknown', () => {
  let currentTime = 10000;
  const now = () => currentTime;

  const directory = [
    { id: 'aurora/hermes', label: 'Hermes Aurora', ownerId: 'aurora', projects: ['demo/observatorio'] },
    { id: 'marea/curro', label: 'Curro Marea', ownerId: 'marea', projects: ['demo/observatorio'] },
    { id: 'aurora/silent', label: 'Silent Aurora', ownerId: 'aurora', projects: ['demo/observatorio'] },
  ];

  const presence = createPresenceRegistry({ directory, policy: demoPolicy, now, onlineFor: 5000, ttl: 15000 });

  // Heartbeats
  presence.heartbeat({ agentId: 'aurora/hermes', projectId: 'demo/observatorio', sequence: 1 }); // Online (visto a 10000)

  currentTime = 12000;
  presence.heartbeat({ agentId: 'marea/curro', projectId: 'demo/observatorio', sequence: 1 }); // Online (visto a 12000)

  currentTime = 17000; // aurora/hermes visto hace 7000ms (> onlineFor 5000) -> stale. marea/curro visto hace 5000ms -> connected. aurora/silent sin heartbeat -> unknown.

  const catalog = [
    {
      id: 'aurora/hermes',
      label: 'Hermes Aurora',
      ownerId: 'aurora',
      role: 'operator',
      projects: ['demo/observatorio'],
      provider: { provider_id: 'hermes-prov', provider_type: 'adapter', adapter_id: 'a1' },
      capabilities: ['agent.config.read'],
      authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: ['demo/observatorio'] },
    },
    {
      id: 'marea/curro',
      label: 'Curro Marea',
      ownerId: 'marea',
      role: 'engineer',
      projects: ['demo/observatorio'],
      provider: { provider_id: 'curro-prov', provider_type: 'adapter', adapter_id: 'a2' },
      capabilities: ['agent.config.read'],
      authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: ['demo/observatorio'] },
    },
    {
      id: 'aurora/silent',
      label: 'Silent Aurora',
      ownerId: 'aurora',
      role: 'observer',
      projects: ['demo/observatorio'],
      provider: { provider_id: 'silent-prov', provider_type: 'adapter', adapter_id: 'a3' },
      capabilities: ['agent.config.read'],
      authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: ['demo/observatorio'] },
    },
  ];

  const result = projectAgentStatus({
    catalog,
    presence,
    policy: demoPolicy,
    requesterId: 'aurora',
    now,
  });

  assert.equal(result.status, 'available');
  assert.equal(result.total_agents, 3);

  const hermes = result.agents.find(a => a.profile.id === 'aurora/hermes');
  assert.equal(hermes.status, 'stale');

  const curro = result.agents.find(a => a.profile.id === 'marea/curro');
  assert.equal(curro.status, 'connected');

  const silent = result.agents.find(a => a.profile.id === 'aurora/silent');
  assert.equal(silent.status, 'unknown');
});

test('projectAgentStatus: estado offline tras caducidad del ttl', () => {
  const presenceList = [
    { id: 'aurora/hermes', status: 'offline', seenAt: 1000 },
  ];

  const catalog = [
    {
      id: 'aurora/hermes',
      label: 'Hermes Aurora',
      ownerId: 'aurora',
      role: 'operator',
      projects: ['demo/observatorio'],
      provider: { provider_id: 'hermes-prov', provider_type: 'adapter', adapter_id: 'a1' },
      capabilities: ['agent.config.read'],
      authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: ['demo/observatorio'] },
    },
  ];

  const result = projectAgentStatus({
    catalog,
    presence: presenceList,
    policy: demoPolicy,
    requesterId: 'aurora',
  });

  assert.equal(result.agents[0].status, 'offline');
  assert.equal(result.agents[0].status_detail.last_seen_at, 1000);
});

test('projectAgentStatus: aislamiento de autorización por requesterId y proyectos', () => {
  const catalog = [
    {
      id: 'aurora/hermes',
      label: 'Hermes Aurora',
      ownerId: 'aurora',
      role: 'operator',
      projects: ['demo/observatorio', 'demo/archivo'],
      provider: { provider_id: 'hermes-prov', provider_type: 'adapter', adapter_id: 'a1' },
      capabilities: ['agent.config.read'],
      authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: ['demo/observatorio', 'demo/archivo'] },
    },
  ];

  // Marea solo tiene permiso de lectura en demo/observatorio, no en demo/archivo
  const resultMarea = projectAgentStatus({
    catalog,
    policy: demoPolicy,
    requesterId: 'marea',
  });

  assert.equal(resultMarea.agents.length, 1);
  assert.deepEqual(resultMarea.agents[0].profile.projects, ['demo/observatorio']);

  // Aurora tiene acceso a ambos proyectos
  const resultAurora = projectAgentStatus({
    catalog,
    policy: demoPolicy,
    requesterId: 'aurora',
  });

  assert.equal(resultAurora.agents.length, 1);
  assert.deepEqual(resultAurora.agents[0].profile.projects, ['demo/observatorio', 'demo/archivo']);

  // Solicitar un projectFilter no autorizado lanza error 403
  assert.throws(
    () => projectAgentStatus({
      catalog,
      policy: demoPolicy,
      requesterId: 'marea',
      projectFilter: 'demo/archivo',
    }),
    err => err.code === 'FORBIDDEN' && err.status === 403
  );

  // Solicitar un requesterId no perteneciente a la política lanza error 401
  assert.throws(
    () => projectAgentStatus({
      catalog,
      policy: demoPolicy,
      requesterId: 'hacker',
    }),
    err => err.code === 'AUTH' && err.status === 401
  );
});

test('projectAgentStatus: separación de identidad de proveedor, límites de autoridad y ausencia de credenciales', () => {
  const catalog = [
    {
      id: 'aurora/hermes',
      label: 'Hermes Agent',
      ownerId: 'aurora',
      role: 'operator',
      projects: ['demo/observatorio'],
      provider: { provider_id: 'github-actions', provider_type: 'adapter', adapter_id: 'gh-adapter-01', secretToken: 'LEAKED_TOKEN' },
      capabilities: ['agent.config.read', 'agent.lifecycle.start'],
      authorityLimits: { read_only: false, arbitrary_execution: true, allowed_projects: ['demo/observatorio'] },
    },
  ];

  const result = projectAgentStatus({
    catalog,
    policy: demoPolicy,
    requesterId: 'aurora',
  });

  const agent = result.agents[0];

  // Identidad de proveedor separada de perfil
  assert.deepEqual(agent.profile, {
    id: 'aurora/hermes',
    owner_id: 'aurora',
    label: 'Hermes Agent',
    role: 'operator',
    projects: ['demo/observatorio'],
  });

  assert.deepEqual(agent.provider, {
    provider_id: 'github-actions',
    provider_type: 'adapter',
    adapter_id: 'gh-adapter-01',
  });

  // Garantía de límites de autoridad (solo lectura, sin ejecución remota arbitraria)
  assert.equal(agent.authority_limits.read_only, true);
  assert.equal(agent.authority_limits.arbitrary_execution, false);

  // Garantía de cero credenciales/secretos en la proyección
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /LEAKED_TOKEN/);
  assert.doesNotMatch(serialized, /secret|token|password/i);
});

test('projectAgentStatus: vinculación de cola de tareas', () => {
  const queues = [
    { agent_id: 'aurora/hermes', active_task_id: 'demo/observatorio#11', assigned_count: 2 },
  ];

  const result = projectFixtureAgentStatus(demoPolicy, 'aurora', { queues });
  const hermes = result.agents.find(a => a.profile.id === 'aurora/hermes');

  assert.ok(hermes);
  assert.equal(hermes.queue.active_task_id, 'demo/observatorio#11');
  assert.equal(hermes.queue.assigned_count, 2);
});

test('projectFixtureAgentStatus: proyección de fixtures sintéticos sin configuración previa', () => {
  const result = projectFixtureAgentStatus(demoPolicy, 'aurora');

  assert.equal(result.status, 'available');
  assert.equal(result.is_available, true);
  assert.equal(result.requester_id, 'aurora');
  assert.ok(result.total_agents >= 2);

  const hermes = result.agents.find(a => a.profile.id === 'aurora/hermes');
  const curro = result.agents.find(a => a.profile.id === 'marea/curro');

  assert.ok(hermes);
  assert.ok(curro);
  assert.equal(hermes.provider.provider_type, 'synthetic-fixture');
  assert.equal(curro.provider.provider_type, 'synthetic-fixture');
});

test('projectAgentStatus: orden determinista por ID y saneamiento de caracteres de control', () => {
  const catalog = [
    {
      id: 'marea/curro',
      label: 'Curro\u0000\u001f\u007f',
      ownerId: 'marea',
      role: 'engineer',
      projects: ['demo/observatorio'],
      provider: { provider_id: 'p2' },
      capabilities: [],
      authorityLimits: {},
    },
    {
      id: 'aurora/hermes',
      label: 'Hermes',
      ownerId: 'aurora',
      role: 'operator',
      projects: ['demo/observatorio'],
      provider: { provider_id: 'p1' },
      capabilities: [],
      authorityLimits: {},
    },
  ];

  const result = projectAgentStatus({ catalog, policy: demoPolicy, requesterId: 'aurora' });

  // Orden estricto por ID
  assert.equal(result.agents[0].profile.id, 'aurora/hermes');
  assert.equal(result.agents[1].profile.id, 'marea/curro');

  // Saneamiento de texto
  assert.equal(result.agents[1].profile.label, 'Curro');
});
