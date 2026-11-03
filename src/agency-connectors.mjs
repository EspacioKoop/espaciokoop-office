import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { OfficeError, insist } from './domain.mjs';
import { openAgencyQueue } from './agency-queue.mjs';

const fingerprint = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(value);
const reasons = ['auth_unavailable','runtime_unavailable','provider_unavailable','executable_unavailable','probe_failed'];

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
    );
    CREATE TABLE IF NOT EXISTS agency_agents (id TEXT PRIMARY KEY, owner TEXT NOT NULL, connector TEXT NOT NULL, ref TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, capabilities TEXT NOT NULL, last_seen INTEGER NOT NULL, in_office INTEGER NOT NULL DEFAULT 0, section TEXT, version INTEGER NOT NULL DEFAULT 1, revoked INTEGER NOT NULL DEFAULT 0, UNIQUE(connector,ref));
    CREATE TABLE IF NOT EXISTS agency_sections (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(owner,name));
    CREATE TABLE IF NOT EXISTS agency_operations (scope TEXT NOT NULL, operation TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(scope,operation));
    CREATE TABLE IF NOT EXISTS agency_owner_revision (owner TEXT PRIMARY KEY, revision INTEGER NOT NULL);`);
    if (!db.prepare('PRAGMA table_info(agency_agents)').all().some(column => column.name === 'reason_code')) db.exec('ALTER TABLE agency_agents ADD COLUMN reason_code TEXT');
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
      bump(owner); db.exec('COMMIT');
      return { id, token, duplicate: false };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function authenticate(token, policy) {
    insist(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 'AUTH', 'Credencial no válida.', 401);
    const row = db.prepare('SELECT * FROM agency_connectors WHERE token_hash=? AND revoked=0').get(fingerprint(token));
    insist(row && policy.members.some(member => member.id === row.owner), 'AUTH', 'Credencial no válida.', 401);
    insist(row.last_seen === null || now() - row.last_seen <= 60000, 'AUTH', 'Credencial no válida.', 401);
    return row;
  }
  function heartbeat(row) {
    return transaction(() => {
      const time = now();
      const result = db.prepare('UPDATE agency_connectors SET last_seen=? WHERE id=? AND revoked=0').run(time, row.id);
      insist(result.changes === 1, 'AUTH', 'Credencial no válida.', 401);
      bump(row.owner); return { id: row.id, last_seen_at: time };
    });
  }
  function revoke(owner, id) {
    insist(identifier(id), 'FIELDS', 'Identificador no válido.');
    return transaction(() => {
    const row = db.prepare('SELECT revoked FROM agency_connectors WHERE owner=? AND id=?').get(owner, id);
    insist(row, 'FORBIDDEN', 'Conector no autorizado.', 403);
    if (!row.revoked) { db.prepare('UPDATE agency_connectors SET revoked=1 WHERE owner=? AND id=?').run(owner, id); bump(owner); }
    return { id, revoked: true }; });
  }
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const bump = owner => db.prepare('INSERT INTO agency_owner_revision VALUES (?,1) ON CONFLICT(owner) DO UPDATE SET revision=revision+1').run(owner);
  function operation(scope, owner, data, action) {
    insist(identifier(data.operation_id), 'FIELDS', 'Operación no válida.');
    const hash = fingerprint(JSON.stringify(data));
    return transaction(() => {
      const old = db.prepare('SELECT * FROM agency_operations WHERE scope=? AND operation=?').get(scope, data.operation_id);
      if (old) { insist(old.fingerprint === hash, 'IDEMPOTENCY_CONFLICT', 'Operación en conflicto.', 409); return JSON.parse(old.result); }
      const result = action();
      db.prepare('INSERT INTO agency_operations VALUES (?,?,?,?)').run(scope, data.operation_id, hash, JSON.stringify(result));
      bump(owner); return result;
    });
  }
  const validName = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 100 && !/[\x00-\x1f\x7f]/.test(x);
  function report(connector, data) {
    insist(Array.isArray(data.agents) && data.agents.length <= 20, 'FIELDS', 'Lista no válida.');
    const refs = new Set();
    for (const a of data.agents) {
      insist(a && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).every(k => ['agent_ref','name','status','capabilities','reason_code'].includes(k)) && identifier(a.agent_ref) && !refs.has(a.agent_ref) && validName(a.name) && ['available','busy','offline','unknown'].includes(a.status) && (!Object.hasOwn(a,'reason_code') || reasons.includes(a.reason_code)) && Array.isArray(a.capabilities) && a.capabilities.length <= 20 && a.capabilities.every(identifier), 'FIELDS', 'Agente no válido.'); refs.add(a.agent_ref);
    }
    return operation('connector:' + connector.id, connector.owner, data, () => {
      const time = now();
      for (const a of data.agents) {
        db.prepare(`INSERT INTO agency_agents (id,owner,connector,ref,name,status,capabilities,last_seen,reason_code) VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(connector,ref) DO UPDATE SET name=excluded.name,status=excluded.status,capabilities=excluded.capabilities,last_seen=excluded.last_seen,reason_code=excluded.reason_code,version=agency_agents.version+1 WHERE agency_agents.revoked=0`).run(randomUUID(), connector.owner, connector.id, a.agent_ref, a.name, a.status, JSON.stringify(a.capabilities), time, a.status === 'offline' ? a.reason_code ?? null : null);
      }
      db.prepare('UPDATE agency_connectors SET last_seen=? WHERE id=? AND revoked=0').run(time, connector.id);
      return { accepted: data.agents.length };
    });
  }
  function section(owner, data) {
    insist(validName(data.name), 'FIELDS', 'Nombre no válido.');
    return operation('owner:' + owner, owner, data, () => {
      const id = randomUUID();
      try { db.prepare('INSERT INTO agency_sections VALUES (?,?,?)').run(id, owner, data.name); }
      catch (error) { if (error.code?.startsWith('ERR_SQLITE')) throw new OfficeError('CONFLICT', 'Sección existente.', 409); throw error; }
      return { id, name: data.name };
    });
  }
  function move(owner, id, data, kind) {
    insist(identifier(id) && Number.isSafeInteger(data.expected_version) && data.expected_version > 0, 'FIELDS', 'Versión no válida.');
    if (kind === 'membership') insist(typeof data.in_office === 'boolean', 'FIELDS', 'Estado no válido.');
    else { insist(data.job_id === null, 'NOT_IMPLEMENTED', 'Los trabajos aún no están disponibles.', 501); insist(identifier(data.section_id), 'FIELDS', 'Sección no válida.'); }
    return operation('owner:' + owner, owner, { ...data, target: id, kind }, () => {
      const agent = db.prepare('SELECT a.*,c.revoked AS connector_revoked,c.last_seen AS connector_seen FROM agency_agents a JOIN agency_connectors c ON c.id=a.connector WHERE a.id=? AND a.owner=?').get(id, owner);
      insist(agent && !agent.revoked, 'FORBIDDEN', 'Agente no autorizado.', 403);
      insist(agent.version === data.expected_version, 'VERSION_CONFLICT', 'Versión obsoleta.', 409);
      if (kind === 'assign') {
        insist(agent.in_office && !agent.connector_revoked && agent.connector_seen !== null && now()-agent.connector_seen <= 60000 && now()-agent.last_seen <= 60000 && agent.status === 'available', 'NOT_AVAILABLE', 'Agente no disponible.', 409);
        insist(db.prepare('SELECT id FROM agency_sections WHERE id=? AND owner=?').get(data.section_id, owner), 'FORBIDDEN', 'Sección no autorizada.', 403);
        db.prepare('UPDATE agency_agents SET section=?,version=version+1 WHERE id=?').run(data.section_id,id);
      } else db.prepare('UPDATE agency_agents SET in_office=?,section=CASE WHEN ?=0 THEN NULL ELSE section END,version=version+1 WHERE id=?').run(data.in_office ? 1 : 0,data.in_office ? 1 : 0,id);
      return { id, version: agent.version+1 };
    });
  }
  function enqueue(owner, data) {
    insist(identifier(data.agent_id), 'FIELDS', 'Agente no válido.');
    const agent = db.prepare('SELECT * FROM agency_agents WHERE owner=? AND id=? AND revoked=0').get(owner, data.agent_id);
    insist(agent, 'FORBIDDEN', 'Agente no autorizado.', 403);
    return queue.enqueue({ owner, operation:data.operation_id, title:data.title, instruction:data.instruction, connector:agent.connector, agent:agent.id }, () => {
      const c = db.prepare('SELECT * FROM agency_connectors WHERE id=? AND owner=?').get(agent.connector, owner);
      insist(agent.in_office && agent.status === 'available' && now()-agent.last_seen <= 60000 && c && !c.revoked && c.last_seen !== null && now()-c.last_seen <= 60000, 'NOT_AVAILABLE', 'Agente no disponible.', 409);
    });
  }
  function snapshot(owner) {
    const time = now();
    const connectors = db.prepare('SELECT id,owner,runtime,revoked,last_seen FROM agency_connectors WHERE owner=? ORDER BY id').all(owner).map(c => ({ id:c.id, owner_id:c.owner, runtime:c.runtime, status:c.revoked ? 'offline' : c.last_seen === null ? 'unknown' : time-c.last_seen <= 60000 ? 'online' : 'offline', last_seen_at:c.last_seen, capabilities:[] }));
    const byId = new Map(connectors.map(c => [c.id,c]));
    const agents = db.prepare('SELECT * FROM agency_agents WHERE owner=? AND revoked=0 ORDER BY id').all(owner).map(a => ({ id:a.id,name:a.name,owner_id:a.owner,runtime:byId.get(a.connector).runtime,in_office:Boolean(a.in_office),section_id:a.section,status:byId.get(a.connector).status === 'online' && time-a.last_seen <= 60000 ? a.status : 'offline',reason_code:byId.get(a.connector).status === 'online' && time-a.last_seen <= 60000 && a.status === 'offline' && reasons.includes(a.reason_code) ? a.reason_code : null,job_id:null,last_seen_at:a.last_seen,capabilities:JSON.parse(a.capabilities),version:a.version }));
    return { version:1, revision:(db.prepare('SELECT revision FROM agency_owner_revision WHERE owner=?').get(owner)?.revision ?? 0), owner_id:owner, agents, jobs:queue.list(owner), sections:db.prepare('SELECT id,name FROM agency_sections WHERE owner=? ORDER BY id').all(owner), learnings:[], connectors, capabilities:{create_agent:false,connect_agent:false,assign:agents.some(a => a.in_office && a.status === 'available')},observed_at:time };
  }
  return { register, authenticate, heartbeat, revoke, report, section, move, snapshot, enqueue, read:queue.read, claim:queue.claim, jobHeartbeat:queue.heartbeat, finish:queue.finish, close() { db.close(); queue.close(); } };
}
