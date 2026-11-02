// Durable primitives for a future authenticated agency bridge. No processes are run here.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { chmodSync, lstatSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { OfficeError, insist } from './domain.mjs';

const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(value);
const json = value => JSON.stringify(value);
const hash = value => createHash('sha256').update(json(value)).digest('hex');
const fail = (code, message, status = 409) => { throw new OfficeError(code, message, status); };

export function openAgencyQueue({ directory, now = Date.now }) {
  insist(typeof directory === 'string' && isAbsolute(directory), 'CONFIG', 'Se requiere un directorio absoluto de agencia.');
  const dir = lstatSync(directory);
  insist(dir.isDirectory() && !dir.isSymbolicLink() && (dir.mode & 0o077) === 0, 'CONFIG', 'El directorio de agencia debe ser privado.');
  const path = join(directory, 'agency.sqlite');
  try { insist(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'CONFIG', 'Almacén no válido.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;');
  const schema = db.prepare('PRAGMA user_version').get().user_version;
  if (schema > 1) { db.close(); fail('VERSION', 'Versión de almacén no admitida.'); }
  db.exec(`CREATE TABLE IF NOT EXISTS work (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, operation TEXT NOT NULL, fingerprint TEXT NOT NULL,
    title TEXT NOT NULL, instruction TEXT NOT NULL, connector TEXT NOT NULL,
    state TEXT NOT NULL, lease TEXT, lease_until INTEGER, result TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner, operation)
  ); PRAGMA user_version = 1;`);
  if (!db.prepare("PRAGMA table_info(work)").all().some(c => c.name === 'agent')) db.exec('ALTER TABLE work ADD COLUMN agent TEXT');
  db.exec('CREATE TABLE IF NOT EXISTS agency_claims (connector TEXT NOT NULL, operation TEXT NOT NULL, job_id TEXT, PRIMARY KEY(connector,operation))');
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const get = (owner, id) => db.prepare('SELECT * FROM work WHERE owner = ? AND id = ?').get(owner, id);
  function expire(time) {
    db.prepare("UPDATE work SET state='unknown', lease=NULL, lease_until=NULL, updated_at=? WHERE state='running' AND lease_until<=?").run(time, time);
  }
  function enqueue({ owner, operation, title, instruction, connector, agent = null }, validate = () => {}) {
    insist(identifier(owner) && identifier(operation) && identifier(connector), 'FIELDS', 'Identificadores no válidos.');
    insist(typeof title === 'string' && title.trim() && title.length <= 160 && typeof instruction === 'string' && instruction.trim() && instruction.length <= 4096, 'FIELDS', 'Trabajo no válido.');
    insist(agent === null || identifier(agent), 'FIELDS', 'Agente no válido.');
    const fingerprint = hash(agent === null ? { title, instruction, connector } : { title, instruction, connector, agent });
    return transaction(() => {
      const previous = db.prepare('SELECT * FROM work WHERE owner=? AND operation=?').get(owner, operation);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'La operación ya corresponde a otra solicitud.');
        return { id: previous.id, duplicate: true };
      }
      validate();
      const id = randomUUID(); const time = now();
      db.prepare("INSERT INTO work (id,owner,operation,fingerprint,title,instruction,connector,state,created_at,updated_at,agent) VALUES (?,?,?,?,?,?,?,'queued',?,?,?)").run(id, owner, operation, fingerprint, title, instruction, connector, time, time, agent);
      return { id, duplicate: false };
    });
  }
  function claim({ owner, connector, operation, leaseMs = 30000 }) {
    insist(identifier(owner) && identifier(connector) && Number.isSafeInteger(leaseMs) && leaseMs >= 1000 && leaseMs <= 300000, 'FIELDS', 'Petición de lease no válida.');
    insist(operation === undefined || identifier(operation), 'FIELDS', 'Operación no válida.');
    return transaction(() => {
      const time = now(); expire(time);
      const old = operation && db.prepare('SELECT job_id FROM agency_claims WHERE connector=? AND operation=?').get(connector, operation);
      if (old) {
        const prior = old.job_id && get(owner, old.job_id);
        return prior && prior.state === 'running' ? { id: prior.id, agent_id: prior.agent, title: prior.title, instruction: prior.instruction, lease: prior.lease, lease_until: prior.lease_until } : null;
      }
      const hasAgents = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='agency_agents'").get();
      const row = hasAgents ? db.prepare("SELECT w.* FROM work w WHERE w.owner=? AND w.connector=? AND w.state='queued' AND (w.agent IS NULL OR EXISTS (SELECT 1 FROM agency_agents a JOIN agency_connectors c ON c.id=a.connector WHERE a.id=w.agent AND a.owner=w.owner AND a.connector=w.connector AND a.in_office=1 AND a.revoked=0 AND a.status='available' AND a.last_seen>? AND c.revoked=0 AND c.last_seen>?)) AND NOT EXISTS (SELECT 1 FROM work active WHERE active.owner=w.owner AND active.agent=w.agent AND active.state='running') ORDER BY w.rowid LIMIT 1").get(owner, connector, time-60000, time-60000) : db.prepare("SELECT * FROM work WHERE owner=? AND connector=? AND state='queued' ORDER BY rowid LIMIT 1").get(owner, connector);
      if (operation) db.prepare('INSERT INTO agency_claims VALUES (?,?,?)').run(connector, operation, row?.id ?? null);
      if (!row) return null;
      const lease = randomUUID();
      db.prepare("UPDATE work SET state='running',lease=?,lease_until=?,updated_at=? WHERE id=?").run(lease, time + leaseMs, time, row.id);
      return { id: row.id, agent_id: row.agent, title: row.title, instruction: row.instruction, lease, lease_until: time + leaseMs };
    });
  }
  function withLease({ owner, connector, id, lease }, action) {
    insist([owner, connector, id, lease].every(identifier), 'FIELDS', 'Identificadores no válidos.');
    return transaction(() => {
      const time = now(); expire(time);
      const row = get(owner, id);
      if (!row || row.connector !== connector) fail('FORBIDDEN', 'Trabajo no autorizado.', 403);
      if (row.state !== 'running' || row.lease !== lease) fail('LEASE_CONFLICT', 'Lease no válido o caducado.');
      return action(row, time);
    });
  }
  function heartbeat(request) {
    const leaseMs = request.leaseMs ?? 30000;
    insist(Number.isSafeInteger(leaseMs) && leaseMs >= 1000 && leaseMs <= 300000, 'FIELDS', 'Duración no válida.');
    return withLease(request, (row, time) => {
      db.prepare('UPDATE work SET lease_until=?,updated_at=? WHERE id=?').run(time + leaseMs, time, row.id);
      return { lease_until: time + leaseMs };
    });
  }
  function finish(request) {
    insist(['succeeded', 'failed'].includes(request.state) && typeof request.summary === 'string' && request.summary.length <= 500 && typeof request.artifact_id === 'string' && identifier(request.artifact_id), 'FIELDS', 'Resultado no válido.');
    return withLease(request, (row, time) => {
      db.prepare('UPDATE work SET state=?,result=?,lease=NULL,lease_until=NULL,updated_at=? WHERE id=?').run(request.state, json({ summary: request.summary, artifact_id: request.artifact_id }), time, row.id);
      return { state: request.state };
    });
  }
  function read(owner, id) {
    insist(identifier(owner) && identifier(id), 'FIELDS', 'Identificadores no válidos.');
    return transaction(() => {
      expire(now()); const row = get(owner, id);
      if (!row) fail('FORBIDDEN', 'Trabajo no autorizado.', 403);
      return { id: row.id, title: row.title, status: row.state, agent_id: row.agent, result: row.result ? JSON.parse(row.result) : null, created_at: row.created_at, updated_at: row.updated_at };
    });
  }
  function list(owner) {
    insist(identifier(owner), 'FIELDS', 'Propietario no válido.');
    return transaction(() => { expire(now()); return db.prepare('SELECT id,title,state,agent,result FROM work WHERE owner=? ORDER BY rowid').all(owner).map(row => ({ id:row.id, title:row.title, status:row.state, agent_id:row.agent, result:row.result ? JSON.parse(row.result) : null })); });
  }
  return { enqueue, claim, heartbeat, finish, read, list, close: () => db.close() };
}
