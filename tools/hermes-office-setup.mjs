#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { lstatSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRuntimeConfig } from '../src/agency-runtime.mjs';
import { execute } from './agency-runtime.mjs';

const result = (ready, reason_code, code) => {
  console.log(JSON.stringify({ ready, reason_code }));
  process.exitCode = code;
};
try {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--config' || !args[1] || !['--check', '--authenticate'].includes(args[2])) throw new Error();
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
  if (args[2] === '--authenticate') {
    result(false, process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY ? 'authentication_not_implemented' : 'interactive_terminal_required', 2);
  } else {
    const controller = new AbortController();
    process.on('SIGINT', () => controller.abort());
    process.on('SIGTERM', () => controller.abort());
    const probe = await execute({ ...config, probe:true, timeout_seconds:Math.min(config.timeout_seconds, 15) }, '', async () => {}, controller.signal);
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
