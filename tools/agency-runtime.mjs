#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { loadRuntimeConfig, runAgency, runtimeArgv } from '../src/agency-runtime.mjs';

function execute(c, instruction, onTick, signal) {
  return new Promise(resolve => {
    if (process.platform === 'win32') { resolve({ code:null, output:'', reason:'platform' }); return; }
    const env = { HOME:c.profile.home, LANG:'C.UTF-8', PATH:'/usr/bin:/bin', ...(c.provider_env ?? {}) };
    let child;
    try { child = spawn(c.executable, runtimeArgv(c), { cwd:c.workspace, env, stdio:['pipe','pipe','pipe'], shell:false, detached:true }); }
    catch { resolve({ code:null, output:'', reason:'spawn' }); return; }
    let output = '', bytes = 0, reason = null, stopping = false, finished = false, exited = false, closed = false, code = null;
    let killTimer, checkTimer, finishTimer;
    const groupExists = () => {
      if (!child.pid) return false;
      try { process.kill(-child.pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
    };
    const send = sig => { if (child.pid) { try { process.kill(-child.pid, sig); } catch (e) { if (e.code !== 'ESRCH') reason = 'cleanup'; } } };
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout); clearInterval(tick); clearTimeout(killTimer); clearInterval(checkTimer); clearTimeout(finishTimer);
      signal?.removeEventListener('abort', abort);
      resolve({ code, output, reason });
    };
    const stop = why => {
      if (stopping || finished) return;
      stopping = true; reason = why; send('SIGTERM');
      killTimer = setTimeout(() => send('SIGKILL'), 2000);
      checkTimer = setInterval(() => { if (exited && closed && !groupExists()) finish(); }, 50);
      finishTimer = setTimeout(() => { reason = 'cleanup'; finish(); }, 5000);
    };
    const abort = () => stop('signal');
    const collect = chunk => { if (bytes >= 65536) return; const part = chunk.subarray(0, 65536-bytes); output += part.toString('utf8'); bytes += part.length; };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.stdin.on('error', () => {}); child.stdin.end(instruction);
    child.on('error', () => { exited = true; stop('spawn'); });
    const timeout = setTimeout(() => stop('timeout'), c.timeout_seconds * 1000);
    const tick = setInterval(async () => { try { await onTick(); } catch { stop('lease'); } }, 10000);
    signal?.addEventListener('abort', abort, { once:true });
    if (signal?.aborted) abort();
    child.once('exit', value => {
      exited = true; code = value;
      if (!stopping && groupExists()) stop('descendants');
    });
    child.once('close', () => { closed = true; if (!stopping && exited) finish(); });
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
  const controller = new AbortController();
  process.on('SIGTERM', () => controller.abort());
  process.on('SIGINT', () => controller.abort());
  const outcome = await runAgency(config, { once, maxSeconds, execute, signal:controller.signal });
  console.log(JSON.stringify(outcome));
  if (['unknown','offline'].includes(outcome.status)) process.exitCode = 2;
} catch (error) {
  // Deliberately avoid printing URLs, paths, tokens, prompts or process output.
  console.error(error.message.startsWith('Hermes no disponible:') ? error.message : 'Conector detenido: configuración, autorización o transporte no válidos.');
  process.exitCode = 1;
}
