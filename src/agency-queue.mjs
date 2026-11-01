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
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const get = (owner, id) => db.prepare('SELECT * FROM work WHERE owner = ? AND id = ?').get(owner, id);
  function expire(time) {
    db.prepare("UPDATE work SET state='unknown', lease=NULL, lease_until=NULL, updated_at=? WHERE state='running' AND lease_until<=?").run(time, time);
  }
  function enqueue({ owner, operation, title, instruction, connector }) {
    insist(identifier(owner) && identifier(operation) && identifier(connector), 'FIELDS', 'Identificadores no válidos.');
    insist(typeof title === 'string' && title.trim() && title.length <= 160 && typeof instruction === 'string' && instruction.trim() && instruction.length <= 4096, 'FIELDS', 'Trabajo no válido.');
    const fingerprint = hash({ title, instruction, connector });
    return transaction(() => {
      const previous = db.prepare('SELECT * FROM work WHERE owner=? AND operation=?').get(owner, operation);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'La operación ya corresponde a otra solicitud.');
        return { id: previous.id, duplicate: true };
      }
      const id = randomUUID(); const time = now();
      db.prepare("INSERT INTO work (id,owner,operation,fingerprint,title,instruction,connector,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'queued',?,?)").run(id, owner, operation, fingerprint, title, instruction, connector, time, time);
      return { id, duplicate: false };
    });
  }
  function claim({ owner, connector, leaseMs = 30000 }) {
    insist(identifier(owner) && identifier(connector) && Number.isSafeInteger(leaseMs) && leaseMs >= 1000 && leaseMs <= 300000, 'FIELDS', 'Petición de lease no válida.');
    return transaction(() => {
      const time = now(); expire(time);
      const row = db.prepare("SELECT * FROM work WHERE owner=? AND connector=? AND state='queued' ORDER BY created_at,id LIMIT 1").get(owner, connector);
      if (!row) return null;
      const lease = randomUUID();
      db.prepare("UPDATE work SET state='running',lease=?,lease_until=?,updated_at=? WHERE id=?").run(lease, time + leaseMs, time, row.id);
      return { id: row.id, title: row.title, instruction: row.instruction, lease, lease_until: time + leaseMs };
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
      return { id: row.id, owner_id: row.owner, title: row.title, status: row.state, result: row.result ? JSON.parse(row.result) : null, created_at: row.created_at, updated_at: row.updated_at };
    });
  }
  return { enqueue, claim, heartbeat, finish, read, close: () => db.close() };
}
