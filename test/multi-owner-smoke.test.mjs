import test from 'node:test';
import assert from 'node:assert/strict';
import { createOffice } from '../src/server.mjs';
import { digest } from '../src/domain.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';

const projectId = 'demo/observatorio';
const routes = [
  { project_id: projectId, issue: 11, team_id: 'marea' },
  { project_id: projectId, issue: 12, team_id: 'aurora' }
];
const directory = () => ({
  agents: [
    { id: 'aurora/worker', label: 'Worker Aurora', ownerId: 'aurora', projects: [projectId] },
    { id: 'marea/worker', label: 'Worker Marea', ownerId: 'marea', projects: [projectId] }
  ],
  credentials: [
    { agentId: 'aurora/worker', keyHash: digest('synthetic-aurora-agent') },
    { agentId: 'marea/worker', keyHash: digest('synthetic-marea-agent') }
  ]
});

async function start(t, { now, policyRef, directoryRef, routesRef, source } = {}) {
  const app = createOffice({
    mode: 'live',
    policyLoader: () => policyRef.current,
    source,
    taskRoutesLoader: () => routesRef.current,
    presenceLoader: () => directoryRef.current,
    now,
    config: { OFFICE_PRESENCE_PROJECT: projectId }
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { cookie, key, data } = {}) => fetch(origin + path, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(data === undefined ? {} : { origin, 'content-type': 'application/json' })
    },
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) })
  });
  const login = async team => {
    const response = await request('/api/session', { data: { key: `demo-${team}` } });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  const queue = async cookie => (await request('/api/queue', { cookie })).json();
  const presence = async cookie => (await request('/api/presence', { cookie })).json();
  const beat = (team, sequence) => request('/api/presence/heartbeat', {
    key: `synthetic-${team}-agent`, data: { projectId, sequence }
  });
  return { request, login, queue, presence, beat };
}

function oneTransientFailure() {
  const demo = new DemoSource();
  let failNext = true;
  return {
    read: async project => {
      if (failNext && project.repo === projectId) {
        failNext = false;
        throw new Error('PRIVATE_SENTINEL');
      }
      return demo.read(project);
    }
  };
}

test('smoke bilateral: cola, presencia, revocación, caducidad y reintentos quedan aislados por propietario', async t => {
  let time = 1000;
  const policyRef = { current: structuredClone(demoPolicy) };
  const directoryRef = { current: directory() };
  const routesRef = { current: structuredClone(routes) };
  const { request, login, queue, presence, beat } = await start(t, {
    now: () => time,
    policyRef,
    directoryRef,
    routesRef,
    source: oneTransientFailure()
  });

  const marea = await login('marea');
  const aurora = await login('aurora');
  const failedQueue = await request('/api/queue', { cookie: marea });
  assert.equal(failedQueue.status, 500);
  assert.doesNotMatch(await failedQueue.text(), /PRIVATE_SENTINEL|synthetic-|keyHash/);

  const mareaQueue = await queue(marea);
  assert.equal(mareaQueue.memberId, 'marea');
  assert.deepEqual(mareaQueue.queue.map(task => task.issue), [11]);
  assert.equal(mareaQueue.expiresAt - mareaQueue.generatedAt, 12000);
  assert.doesNotMatch(JSON.stringify(mareaQueue), /demo\/archivo|demo-marea|synthetic-|keyHash/);

  const auroraQueue = await queue(aurora);
  assert.equal(auroraQueue.memberId, 'aurora');
  assert.deepEqual(auroraQueue.queue.map(task => task.issue), [12]);
  assert.doesNotMatch(JSON.stringify(auroraQueue), /demo-marea|synthetic-|keyHash/);

  assert.equal((await beat('aurora', 0)).status, 200);
  assert.equal((await beat('marea', 0)).status, 200);
  assert.equal((await beat('marea', 0)).status, 409);
  assert.equal((await beat('marea', 1)).status, 200);

  const online = await presence(aurora);
  assert.deepEqual(online.agents.map(agent => [agent.id, agent.ownerId, agent.status]), [
    ['aurora/worker', 'aurora', 'online'],
    ['marea/worker', 'marea', 'online']
  ]);
  assert.doesNotMatch(JSON.stringify(online), /synthetic-|keyHash|sequence/);

  time = 7000;
  assert.deepEqual((await presence(aurora)).agents.map(agent => agent.status), ['stale', 'stale']);
  time = 17000;
  assert.deepEqual((await presence(aurora)).agents.map(agent => agent.status), ['offline', 'offline']);
  assert.equal((await beat('marea', 2)).status, 200);

  policyRef.current = structuredClone(demoPolicy);
  policyRef.current.projects[0].readers = ['aurora'];
  directoryRef.current = directory();
  directoryRef.current.agents = directoryRef.current.agents.slice(0, 1);
  directoryRef.current.credentials = directoryRef.current.credentials.slice(0, 1);
  routesRef.current = routesRef.current.filter(route => route.team_id === 'aurora');

  assert.equal((await request('/api/queue', { cookie: marea })).status, 401);
  const revokedBeat = await beat('marea', 3);
  assert.equal(revokedBeat.status, 401);
  assert.doesNotMatch(await revokedBeat.text(), /marea\/worker|synthetic-|keyHash|observatorio/);

  const freshAurora = await login('aurora');
  assert.deepEqual((await queue(freshAurora)).queue.map(task => task.issue), [12]);
  assert.deepEqual((await presence(freshAurora)).agents.map(agent => [agent.id, agent.status]), [['aurora/worker', 'offline']]);
});
