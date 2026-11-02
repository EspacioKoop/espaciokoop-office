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
    assert.deepEqual((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a})).body,result);
    assert.equal((await app.request(`/api/agency/connectors/${ca.id}/revoke`,{}, {cookie:a})).status,200);
    assert.equal((await app.request('/api/agency/connectors/jobs/claim',{operation_id:'revoked'},auth)).status,401);
    assert.equal((await app.request(`/api/agency/connectors/jobs/${id}/result`,{lease,state:'failed',summary:'no',artifact_id:'fixture'},auth)).status,401);
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
