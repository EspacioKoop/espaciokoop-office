// Outbound, opt-in executor. Office owns the queue; this process owns only its child.
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const id = x => typeof x === 'string' && /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(x);
const fail = message => { throw new Error(message); };
const privateDirectory = path => {
  const st = lstatSync(path);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) !== 0) fail('Directorio privado no válido.');
};
const privateFile = path => {
  const st = lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600) fail('Fichero privado no válido.');
};
const absolute = x => typeof x === 'string' && isAbsolute(x) && resolve(x) === x;
function noLinks(path) {
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) fail('Enlace no autorizado.');
  }
}

export function loadRuntimeConfig(path, verifyWorkspace = () => true) {
  if (!absolute(path)) fail('Config requiere ruta absoluta.');
  noLinks(path);
  privateDirectory(dirname(path)); privateFile(path);
  const raw = readFileSync(path);
  if (raw.length > 16384) fail('Config demasiado grande.');
  let c;
  try { c = JSON.parse(raw); } catch { fail('Config JSON no válido.'); }
  if (!c || typeof c !== 'object' || Array.isArray(c)) fail('Config no válido.');
  const allowed = ['origin','connector_token','runtime','agent_ref','name','executable','executable_allowlist','workspace','profile','output_dir','timeout_seconds','provider','model','provider_env'];
  if (Object.keys(c).some(k => !allowed.includes(k))) fail('Campo de config no admitido.');
  let url;
  try { url = new URL(c.origin); } catch { fail('Origen no válido.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const loopback = host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'));
  const lan = isIP(host) === 4 && (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
  if (!['http:','https:'].includes(url.protocol) || c.origin !== url.origin || url.username || url.password || !(loopback || lan) || (lan && url.protocol !== 'https:')) fail('Origen no autorizado.');
  if (!/^[a-f0-9]{64}$/.test(c.connector_token ?? '') || !['hermes','claude-code'].includes(c.runtime) || !id(c.agent_ref) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 100 || /[\x00-\x1f\x7f]/.test(c.name)) fail('Identidad no válida.');
  if (!['openai-codex','anthropic'].includes(c.provider) || (c.runtime === 'claude-code' && c.provider !== 'anthropic') || typeof c.model !== 'string' || !/^[a-z0-9][a-z0-9._:/-]{0,100}$/i.test(c.model)) fail('Proveedor o modelo no aprobados.');
  if (!absolute(c.executable) || !Array.isArray(c.executable_allowlist) || !c.executable_allowlist.includes(c.executable) || c.executable_allowlist.some(x => !absolute(x))) fail('Ejecutable fuera de la lista aprobada.');
  try { noLinks(c.executable); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!absolute(c.workspace) || !absolute(c.output_dir) || c.output_dir === c.workspace || c.output_dir.startsWith(c.workspace + '/')) fail('Rutas no válidas.');
  if (path === c.workspace || path.startsWith(c.workspace + '/')) fail('Config dentro del repositorio.');
  noLinks(c.workspace); noLinks(c.output_dir);
  const work = lstatSync(c.workspace);
  if (!work.isDirectory() || work.isSymbolicLink() || work.uid !== process.getuid() || !existsSync(join(c.workspace, '.git'))) fail('Repositorio no autorizado.');
  if (!verifyWorkspace(c.workspace)) fail('Repositorio no autorizado.');
  privateDirectory(c.output_dir);
  if (!c.profile || c.profile.scope !== 'project' || c.profile.approved !== true || !id(c.profile.name) || c.profile.name === 'zeratul' || c.profile.name === 'default' || c.profile.home !== join(c.output_dir, 'profile')) fail('Se requiere perfil de proyecto aprobado.');
  noLinks(c.profile.home);
  privateDirectory(c.profile.home);
  if (c.runtime === 'hermes') fail('Hermes no disponible: su CLI puede delegar en una pasarela fuera del grupo y la cancelación no está garantizada.');
  if (!Number.isSafeInteger(c.timeout_seconds) || c.timeout_seconds < 1 || c.timeout_seconds > 1800) fail('Timeout no válido.');
  if (c.provider_env !== undefined && (!c.provider_env || typeof c.provider_env !== 'object' || Array.isArray(c.provider_env) || Object.entries(c.provider_env).some(([k,v]) => !['ANTHROPIC_API_KEY','OPENAI_API_KEY'].includes(k) || (k === 'ANTHROPIC_API_KEY' && c.provider !== 'anthropic') || (k === 'OPENAI_API_KEY' && c.provider !== 'openai-codex') || typeof v !== 'string' || !v))) fail('Entorno de proveedor no válido.');
  return c;
}

export function runtimeArgv(c) {
  if (c.runtime === 'hermes') fail('Hermes no disponible: cancelación de pasarela no garantizada.');
  return ['--bare', '--strict-mcp-config', '--no-session-persistence', '--model', c.model, '-p'];
}

function durableJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const dir = openSync(dirname(path), 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
}

function openJournal(c) {
  const path = join(c.output_dir, 'journal.json');
  let entries = {};
  if (existsSync(path)) { privateFile(path); entries = JSON.parse(readFileSync(path, 'utf8')); }
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) fail('Journal no válido.');
  return { entries, save() { durableJson(path, entries); } };
}

function lockRunner(c) {
  const path = join(c.output_dir, 'runner.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const fd = openSync(path, 'wx', 0o600); writeSync(fd, String(process.pid)); fsyncSync(fd); closeSync(fd); return () => unlinkSync(path); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      privateFile(path);
      const pid = Number(readFileSync(path, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid < 1) fail('Bloqueo no válido.');
      try { process.kill(pid, 0); fail('Ya hay un ejecutor activo.'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      unlinkSync(path);
    }
  }
  fail('No se pudo obtener bloqueo.');
}

async function post(c, path, data, retry = false) {
  const request = async () => {
    const response = await fetch(c.origin + path, { method: 'POST', headers: { Origin: c.origin, Authorization: `Bearer ${c.connector_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
    const body = await response.json();
    if (!response.ok) { const e = new Error(`HTTP ${response.status}`); e.status = response.status; throw e; }
    return body;
  };
  try { return await request(); } catch (e) { if (!retry || e.status) throw e; return request(); }
}

const report = (c, status) => post(c, '/api/agency/connectors/agents', { operation_id: randomUUID(), agents: [{ agent_ref:c.agent_ref, name:c.name, status, capabilities:[] }] });
const heartbeat = c => post(c, '/api/agency/connectors/heartbeat', {});
const leaseHeartbeat = (c, j) => post(c, `/api/agency/connectors/jobs/${j.id}/heartbeat`, { lease:j.lease });
const result = (c, j) => post(c, `/api/agency/connectors/jobs/${j.id}/result`, { lease:j.lease, state:j.result.state, summary:j.result.summary, artifact_id:j.result.artifact_id });

function available(c) {
  try {
    const st = lstatSync(c.executable);
    return st.isFile() && !st.isSymbolicLink() && (st.mode & 0o111) !== 0;
  } catch { return false; }
}

export async function runAgency(c, { once = true, maxSeconds = 1800, execute, signal } = {}) {
  if (c.runtime === 'hermes') fail('Hermes no disponible: cancelación de pasarela no garantizada.');
  if (typeof execute !== 'function') fail('Ejecutor local no configurado.');
  const unlock = lockRunner(c);
  const journal = openJournal(c);
  const end = Date.now() + Math.min(1800, maxSeconds) * 1000;
  const pause = () => new Promise(r => setTimeout(r, Math.max(0, Math.min(10000, end-Date.now()))));
  try {
    for (const j of Object.values(journal.entries)) if (['claimed','spawned'].includes(j.phase)) j.phase = 'unknown';
    journal.save();
    for (const j of Object.values(journal.entries)) if (j.phase === 'result_pending') {
      try { await heartbeat(c); await result(c, j); j.phase = 'reported'; }
      catch { j.phase = 'unknown'; }
      journal.save();
    }
    if (Object.values(journal.entries).some(j => j.phase === 'unknown')) return { status:'unknown' };
    do {
      if (signal?.aborted) return { status:'stopped' };
      const ready = available(c);
      try { await heartbeat(c); await report(c, ready ? 'available' : 'offline'); }
      catch (e) { if (once) throw e; await pause(); continue; }
      if (!ready) { if (once) return { status:'offline' }; await pause(); continue; }
      if (signal?.aborted) return { status:'stopped' };
      const operation_id = randomUUID();
      const claimed = await post(c, '/api/agency/connectors/jobs/claim', { operation_id }, true);
      const job = claimed.job;
      if (job) {
        if (journal.entries[job.id]) { journal.entries[job.id].phase = 'unknown'; journal.save(); return { status:'unknown', job_id:job.id }; }
        const j = journal.entries[job.id] = { id:job.id, lease:job.lease, lease_until:job.lease_until, phase:'claimed', started_at:Date.now() };
        journal.save(); // A lost acknowledgement can never cause another execution.
        let execution;
        try {
          await leaseHeartbeat(c, j);
          j.phase = 'spawned'; journal.save();
          await report(c, 'busy');
          const remaining = Math.max(1, Math.ceil((end-Date.now())/1000));
          execution = signal?.aborted ? { code:null, output:'', reason:'signal' } : await execute({ ...c, timeout_seconds:Math.min(c.timeout_seconds, remaining) }, job.instruction, async () => { await heartbeat(c); await leaseHeartbeat(c, j); await report(c, 'busy'); }, signal);
        } catch { execution = { code:null, output:'', reason:'lease' }; }
        const artifact_id = randomUUID();
        const artifact = join(c.output_dir, `${artifact_id}.txt`);
        writeFileSync(artifact, execution.output, { mode:0o600, flag:'wx' });
        const fd = openSync(artifact, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
        const dir = openSync(c.output_dir, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
        j.result = { artifact_id, state:execution.code === 0 && !execution.reason ? 'succeeded' : 'failed', summary:execution.reason === 'timeout' ? 'Tiempo de ejecución agotado.' : execution.reason === 'lease' ? 'Ejecución detenida por pérdida de autorización o lease.' : execution.reason ? 'Ejecución detenida; compruebe la limpieza del proceso.' : execution.code === 0 ? 'Proceso finalizado correctamente.' : `Proceso finalizado con código ${Number.isInteger(execution.code) ? execution.code : 'desconocido'}.` };
        if (execution.reason === 'cleanup') { j.phase = 'unknown'; journal.save(); return { status:'unknown', job_id:job.id, artifact_id }; }
        j.phase = 'result_pending'; journal.save();
        try { await heartbeat(c); await result(c, j); j.phase = 'reported'; }
        catch { j.phase = 'unknown'; }
        journal.save();
        if (signal?.aborted) return { status:j.phase, job_id:job.id, artifact_id };
        try { await report(c, 'available'); } catch { /* next poll will refresh */ }
        if (once || j.phase === 'unknown') return { status:j.phase, job_id:job.id, artifact_id };
        continue;
      }
      if (once) return { status:'empty' };
      await pause();
    } while (Date.now() < end);
    return { status:'stopped' };
  } finally { unlock(); }
}
