import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createOffice } from '../src/server.mjs';
import { loadRuntimeConfig, runtimeArgv, runAgency } from '../src/agency-runtime.mjs';

const node = process.execPath;
const runner = resolve('tools/agency-runtime.mjs');
async function start(dir) {
  const app = createOffice({ mode:'demo', config:{ OFFICE_AGENCY_DIR:dir } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (path, data, headers = {}) => {
    const response = await fetch(origin + path, { method:data === undefined ? 'GET' : 'POST', headers:{ ...(data === undefined ? {} : { Origin:origin, 'Content-Type':'application/json' }), ...headers }, ...(data === undefined ? {} : { body:JSON.stringify(data) }) });
    return { status:response.status, body:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
  };
  return { app, origin, request, close:() => app.close() };
}
const fixture = `#!${node}
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const cwd=process.cwd(); const path=join(cwd,'count');
writeFileSync(join(cwd,'child-pid'),String(process.pid));
const n=existsSync(path)?Number(readFileSync(path,'utf8')):0;
writeFileSync(path,String(n+1));
let input=''; for await (const chunk of process.stdin) input+=chunk;
if(input.includes('TREE')) {
 const grand=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],{stdio:'ignore'});
 writeFileSync(join(cwd,'grand-pid'),String(grand.pid));
 process.on('SIGTERM',()=>{ grand.once('exit',()=>process.exit(0)); });
}
if(input.includes('SLOW')) await new Promise(r=>setTimeout(r,20000));
if(input.includes('ERROR')) process.exit(7);
process.stdout.write('fixture-process:'+input);
`;
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'ar-')); chmodSync(root,0o700);
  const dbdir=join(root,'db'), out=join(root,'out'), repo=join(root,'repo');
  for (const p of [dbdir,out,repo]) mkdirSync(p, { mode:0o700 });
  mkdirSync(join(out,'profile'),{mode:0o700}); writeFileSync(join(out,'profile','config.yaml'),'# fixture sin credenciales\n',{mode:0o600});
  mkdirSync(join(repo,'.git'));
  assert.equal(spawnSync('git',['-C',repo,'init','-q'],{encoding:'utf8'}).status,0);
  const executable=join(root,'fixture'); writeFileSync(executable,fixture,{mode:0o700});
  const configPath=join(root,'config.json');
  const makeConfig = (origin, token, extra={}) => {
    const config={origin,connector_token:token,runtime:'claude-code',agent_ref:'fixture',name:'Fixture',executable,executable_allowlist:[executable],workspace:repo,profile:{scope:'project',approved:true,name:'office-fixture',home:join(out,'profile')},provider:'anthropic',model:'fixture-model',output_dir:out,timeout_seconds:3,...extra};
    writeFileSync(configPath,JSON.stringify(config),{mode:0o600}); chmodSync(configPath,0o600);
    return config;
  };
  return {root,dbdir,out,repo,executable,configPath,makeConfig,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
async function owner(app, key, op='c') {
  const cookie=(await app.request('/api/session',{key})).cookie;
  const connector=(await app.request('/api/agency/connectors',{operation_id:op,runtime:'claude-code'},{cookie})).body;
  return {cookie,connector};
}
async function enlist(app,cookie,token) {
  const auth={Authorization:`Bearer ${token}`};
  assert.equal((await app.request('/api/agency/connectors/heartbeat',{},auth)).status,200);
  assert.equal((await app.request('/api/agency/connectors/agents',{operation_id:'r',agents:[{agent_ref:'fixture',name:'Fixture',status:'available',capabilities:[]}]},auth)).status,200);
  const agent=(await app.request('/api/agency',undefined,{cookie})).body.agents[0];
  assert.equal((await app.request(`/api/agency/agents/${agent.id}/membership`,{operation_id:'join',in_office:true,expected_version:agent.version},{cookie})).status,200);
  return agent.id;
}
function execRunner(path, args=['--once']) {
  const child=spawn(node,[runner,'--config',path,...args],{env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR},stdio:['ignore','pipe','pipe']});
  let stdout='', stderr=''; child.stdout.on('data',x=>stdout+=x); child.stderr.on('data',x=>stderr+=x);
  const done=new Promise(resolve=>child.once('exit',code=>resolve({code,stdout,stderr})));
  return {child,done};
}
const absent = pid => { try { process.kill(pid,0); return false; } catch(e) { return e.code === 'ESRCH'; } };
const waitFor=async predicate=>{ for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw new Error('fixture no arrancó'); };

test('HTTP → SQLite → proceso fixture → resultado; reinicio y propietarios aislados', async () => {
  const f=setup(); let app;
  try {
    app=await start(f.dbdir);
    const a=await owner(app,'demo-aurora','ca'), b=await owner(app,'demo-marea','cb');
    const agent=await enlist(app,a.cookie,a.connector.token);
    const instruction='Texto literal $(touch INTRUSO) `touch INTRUSO2`';
    const created=await app.request('/api/agency/jobs',{operation_id:'j',title:'Trabajo',instruction,agent_id:agent},{cookie:a.cookie});
    assert.equal(created.status,201);
    f.makeConfig(app.origin,a.connector.token);
    const run=await execRunner(f.configPath).done;
    assert.equal(run.code,0,run.stderr);
    assert.equal(JSON.parse(run.stdout).status,'reported');
    assert.equal(readFileSync(join(f.repo,'count'),'utf8'),'1');
    assert.equal(existsSync(join(f.repo,'INTRUSO')),false);
    assert.equal(existsSync(join(f.repo,'INTRUSO2')),false);
    const result=(await app.request(`/api/agency/jobs/${created.body.id}`,undefined,{cookie:a.cookie})).body;
    assert.equal(result.status,'succeeded');
    assert.equal((await app.request(`/api/agency/jobs/${created.body.id}`,undefined,{cookie:b.cookie})).status,403);
    const journal=JSON.parse(readFileSync(join(f.out,'journal.json'),'utf8'));
    assert.equal(journal[created.body.id].phase,'reported');
    assert.equal(readFileSync(join(f.out,`${result.result.artifact_id}.txt`),'utf8'),`fixture-process:${instruction}`);
    await app.close(); app=await start(f.dbdir);
    const aa=(await app.request('/api/session',{key:'demo-aurora'})).cookie;
    assert.equal((await app.request(`/api/agency/jobs/${created.body.id}`,undefined,{cookie:aa})).body.status,'succeeded');
    f.makeConfig(app.origin,a.connector.token);
    assert.equal((await execRunner(f.configPath).done).code,0);
    assert.equal(readFileSync(join(f.repo,'count'),'utf8'),'1');
  } finally { await app?.close(); f.cleanup(); }
});

test('config privado, enlace y allowlist; argv literal sin shell', () => {
  const f=setup();
  try {
    const c=f.makeConfig('http://127.0.0.1:1234','a'.repeat(64));
    assert.deepEqual(runtimeArgv(loadRuntimeConfig(f.configPath)),['--bare','--strict-mcp-config','--no-session-persistence','--model','fixture-model','-p']);
    f.makeConfig(c.origin,c.connector_token,{runtime:'hermes',provider:'openai-codex'});
    assert.deepEqual(runtimeArgv(loadRuntimeConfig(f.configPath)),[resolve('tools/hermes-office-local.py'),'--model','fixture-model']);
    f.makeConfig(c.origin,c.connector_token,{runtime:'hermes',provider:'anthropic'}); assert.throws(()=>loadRuntimeConfig(f.configPath));
    f.makeConfig(c.origin,c.connector_token);
    chmodSync(f.configPath,0o644); assert.throws(()=>loadRuntimeConfig(f.configPath));
    chmodSync(f.configPath,0o600);
    const link=join(f.root,'link.json'); symlinkSync(f.configPath,link); assert.throws(()=>loadRuntimeConfig(link));
    f.makeConfig(c.origin,c.connector_token,{executable_allowlist:[]}); assert.throws(()=>loadRuntimeConfig(f.configPath));
    f.makeConfig(c.origin,c.connector_token,{profile:{scope:'project',approved:true,name:'zeratul'}}); assert.throws(()=>loadRuntimeConfig(f.configPath));
  } finally { f.cleanup(); }
});

test('fallo real, timeout, revocación y caída no duplican ejecución', async () => {
  const f=setup(); let app;
  try {
    app=await start(f.dbdir); const a=await owner(app,'demo-aurora'); const agent=await enlist(app,a.cookie,a.connector.token);
    f.makeConfig(app.origin,a.connector.token,{timeout_seconds:1});
    const create=async (op,instruction)=>(await app.request('/api/agency/jobs',{operation_id:op,title:op,instruction,agent_id:agent},{cookie:a.cookie})).body.id;
    const error=await create('error','ERROR');
    assert.equal((await execRunner(f.configPath).done).code,0);
    assert.equal((await app.request(`/api/agency/jobs/${error}`,undefined,{cookie:a.cookie})).body.status,'failed');
    const timeout=await create('timeout','SLOW');
    assert.equal((await execRunner(f.configPath).done).code,0);
    assert.equal((await app.request(`/api/agency/jobs/${timeout}`,undefined,{cookie:a.cookie})).body.status,'failed');
    const crash=await create('crash','SLOW');
    const running=execRunner(f.configPath); await waitFor(()=>readFileSync(join(f.repo,'count'),'utf8')==='3');
    running.child.kill('SIGKILL'); await running.done;
    process.kill(Number(readFileSync(join(f.repo,'child-pid'),'utf8')),'SIGTERM');
    assert.equal((await execRunner(f.configPath).done).code,2);
    assert.equal(readFileSync(join(f.repo,'count'),'utf8'),'3');
    assert.equal((await app.request(`/api/agency/connectors/${a.connector.id}/revoke`,{},{cookie:a.cookie})).status,200);
    assert.notEqual((await execRunner(f.configPath).done).code,0);
    const row=new DatabaseSync(join(f.dbdir,'agency.sqlite'));
    assert.equal(row.prepare('SELECT state FROM work WHERE id=?').get(crash).state,'running'); row.close();
  } finally { await app?.close(); f.cleanup(); }
});

test('lease caducado detiene el hijo y conserva unknown sin remitir éxito', async () => {
  const f=setup(); let app;
  try {
    app=await start(f.dbdir); const a=await owner(app,'demo-aurora'); const agent=await enlist(app,a.cookie,a.connector.token);
    f.makeConfig(app.origin,a.connector.token,{timeout_seconds:30});
    const id=(await app.request('/api/agency/jobs',{operation_id:'lease-job',title:'Lease',instruction:'SLOW',agent_id:agent},{cookie:a.cookie})).body.id;
    const running=execRunner(f.configPath); await waitFor(()=>existsSync(join(f.repo,'count')) && readFileSync(join(f.repo,'count'),'utf8')==='1');
    const db=new DatabaseSync(join(f.dbdir,'agency.sqlite'));
    db.prepare('UPDATE work SET lease_until=? WHERE id=?').run(Date.now()-1,id); db.close();
    const done=await running.done;
    assert.equal(done.code,2);
    assert.equal(JSON.parse(done.stdout).status,'unknown');
    assert.equal((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a.cookie})).body.status,'unknown');
    assert.equal(readFileSync(join(f.repo,'count'),'utf8'),'1');
  } finally { await app?.close(); f.cleanup(); }
});

test('revocación durante ejecución detiene el hijo y rechaza resultado', async () => {
  const f=setup(); let app;
  try {
    app=await start(f.dbdir); const a=await owner(app,'demo-aurora'); const agent=await enlist(app,a.cookie,a.connector.token);
    f.makeConfig(app.origin,a.connector.token,{timeout_seconds:30});
    const id=(await app.request('/api/agency/jobs',{operation_id:'revoked-job',title:'Revocar',instruction:'SLOW',agent_id:agent},{cookie:a.cookie})).body.id;
    const running=execRunner(f.configPath); await waitFor(()=>existsSync(join(f.repo,'count')) && readFileSync(join(f.repo,'count'),'utf8')==='1');
    assert.equal((await app.request(`/api/agency/connectors/${a.connector.id}/revoke`,{},{cookie:a.cookie})).status,200);
    const done=await running.done;
    assert.equal(done.code,2);
    assert.equal(JSON.parse(done.stdout).status,'unknown');
    assert.notEqual((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a.cookie})).body.status,'succeeded');
    assert.equal(readFileSync(join(f.repo,'count'),'utf8'),'1');
  } finally { await app?.close(); f.cleanup(); }
});

test('--serve atiende más de un trabajo y respeta el plazo', async () => {
  const f=setup(); let app;
  try {
    app=await start(f.dbdir); const a=await owner(app,'demo-aurora'); const agent=await enlist(app,a.cookie,a.connector.token);
    f.makeConfig(app.origin,a.connector.token);
    const ids=[];
    for (const op of ['uno','dos']) ids.push((await app.request('/api/agency/jobs',{operation_id:op,title:op,instruction:op,agent_id:agent},{cookie:a.cookie})).body.id);
    const started=Date.now();
    const done=await execRunner(f.configPath,['--serve','--max-seconds','3']).done;
    assert.equal(done.code,0,done.stderr);
    assert.ok(Date.now()-started < 5000);
    assert.equal(readFileSync(join(f.repo,'count'),'utf8'),'2');
    for (const id of ids) assert.equal((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a.cookie})).body.status,'succeeded');
  } finally { await app?.close(); f.cleanup(); }
});


test('grupo propio: timeout, revocación y SIGTERM eliminan hijo y nieto', async () => {
  for (const mode of ['timeout','revoke','signal']) {
    const f=setup(); let app;
    try {
      app=await start(f.dbdir); const a=await owner(app,'demo-aurora'); const agent=await enlist(app,a.cookie,a.connector.token);
      f.makeConfig(app.origin,a.connector.token,{timeout_seconds:mode === 'timeout' ? 3 : 30});
      const id=(await app.request('/api/agency/jobs',{operation_id:mode,title:mode,instruction:'TREE SLOW',agent_id:agent},{cookie:a.cookie})).body.id;
      const running=execRunner(f.configPath);
      await waitFor(()=>existsSync(join(f.repo,'grand-pid')));
      const pids=['child-pid','grand-pid'].map(x=>Number(readFileSync(join(f.repo,x),'utf8')));
      if (mode === 'revoke') assert.equal((await app.request(`/api/agency/connectors/${a.connector.id}/revoke`,{},{cookie:a.cookie})).status,200);
      if (mode === 'signal') running.child.kill('SIGTERM');
      const done=await running.done;
      await waitFor(()=>pids.every(absent));
      assert.notEqual((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a.cookie})).body.status,'succeeded',done.stderr);
    } finally { await app?.close(); f.cleanup(); }
  }
});

test('HTTP → SQLite → proceso Hermes fixture → resultado, sin inferencia', async () => {
  const f=setup(); let app;
  try {
    app=await start(f.dbdir); const a=await owner(app,'demo-aurora'); const agent=await enlist(app,a.cookie,a.connector.token);
    const id=(await app.request('/api/agency/jobs',{operation_id:'hermes-block',title:'Bloqueado',instruction:'prueba',agent_id:agent},{cookie:a.cookie})).body.id;
    f.makeConfig(app.origin,a.connector.token,{runtime:'hermes',provider:'openai-codex'});
    const done=await execRunner(f.configPath).done;
    assert.equal(done.code,0,done.stderr);
    assert.equal(readFileSync(join(f.repo,'count'),'utf8'),'1');
    const db=new DatabaseSync(join(f.dbdir,'agency.sqlite'));
    assert.equal(db.prepare('SELECT state FROM work WHERE id=?').get(id).state,'succeeded'); db.close();
    const result=(await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a.cookie})).body;
    assert.equal(readFileSync(join(f.out,`${result.result.artifact_id}.txt`),'utf8'),'fixture-process:prueba');
  } finally { await app?.close(); f.cleanup(); }
});

test('wrapper llama a la API local con proveedor explícito y sin gateway', () => {
  const f=setup();
  try {
    const harness = `import sys,types,runpy,socket\nsocket.socket.connect=lambda *a: (_ for _ in ()).throw(AssertionError('red prohibida'))\np=types.ModuleType('hermes_cli'); p.__path__=[]; sys.modules['hermes_cli']=p\nr=types.ModuleType('hermes_cli.runtime_provider')\ndef resolve_runtime_provider(**k):\n assert k=={'requested':'openai-codex','target_model':'fixture-model'}\n return {'provider':'openai-codex','api_mode':'codex_responses','api_key':'fixture','base_url':'https://invalid'}\nr.resolve_runtime_provider=resolve_runtime_provider; sys.modules[r.__name__]=r\nm=types.ModuleType('run_agent')\nclass Agent:\n def __init__(self,**k):\n  assert k['enabled_toolsets']==[] and k['skip_memory'] and k['skip_context_files'] and k['fallback_model'] is None\n  self.provider=k['provider']; self.api_mode=k['api_mode']; self._fallback_chain=[]\n def run_conversation(self, text):\n  assert text=='entrada literal'\n  return {'completed':True,'provider':'openai-codex','model':'fixture-model','final_response':'respuesta fixture'}\nm.AIAgent=Agent; sys.modules['run_agent']=m\nsys.argv=['wrapper','--model','fixture-model']\nrunpy.run_path(${JSON.stringify(resolve('tools/hermes-office-local.py'))},run_name='__main__')`;
    const home=join(f.out,'profile');
    const result=spawnSync('/usr/bin/python3',['-c',harness],{input:'entrada literal',encoding:'utf8',env:{HOME:home,HERMES_HOME:join(home,'hermes'),PATH:'/usr/bin:/bin'}});
    assert.equal(result.status,0,result.stderr); assert.equal(result.stdout,'respuesta fixture');
  } finally { f.cleanup(); }
});


test('limpieza incierta conserva journal unknown e impide nuevas reclamaciones', async () => {
  const f=setup(); let app;
  try {
    app=await start(f.dbdir); const a=await owner(app,'demo-aurora'); const agent=await enlist(app,a.cookie,a.connector.token);
    const id=(await app.request('/api/agency/jobs',{operation_id:'uncertain',title:'Incierto',instruction:'fixture',agent_id:agent},{cookie:a.cookie})).body.id;
    const c=f.makeConfig(app.origin,a.connector.token);
    let calls=0; const execute=async()=>{ calls++; return {code:0,output:'',reason:'cleanup'}; };
    assert.equal((await runAgency(c,{execute})).status,'unknown');
    assert.equal(JSON.parse(readFileSync(join(f.out,'journal.json'),'utf8'))[id].phase,'unknown');
    assert.equal((await runAgency(c,{execute})).status,'unknown');
    assert.equal(calls,1);
    assert.notEqual((await app.request(`/api/agency/jobs/${id}`,undefined,{cookie:a.cookie})).body.status,'succeeded');
  } finally { await app?.close(); f.cleanup(); }
});
