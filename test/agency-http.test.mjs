import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

async function portNumber() {
  const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise(r => s.close(r)); return port;
}
async function start(directory) {
  const port = await portNumber();
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OFFICE_')));
  const child = spawn(process.execPath, ['src/server.mjs', '--demo'], { env: { ...env, OFFICE_PORT: String(port), ...(directory ? { OFFICE_AGENCY_DIR: directory } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stderr.on('data', b => { output += b; });
  const exit = new Promise(r => child.once('exit', r));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    child.stdout.on('data', () => { clearTimeout(timer); resolve(); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`startup: ${output}`)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  async function request(path, data, headers = {}) {
    const response = await fetch(origin + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  return { request, async close() { child.kill('SIGTERM'); await exit; } };
}
test('conectores sintéticos por HTTP: aislamiento, reinicio y revocación', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agency-http-')); let app;
  try {
    app = await start(dir);
    let a = (await app.request('/api/session', { key: 'demo-aurora' })).cookie;
    let b = (await app.request('/api/session', { key: 'demo-marea' })).cookie;
    assert.equal((await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'hermes' })).status, 401);
    const created = await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'hermes' }, { cookie: a });
    assert.equal(created.status, 201); const { id, token } = created.body;
    const other = await app.request('/api/agency/connectors', { operation_id: 'b', runtime: 'claude-code' }, { cookie: b });
    assert.equal(other.status, 201);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${other.body.token}` })).status, 200);
    assert.equal((await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'hermes' }, { cookie: a })).body.token, undefined);
    assert.equal((await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'claude-code' }, { cookie: a })).status, 409);
    assert.equal((await app.request(`/api/agency/connectors/${id}/revoke`, {}, { cookie: b })).status, 403);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${token}` })).status, 200);
    assert.equal(readFileSync(join(dir, 'agency.sqlite')).includes(token), false);
    await app.close(); app = await start(dir);
    a = (await app.request('/api/session', { key: 'demo-aurora' })).cookie;
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${token}` })).status, 200);
    assert.equal((await app.request(`/api/agency/connectors/${id}/revoke`, {}, { cookie: a })).status, 200);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${token}` })).status, 401);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${other.body.token}` })).status, 200);
    assert.equal((await app.request('/api/agency', undefined, { cookie: a })).status, 200);
  } finally { await app?.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('sin almacén configurado, agencia falla cerrado tras autenticación', async () => {
  const app = await start();
  try {
    const a = (await app.request('/api/session', { key: 'demo-aurora' })).cookie;
    assert.equal((await app.request('/api/agency', undefined, { cookie: a })).status, 503);
  } finally { await app.close(); }
});

test('diagnóstico sintético HTTP: migración, vigencia, aislamiento e idempotencia', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agency-diagnostic-')); let app;
  try {
    app = await start(dir);
    let a = (await app.request('/api/session', {key:'demo-aurora'})).cookie;
    const b = (await app.request('/api/session', {key:'demo-marea'})).cookie;
    const connector = (await app.request('/api/agency/connectors', {operation_id:'c',runtime:'hermes'}, {cookie:a})).body;
    const auth = {authorization:`Bearer ${connector.token}`};
    const item = {agent_ref:'fixture',name:'Agente sintético',status:'offline',capabilities:[],reason_code:'auth_unavailable'};
    const report = (operation_id, agent = item) => ({operation_id,agents:[agent]});
    const send = data => app.request('/api/agency/connectors/agents',data,auth);
    assert.equal((await send(report('first'))).status,200);
    assert.equal((await send(report('first'))).status,200);
    assert.equal((await send(report('first',{...item,reason_code:'probe_failed'}))).status,409);
    assert.equal((await send(report('bad',{...item,reason_code:'error /privado token'}))).status,400);
    assert.equal((await app.request('/api/agency',undefined,{cookie:a})).body.agents[0].reason_code,'auth_unavailable');
    assert.equal((await app.request('/api/agency',undefined,{cookie:b})).body.agents.length,0);
    await app.close(); app=await start(dir); a=(await app.request('/api/session',{key:'demo-aurora'})).cookie;
    assert.equal((await app.request('/api/agency',undefined,{cookie:a})).body.agents[0].reason_code,'auth_unavailable');
    assert.equal((await send(report('ready',{...item,status:'available'}))).status,200);
    assert.equal((await app.request('/api/agency',undefined,{cookie:a})).body.agents[0].reason_code,null);
    assert.equal((await send(report('again'))).status,200);
    const {reason_code, ...withoutReason} = item;
    assert.equal((await send(report('without',withoutReason))).status,200);
    assert.equal((await app.request('/api/agency',undefined,{cookie:a})).body.agents[0].reason_code,null);
    assert.equal((await send(report('expire'))).status,200);
    let db = new DatabaseSync(join(dir,'agency.sqlite')); db.prepare('UPDATE agency_agents SET last_seen=?').run(Date.now()-61000); db.close();
    assert.equal((await app.request('/api/agency',undefined,{cookie:a})).body.agents[0].reason_code,null);
    assert.equal((await send(report('revoke'))).status,200);
    assert.equal((await app.request(`/api/agency/connectors/${connector.id}/revoke`,{},{cookie:a})).status,200);
    assert.equal((await app.request('/api/agency',undefined,{cookie:a})).body.agents[0].reason_code,null);
    await app.close(); app=null;
    db = new DatabaseSync(join(dir,'agency.sqlite')); db.exec('ALTER TABLE agency_agents DROP COLUMN reason_code'); db.close();
    app=await start(dir); a=(await app.request('/api/session',{key:'demo-aurora'})).cookie;
    const migrated=(await app.request('/api/agency',undefined,{cookie:a})).body.agents;
    assert.equal(migrated.length,1); assert.equal(migrated[0].name,'Agente sintético'); assert.equal(migrated[0].reason_code,null);
  } finally { await app?.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('inventario reportado y movimientos duraderos, aislados por propietario', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agency-flow-')); let app;
  try {
    app = await start(dir);
    let a = (await app.request('/api/session', { key: 'demo-aurora' })).cookie;
    let b = (await app.request('/api/session', { key: 'demo-marea' })).cookie;
    const ca = (await app.request('/api/agency/connectors', {operation_id:'ca',runtime:'hermes'}, {cookie:a})).body;
    const cb = (await app.request('/api/agency/connectors', {operation_id:'cb',runtime:'claude-code'}, {cookie:b})).body;
    const auth = {authorization:`Bearer ${ca.token}`};
    const report = {operation_id:'report1',agents:[{agent_ref:'synthetic',name:'Agente sintético',status:'available',capabilities:['observe']}]};
    assert.equal((await app.request('/api/agency/connectors/agents',report,auth)).status,200);
    assert.equal((await app.request('/api/agency/connectors/agents',report,auth)).status,200);
    assert.equal((await app.request('/api/agency/connectors/agents',{...report,agents:[]},auth)).status,409);
    assert.equal((await app.request('/api/agency/connectors/agents',{operation_id:'b',agents:[{...report.agents[0],agent_ref:'other'}]}, {authorization:`Bearer ${cb.token}`})).status,200);
    let snap = (await app.request('/api/agency',undefined,{cookie:a})).body;
    assert.equal(snap.agents.length,1); assert.equal(snap.connectors.length,1); assert.equal(JSON.stringify(snap).includes(ca.token),false);
    const agent = snap.agents[0];
    assert.equal((await app.request('/api/agency/agents', {operation_id:'fake',name:'Fake'}, {cookie:a})).status,503);
    const sec = (await app.request('/api/agency/sections',{operation_id:'sec',name:'Mesa'}, {cookie:a})).body;
    assert.deepEqual((await app.request('/api/agency/sections',{operation_id:'sec',name:'Mesa'}, {cookie:a})).body,sec);
    assert.equal((await app.request('/api/agency/sections',{operation_id:'sec',name:'Otra'}, {cookie:a})).status,409);
    const membership = {operation_id:'join',in_office:true,expected_version:agent.version};
    const path = `/api/agency/agents/${agent.id}`;
    assert.equal((await app.request(`${path}/membership`,membership,{cookie:b})).status,403);
    assert.equal((await app.request(`${path}/membership`,membership,{cookie:a})).status,200);
    assert.equal((await app.request(`${path}/membership`,membership,{cookie:a})).status,200);
    assert.equal((await app.request(`${path}/assign`,{operation_id:'stale',job_id:null,section_id:sec.id,expected_version:agent.version},{cookie:a})).status,409);
    assert.equal((await app.request(`${path}/assign`,{operation_id:'job',job_id:'x',section_id:sec.id,expected_version:agent.version+1},{cookie:a})).status,501);
    assert.equal((await app.request(`${path}/assign`,{operation_id:'assign',job_id:null,section_id:sec.id,expected_version:agent.version+1},{cookie:a})).status,200);
    assert.equal((await app.request('/api/agency/connectors/heartbeat',{},auth)).status,200);
    assert.equal((await app.request('/api/agency/connectors/agents',{...report,operation_id:'refresh'},auth)).status,200);
    assert.equal((await app.request('/api/agency',undefined,{cookie:a})).body.agents[0].section_id,sec.id);
    await app.close(); app=await start(dir);
    a=(await app.request('/api/session',{key:'demo-aurora'})).cookie;
    b=(await app.request('/api/session',{key:'demo-marea'})).cookie;
    snap=(await app.request('/api/agency',undefined,{cookie:a})).body;
    assert.equal(snap.agents[0].section_id,sec.id); assert.equal(snap.agents[0].in_office,true); assert.equal(snap.capabilities.assign,true);
    assert.equal((await app.request('/api/agency',undefined,{cookie:b})).body.agents[0].id === agent.id,false);
    assert.equal((await app.request(`${path}/membership`,{operation_id:'leave',in_office:false,expected_version:snap.agents[0].version},{cookie:a})).status,200);
    snap=(await app.request('/api/agency',undefined,{cookie:a})).body; assert.equal(snap.agents[0].section_id,null);
    assert.equal((await app.request(`/api/agency/connectors/${ca.id}/revoke`,{}, {cookie:a})).status,200);
    assert.equal((await app.request(`/api/agency/connectors/${ca.id}/revoke`,{}, {cookie:a})).status,200);
    assert.equal((await app.request('/api/agency/connectors/agents',{...report,operation_id:'later'},auth)).status,401);
    snap=(await app.request('/api/agency',undefined,{cookie:a})).body; assert.equal(snap.agents[0].status,'offline'); assert.equal(snap.capabilities.assign,false);
    await app.close(); app = null;
    const db = new DatabaseSync(join(dir,'agency.sqlite')); db.prepare('UPDATE agency_connectors SET last_seen=? WHERE id=?').run(Date.now()-61000,cb.id); db.close();
    app=await start(dir); b=(await app.request('/api/session',{key:'demo-marea'})).cookie;
    assert.equal((await app.request('/api/agency/connectors/agents',{operation_id:'expired',agents:[]},{authorization:`Bearer ${cb.token}`})).status,401);
    assert.equal((await app.request('/api/agency',undefined,{cookie:b})).body.agents[0].status,'offline');
  } finally { await app?.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('trabajos HTTP durables: idempotencia, leases, aislamiento y resultado', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agency-jobs-')); let app;
  try {
    app = await start(dir);
    let a = (await app.request('/api/session', {key:'demo-aurora'})).cookie;
    let b = (await app.request('/api/session', {key:'demo-marea'})).cookie;
    const ca = (await app.request('/api/agency/connectors', {operation_id:'ca',runtime:'hermes'}, {cookie:a})).body;
    const cb = (await app.request('/api/agency/connectors', {operation_id:'cb',runtime:'claude-code'}, {cookie:b})).body;
    const auth = {authorization:`Bearer ${ca.token}`}, other = {authorization:`Bearer ${cb.token}`};
    const report = {operation_id:'report',agents:[{agent_ref:'fixture',name:'Sintético',status:'available',capabilities:[]}]};
    assert.equal((await app.request('/api/agency/connectors/agents',report,auth)).status,200);
    let agent = (await app.request('/api/agency',undefined,{cookie:a})).body.agents[0];
    const job = {operation_id:'job1',title:'Trabajo',instruction:'Texto privado sintético',agent_id:agent.id};
    assert.equal((await app.request('/api/agency/jobs',job,{cookie:a})).status,409);
    assert.equal((await app.request(`/api/agency/agents/${agent.id}/membership`,{operation_id:'join',in_office:true,expected_version:agent.version},{cookie:a})).status,200);
    assert.equal((await app.request('/api/agency/jobs',job,{cookie:b})).status,403);
    assert.equal((await app.request('/api/agency/jobs',{...job,owner:'otro'},{cookie:a})).status,400);
    const attempts = await Promise.all(Array.from({length:5},()=>app.request('/api/agency/jobs',job,{cookie:a})));
    assert.ok(attempts.every(x=>x.status===201 && x.body.id===attempts[0].body.id));
    const id = attempts[0].body.id;
    assert.equal((await app.request('/api/agency/jobs',{...job,operation_id:'long',instruction:'ñ'.repeat(4096)},{cookie:a})).status,201);
    assert.equal((await app.request('/api/agency/jobs',{...job,operation_id:'too-long',instruction:'a'.repeat(4097)},{cookie:a})).status,400);
    assert.equal((await app.request('/api/agency/jobs',{...job,title:'Distinto'},{cookie:a})).status,409);
    assert.equal((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:b})).status,403);
    const snapshot = (await app.request('/api/agency',undefined,{cookie:a})).body;
    assert.equal(snapshot.jobs.length,2); assert.ok(snapshot.jobs.every(j=>j.status==='queued'));
    assert.equal(JSON.stringify(snapshot.jobs).includes(job.instruction),false);
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'foreign'},other)).body.job,null);
    const claims = await Promise.all(Array.from({length:4},()=>app.request('/api/agency/connectors/jobs/claim',{operation_id:'claim'},auth)));
    assert.ok(claims.every(x=>x.status===200 && x.body.job.id===id && x.body.job.lease===claims[0].body.job.lease));
    const lease = claims[0].body.job.lease;
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'second'},auth)).body.job,null);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${id}/heartbeat`,{lease},other)).status,403);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${id}/heartbeat`,{lease},auth)).status,200);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${id}/result`,{lease,state:'succeeded',summary:'Completado',artifact_id:'fixture'},auth)).status,200);
    const result = (await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a})).body;
    assert.deepEqual(result.result,{summary:'Completado',artifact_id:'fixture'}); assert.equal(result.status,'succeeded');
    assert.equal(JSON.stringify(result).includes(lease),false); assert.equal(JSON.stringify(result).includes(job.instruction),false);
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'claim'},auth)).body.job,null);
    await app.close(); app=await start(dir); a=(await app.request('/api/session',{key:'demo-aurora'})).cookie;
    b=(await app.request('/api/session',{key:'demo-marea'})).cookie;
    assert.deepEqual((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a})).body,result);
    assert.equal((await app.request('/api/agency',undefined,{cookie:b})).body.jobs.length,0);
    assert.equal(JSON.stringify((await app.request('/api/agency',undefined,{cookie:a})).body.jobs).includes(lease),false);
    const replay=(await app.request('/api/agency/jobs',job,{cookie:a}));
    assert.equal(replay.status,201); assert.equal(replay.body.id,id);
    assert.equal((await app.request(`/api/agency/connectors/${ca.id}/revoke`,{}, {cookie:a})).status,200);
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'revoked'},auth)).status,401);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${id}/result`,{lease,state:'failed',summary:'no',artifact_id:'fixture'},auth)).status,401);
  } finally { await app?.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('claim concurrente no duplica, agente ocupado no simula y fallo se persiste', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agency-race-')); let app;
  try {
    app = await start(dir);
    const cookie = (await app.request('/api/session', {key:'demo-aurora'})).cookie;
    const connector = (await app.request('/api/agency/connectors', {operation_id:'c',runtime:'hermes'}, {cookie})).body;
    const auth = {authorization:`Bearer ${connector.token}`};
    const report = {operation_id:'r',agents:[{agent_ref:'a',name:'Agente',status:'available',capabilities:[]}]};
    assert.equal((await app.request('/api/agency/connectors/agents',report,auth)).status,200);
    const agent = (await app.request('/api/agency',undefined,{cookie})).body.agents[0];
    assert.equal((await app.request(`/api/agency/agents/${agent.id}/membership`,{operation_id:'join',in_office:true,expected_version:agent.version},{cookie})).status,200);
    const create = op => app.request('/api/agency/jobs',{operation_id:op,title:op,instruction:'instrucción sintética',agent_id:agent.id},{cookie});
    const first = (await create('first')).body.id;
    const second = (await create('second')).body.id;
    const races = await Promise.all(['race-a','race-b'].map(operation_id => app.request('/api/agency/connectors/jobs/claim',{operation_id},auth)));
    assert.ok(races.every(x => x.status === 200));
    const claimed = races.map(x => x.body.job).filter(Boolean);
    assert.equal(claimed.length,1); assert.equal(claimed[0].id,first);
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'race-c'},auth)).body.job,null);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${first}/result`,{lease:claimed[0].lease,state:'failed',summary:'Fallo sintético',artifact_id:'fixture'},auth)).status,200);
    const next = (await app.request('/api/agency/connectors/jobs/claim',{operation_id:'race-d'},auth)).body.job;
    assert.equal(next.id,second);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${second}/result`,{lease:next.lease,state:'succeeded',summary:'Hecho',artifact_id:'fixture'},auth)).status,200);
    assert.equal((await app.request('/api/agency/connectors/agents',{operation_id:'busy',agents:[{...report.agents[0],status:'busy'}]},auth)).status,200);
    assert.equal((await create('busy-job')).status,409);
    const snapshot = (await app.request('/api/agency',undefined,{cookie})).body;
    assert.deepEqual(snapshot.jobs.map(j => [j.title,j.status]),[['first','failed'],['second','succeeded']]);
    const visible = JSON.stringify(snapshot.jobs);
    assert.equal(visible.includes(claimed[0].lease),false); assert.equal(visible.includes(next.lease),false);
    assert.equal(visible.includes('instrucción sintética'),false);
  } finally { await app?.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('HTTP conserva unknown tras caducidad y deniega conector revocado o caducado', async () => {
  const dir=mkdtempSync(join(tmpdir(),'agency-expire-')); let app;
  try {
    app=await start(dir);
    let cookie=(await app.request('/api/session',{key:'demo-aurora'})).cookie;
    const connector=(await app.request('/api/agency/connectors',{operation_id:'c',runtime:'hermes'},{cookie})).body;
    const auth={authorization:`Bearer ${connector.token}`};
    const agentReport={operation_id:'r',agents:[{agent_ref:'a',name:'Prueba',status:'available',capabilities:[]}]};
    await app.request('/api/agency/connectors/agents',agentReport,auth);
    const agent=(await app.request('/api/agency',undefined,{cookie})).body.agents[0];
    await app.request(`/api/agency/agents/${agent.id}/membership`,{operation_id:'join',in_office:true,expected_version:agent.version},{cookie});
    const create=op=>app.request('/api/agency/jobs',{operation_id:op,title:op,instruction:'instrucción',agent_id:agent.id},{cookie});
    const first=(await create('first')).body.id;
    const running=(await app.request('/api/agency/connectors/jobs/claim',{operation_id:'claim'},auth)).body.job;
    const second=(await create('second')).body.id;
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'empty'},auth)).body.job,null);
    await app.close(); app=null;
    let db=new DatabaseSync(join(dir,'agency.sqlite')); db.prepare('UPDATE work SET lease_until=? WHERE id=?').run(Date.now()-1,first); db.close();
    app=await start(dir); cookie=(await app.request('/api/session',{key:'demo-aurora'})).cookie;
    assert.equal((await app.request(`/api/agency/connectors/jobs/${first}/heartbeat`,{lease:running.lease},auth)).status,409);
    assert.equal((await app.request(`/api/agency/jobs/${first}`,undefined,{cookie})).body.status,'unknown');
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'empty'},auth)).body.job,null);
    const next=(await app.request('/api/agency/connectors/jobs/claim',{operation_id:'next'},auth)).body.job;
    assert.equal(next.id,second);
    assert.equal((await app.request(`/api/agency/connectors/${connector.id}/revoke`,{},{cookie})).status,200);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${second}/result`,{lease:next.lease,state:'succeeded',summary:'x',artifact_id:'a'},auth)).status,401);
    await app.close(); app=null;
    db=new DatabaseSync(join(dir,'agency.sqlite')); db.prepare('UPDATE agency_connectors SET revoked=0,last_seen=? WHERE id=?').run(Date.now()-61000,connector.id); db.close();
    app=await start(dir);
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'expired'},auth)).status,401);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${second}/heartbeat`,{lease:next.lease},auth)).status,401);
  } finally { await app?.close(); rmSync(dir,{recursive:true,force:true}); }
});
