#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { loadRuntimeConfig, runAgency, runtimeArgv } from '../src/agency-runtime.mjs';

function execute(c, instruction, onTick) {
  return new Promise(resolve => {
    const env = { HOME:c.profile.home, LANG:'C.UTF-8', PATH:'/usr/bin:/bin', ...(c.runtime === 'hermes' ? { HERMES_HOME:c.profile.home } : {}), ...(c.provider_env ?? {}) };
    let child;
    try { child = spawn(c.executable, runtimeArgv(c), { cwd:c.workspace, env, stdio:['pipe','pipe','pipe'], shell:false }); }
    catch { resolve({ code:null, output:'', reason:'spawn' }); return; }
    let output = ''; let bytes = 0; let reason = null; let stopping = false;
    const stop = why => { if (!stopping) { stopping = true; reason = why; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 2000).unref(); } };
    const collect = chunk => { if (bytes >= 65536) return; const part = chunk.subarray(0, 65536-bytes); output += part.toString('utf8'); bytes += part.length; };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.stdin.on('error', () => {}); child.stdin.end(instruction);
    child.on('error', () => stop('spawn'));
    const timeout = setTimeout(() => stop('timeout'), c.timeout_seconds * 1000);
    const tick = setInterval(async () => { try { await onTick(); } catch { stop('lease'); } }, 10000);
    child.once('close', code => { clearTimeout(timeout); clearInterval(tick); resolve({ code, output, reason }); });
  });
}

try {
  const args = process.argv.slice(2);
  const configAt = args.indexOf('--config');
  const once = args.includes('--once'), serve = args.includes('--serve');
  const maxAt = args.indexOf('--max-seconds');
  if (configAt < 0 || !args[configAt+1] || once === serve || (maxAt >= 0 && !serve) || args.some((a,i) => !['--config','--once','--serve','--max-seconds'].includes(a) && i !== configAt+1 && i !== maxAt+1)) throw new Error('Uso: --config /ruta/privada.json (--once | --serve [--max-seconds 1..1800])');
  const maxSeconds = maxAt < 0 ? 1800 : Number(args[maxAt+1]);
  if (!Number.isSafeInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 1800) throw new Error('max-seconds fuera de rango.');
  const config = loadRuntimeConfig(args[configAt+1], workspace => {
    const git = spawnSync('git', ['-C',workspace,'rev-parse','--show-toplevel'], { encoding:'utf8', timeout:3000, env:{PATH:'/usr/bin:/bin'} });
    return git.status === 0 && git.stdout.trim() === workspace;
  });
  const outcome = await runAgency(config, { once, maxSeconds, execute });
  console.log(JSON.stringify(outcome));
  if (['unknown','offline'].includes(outcome.status)) process.exitCode = 2;
} catch (error) {
  // Deliberately avoid printing URLs, paths, tokens, prompts or process output.
  console.error('Conector detenido: configuración, autorización o transporte no válidos.');
  process.exitCode = 1;
}
