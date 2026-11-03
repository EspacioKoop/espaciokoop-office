#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRuntimeConfig } from '../src/agency-runtime.mjs';
import { execute } from './agency-runtime.mjs';

const result = (ready, reason_code, code) => {
  console.log(JSON.stringify({ ready, reason_code }));
  process.exitCode = code;
};
function authenticate(c, signal) {
  return new Promise(resolve => {
    if (process.platform === 'win32') return resolve('auth_unavailable');
    let child, reason = null, exited = false, done = false, termTimer, killTimer, poll, deadline;
    const exists = () => {
      if (!child?.pid) return false;
      try { process.kill(-child.pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
    };
    const send = sig => { if (child?.pid) try { process.kill(-child.pid, sig); } catch (e) { if (e.code !== 'ESRCH') reason = 'cleanup_failed'; } };
    const finish = value => {
      if (done) return;
      done = true; clearTimeout(timer); clearTimeout(termTimer); clearTimeout(killTimer); clearTimeout(deadline); clearInterval(poll);
      signal.removeEventListener('abort', abort); resolve(value);
    };
    const stop = (why, sig = 'SIGTERM') => {
      if (reason || done) return;
      reason = why; send(sig);
      if (sig === 'SIGINT') termTimer = setTimeout(() => send('SIGTERM'), 250);
      killTimer = setTimeout(() => send('SIGKILL'), 2000);
      poll = setInterval(() => { if (exited && !exists()) finish(reason); }, 50);
      deadline = setTimeout(() => finish('cleanup_failed'), 5000);
    };
    const abort = () => stop('cancelled', signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
    try {
      child = spawn(c.executable, ['-m','hermes_cli.main','auth','add','openai-codex'], {
        cwd:c.workspace, env:{ HOME:c.profile.home, HERMES_HOME:join(c.profile.home,'hermes'), LANG:'C.UTF-8', PATH:'/usr/bin:/bin' },
        stdio:'inherit', shell:false, detached:true
      });
    } catch { return resolve('auth_spawn_failed'); }
    const timer = setTimeout(() => stop('auth_timeout'), Math.min(c.timeout_seconds,1800)*1000);
    signal.addEventListener('abort', abort, {once:true});
    if (signal.aborted) abort();
    child.once('error', () => { exited = true; stop('auth_spawn_failed'); });
    child.once('exit', code => {
      exited = true;
      if (reason) return;
      if (exists()) return stop('auth_descendants');
      finish(code === 0 ? null : 'auth_failed');
    });
  });
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--config' || !args[1] || !['--check', '--authenticate'].includes(args[2])) throw new Error();
  const validate = () => {
  const config = loadRuntimeConfig(args[1], workspace => {
    const git = spawnSync('git', ['-C', workspace, 'rev-parse', '--show-toplevel'], { encoding:'utf8', timeout:3000, env:{ PATH:'/usr/bin:/bin' } });
    return git.status === 0 && git.stdout.trim() === workspace;
  });
  if (config.runtime !== 'hermes') throw new Error();
  // existsSync in the runtime does not detect dangling symlinks.
  for (const name of ['config.yaml', '.env', 'hooks', 'plugins', 'mcp.json']) {
    try { lstatSync(join(config.profile.home, 'hermes', name)); throw new Error('forbidden'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const executable = statSync(config.executable);
  if (!executable.isFile() || !(executable.mode & 0o111)) throw new Error();
  return config;
  };
  let config = validate();
  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort('SIGINT'));
  process.on('SIGTERM', () => controller.abort('SIGTERM'));
  let authReason = null;
  if (args[2] === '--authenticate') {
    if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stderr.isTTY) authReason = 'interactive_terminal_required';
    else {
      console.error('Autenticación local de openai-codex en el perfil aislado del proyecto: requiere el consentimiento de su titular. No crea servicios ni conecta agentes.');
      authReason = await authenticate(config, controller.signal);
      if (!authReason && !controller.signal.aborted) config = validate();
      else if (!authReason) authReason = 'cancelled';
    }
  }
  if (authReason) result(false, authReason, 2);
  else {
    const probe = await execute({ ...config, probe:true, timeout_seconds:Math.min(config.timeout_seconds, 15) }, '', async () => {}, controller.signal);
    // The installed probe may create profile entries; enforce the same boundary afterwards.
    validate();
    let diagnostic;
    try { diagnostic = JSON.parse(probe.output); } catch { diagnostic = {}; }
    const ready = probe.code === 0 && !probe.reason && diagnostic.ready === true && diagnostic.reason_code === 'ready';
    const reasons = ['auth_unavailable', 'runtime_unavailable', 'provider_unavailable'];
    const reason = ready ? 'ready' : (!probe.reason && reasons.includes(diagnostic.reason_code) ? diagnostic.reason_code : 'probe_failed');
    result(ready, reason, ready ? 0 : 2);
  }
} catch {
  result(false, 'invalid_config', 1);
}
