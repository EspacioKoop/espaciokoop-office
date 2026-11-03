import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = resolve('tools/hermes-office-setup.mjs');
function fixture(output) {
  const root = mkdtempSync(join(tmpdir(), 'office-setup-'));
  const workspace = join(root, 'repo'); mkdirSync(workspace); spawnSync('git', ['init', '-q', workspace]);
  const out = join(root, 'private'); mkdirSync(out, { mode:0o700 }); mkdirSync(join(out, 'profile'), { mode:0o700 });
  const executable = join(root, 'fixture;literal');
  writeFileSync(executable, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(output)});`, { mode:0o700 });
  const path = join(out, 'config.json');
  const config = {origin:'http://127.0.0.1:1234',connector_token:'a'.repeat(64),runtime:'hermes',agent_ref:'fixture',name:'Fixture',executable,executable_allowlist:[executable],workspace,profile:{scope:'project',approved:true,name:'fixture',home:join(out,'profile')},output_dir:out,timeout_seconds:2,provider:'openai-codex',model:'fixture-model'};
  writeFileSync(path, JSON.stringify(config), {mode:0o600});
  const run = mode => spawnSync(process.execPath, [cli, '--config', path, mode], {encoding:'utf8', env:{PATH:'/usr/bin:/bin', SECRET:'never-print-this'}});
  return { root, out, path, run };
}
for (const [output, expected, code] of [
  ['{"ready":true,"reason_code":"ready"}', 'ready', 0],
  ['{"ready":false,"reason_code":"auth_unavailable"}', 'auth_unavailable', 2],
  ['secret garbage', 'probe_failed', 2],
  ['{"ready":false,"reason_code":"secret"}', 'probe_failed', 2],
]) test(`diagnóstico saneado: ${expected} ${code}`, () => {
  const f = fixture(output);
  try { const r = f.run('--check'); assert.equal(r.status, code); assert.deepEqual(JSON.parse(r.stdout), {ready:code===0, reason_code:expected}); assert.equal(r.stderr, ''); }
  finally { rmSync(f.root,{recursive:true,force:true}); }
});
test('autenticación sin terminal se rechaza y no inicia el ejecutable', () => {
  const f=fixture('not run');
  try { const r=f.run('--authenticate'); assert.equal(r.status,2); assert.deepEqual(JSON.parse(r.stdout),{ready:false,reason_code:'interactive_terminal_required'}); }
  finally { rmSync(f.root,{recursive:true,force:true}); }
});
test('rechaza permisos y enlaces de configuración o perfil prohibidos', () => {
  const f=fixture('{}');
  try {
    chmodSync(f.path,0o644); assert.equal(f.run('--check').status,1); chmodSync(f.path,0o600);
    mkdirSync(join(f.out,'profile','hermes'),{mode:0o700});
    symlinkSync('nonexistent',join(f.out,'profile','hermes','config.yaml'));
    assert.equal(f.run('--check').status,1);
  } finally { rmSync(f.root,{recursive:true,force:true}); }
});
test('probe recibe HOME aislado, cwd aprobado y entorno mínimo', () => {
  const f=fixture('{}');
  try {
    const c=JSON.parse((readFileSync(f.path, 'utf8')));
    writeFileSync(c.executable, `#!${process.execPath}\nconst ok=process.env.HOME===${JSON.stringify(join(f.out,'profile'))} && process.env.HERMES_HOME===${JSON.stringify(join(f.out,'profile','hermes'))} && process.cwd()===${JSON.stringify(join(f.root,'repo'))} && !process.env.SECRET && process.argv.slice(-1)[0]==='--check-runtime'; process.stdout.write(JSON.stringify({ready:ok,reason_code:ok?'ready':'runtime_unavailable'}));`, {mode:0o700});
    assert.equal(f.run('--check').status,0);
  } finally { rmSync(f.root,{recursive:true,force:true}); }
});

for (const [mode, reason, code] of [['success','ready',0], ['failure','auth_failed',2], ['timeout','auth_timeout',2], ['signal','cancelled',2], ['descendant','auth_descendants',2]]) {
  test(`terminal real sintético: ${mode}`, () => {
    const f = fixture('{}');
    try {
      const c = JSON.parse(readFileSync(f.path,'utf8'));
      c.timeout_seconds = mode === 'timeout' ? 1 : 8;
      writeFileSync(f.path, JSON.stringify(c), {mode:0o600});
      const marker = join(f.out,'probe');
      const children = join(f.out,'children');
      writeFileSync(c.executable, `#!/usr/bin/python3\nimport os,sys,time,signal\nmode=${JSON.stringify(mode)}\nif '--check-runtime' in sys.argv:\n open(${JSON.stringify(marker)},'w').write('probe')\n print('{"ready":true,"reason_code":"ready"}')\n sys.exit(0)\nassert sys.argv[1:]==['-m','hermes_cli.main','auth','add','openai-codex']\nassert os.getcwd()==${JSON.stringify(c.workspace)}\nassert dict(os.environ)=={'HOME':${JSON.stringify(c.profile.home)},'HERMES_HOME':${JSON.stringify(join(c.profile.home,'hermes'))},'LANG':'C.UTF-8','PATH':'/usr/bin:/bin','LC_CTYPE':'C.UTF-8'} or dict(os.environ)=={'HOME':${JSON.stringify(c.profile.home)},'HERMES_HOME':${JSON.stringify(join(c.profile.home,'hermes'))},'LANG':'C.UTF-8','PATH':'/usr/bin:/bin'}\nassert all(os.isatty(i) for i in (0,1,2))\nprint('SYNTHETIC_NATIVE_MARKER',flush=True)\nif mode=='failure': sys.exit(1)\nif mode=='descendant':\n if os.fork()==0:\n  time.sleep(30)\n else: sys.exit(0)\nif mode=='signal':\n child=os.fork()\n if child==0:\n  grandchild=os.fork()\n  if grandchild==0:\n   time.sleep(30)\n  open(${JSON.stringify(children)},'w').write(str(os.getpid())+' '+str(grandchild))\n  time.sleep(30)\n while not os.path.exists(${JSON.stringify(children)}): time.sleep(0.01)\nif mode in ('timeout','signal'):\n print('FIXTURE_WAIT',flush=True)\n time.sleep(30)\n`,{mode:0o700});
      const args = ['test/hermes-office-setup-pty.py',process.execPath,cli,'--config',f.path,'--authenticate'];
      // The helper consumes the last marker before exec; signal mode is conveyed separately below.
      if (mode === 'signal') args.push('--signal-test');
      const r = spawnSync('/usr/bin/python3',args,{encoding:'utf8',timeout:15000,env:{PATH:'/usr/bin:/bin',SECRET:'synthetic-secret'}});
      assert.equal(r.status,code, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`"reason_code":"${reason}"`));
      assert.equal(readFileSafe(marker),mode==='success' ? 'probe' : null);
      assert.doesNotMatch(r.stdout, /synthetic-secret/);
      if (mode === 'signal') {
        for (const pid of readFileSync(children,'utf8').split(' ')) {
          let stat = '';
          try { stat = readFileSync(`/proc/${pid}/stat`,'utf8'); } catch {}
          assert.ok(!stat || /\) Z /.test(stat), `descendiente ${pid} sigue vivo`);
        }
      }
      for (const name of ['config.json','probe','children']) {
        const contents = readFileSafe(join(f.out,name));
        if (contents) assert.doesNotMatch(contents, /SYNTHETIC_NATIVE_MARKER/);
      }
    } finally { rmSync(f.root,{recursive:true,force:true}); }
  });
}
function readFileSafe(path) { try { return readFileSync(path,'utf8'); } catch { return null; } }

test('rechaza perfil que el probe ha vuelto incompatible', () => {
  const f = fixture('{}');
  try {
    const c = JSON.parse(readFileSync(f.path, 'utf8'));
    writeFileSync(c.executable, `#!${process.execPath}\nrequire('node:fs').mkdirSync(${JSON.stringify(join(c.profile.home,'hermes','hooks'))},{recursive:true}); process.stdout.write('{"ready":true,"reason_code":"ready"}');`, {mode:0o700});
    const r = f.run('--check');
    assert.equal(r.status, 1);
    assert.deepEqual(JSON.parse(r.stdout), {ready:false,reason_code:'invalid_config'});
  } finally { rmSync(f.root,{recursive:true,force:true}); }
});
