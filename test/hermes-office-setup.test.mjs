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
