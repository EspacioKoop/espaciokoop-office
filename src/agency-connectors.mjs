import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { OfficeError, insist } from './domain.mjs';
import { openAgencyQueue } from './agency-queue.mjs';

const fingerprint = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(value);

// The queue validates the private directory and owns creation of agency.sqlite.
export function openAgencyConnectors({ directory, now = Date.now }) {
  const queue = openAgencyQueue({ directory, now });
  let db;
  try {
    db = new DatabaseSync(join(directory, 'agency.sqlite'));
    db.exec(`PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS agency_connectors (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, runtime TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      operation TEXT NOT NULL, fingerprint TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER, UNIQUE(owner,operation)
    );`);
  } catch (error) { queue.close(); throw error; }
  function register(owner, data) {
    insist(identifier(owner) && identifier(data.operation_id) && ['hermes', 'claude-code'].includes(data.runtime), 'FIELDS', 'Datos de conector no válidos.');
    const hash = fingerprint(JSON.stringify({ runtime: data.runtime }));
    db.exec('BEGIN IMMEDIATE');
    try {
      const old = db.prepare('SELECT * FROM agency_connectors WHERE owner=? AND operation=?').get(owner, data.operation_id);
      if (old) {
        insist(old.fingerprint === hash, 'IDEMPOTENCY_CONFLICT', 'La operación ya corresponde a otra solicitud.', 409);
        db.exec('COMMIT');
        return { id: old.id, duplicate: true };
      }
      const id = randomUUID(); const token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO agency_connectors (id,owner,runtime,token_hash,operation,fingerprint) VALUES (?,?,?,?,?,?)').run(id, owner, data.runtime, fingerprint(token), data.operation_id, hash);
      db.exec('COMMIT');
      return { id, token, duplicate: false };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function authenticate(token, policy) {
    insist(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 'AUTH', 'Credencial no válida.', 401);
    const row = db.prepare('SELECT * FROM agency_connectors WHERE token_hash=? AND revoked=0').get(fingerprint(token));
    insist(row && policy.members.some(member => member.id === row.owner), 'AUTH', 'Credencial no válida.', 401);
    return row;
  }
  function heartbeat(row) {
    const time = now();
    const result = db.prepare('UPDATE agency_connectors SET last_seen=? WHERE id=? AND revoked=0').run(time, row.id);
    insist(result.changes === 1, 'AUTH', 'Credencial no válida.', 401);
    return { id: row.id, last_seen_at: time };
  }
  function revoke(owner, id) {
    insist(identifier(id), 'FIELDS', 'Identificador no válido.');
    const result = db.prepare('UPDATE agency_connectors SET revoked=1 WHERE owner=? AND id=?').run(owner, id);
    insist(result.changes === 1, 'FORBIDDEN', 'Conector no autorizado.', 403);
    return { id, revoked: true };
  }
  return { register, authenticate, heartbeat, revoke, close() { db.close(); queue.close(); } };
}
