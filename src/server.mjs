import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { OfficeError, insist, digest, validatePolicy, authenticate, authorizedProjects, publicMember, projectSnapshot } from './domain.mjs';
import { GitHubSource } from './github.mjs';
import { DemoSource } from './fixtures.mjs';

export const VERSION = '1.0.0-rc.1';
const TTL = 12000;
const assets = new Map([
  ['/', ['../web/index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['../web/app.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['../web/style.css', 'text/css; charset=utf-8']],
  ['/office.svg', ['../web/office.svg', 'image/svg+xml']]
]);
const security = {
  'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
function json(res, status, value, headers = {}) {
  res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value));
}
async function body(req, allowed) {
  insist(req.headers['content-type']?.split(';')[0] === 'application/json', 'CONTENT_TYPE', 'Se requiere JSON.', 415);
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    insist(length <= 2048, 'BODY_LIMIT', 'Petición demasiado grande.', 413);
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new OfficeError('JSON', 'JSON no válido.'); }
  insist(data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).every(k => allowed.includes(k)), 'FIELDS', 'Campos no admitidos.');
  return data;
}

export function createOffice({ mode = 'demo', policyPath, source, policyLoader, now = Date.now, watchInterval = 750 } = {}) {
  insist(['demo', 'live'].includes(mode), 'MODE', 'Modo no válido.');
  const demo = mode === 'demo' ? (source ?? new DemoSource()) : null;
  const remote = source ?? (demo || new GitHubSource({ token: process.env.OFFICE_GITHUB_TOKEN }));
  const load = policyLoader ?? (demo ? () => demo.policy() : () => {
    insist(typeof policyPath === 'string' && policyPath.length > 0, 'CONFIG', 'Indica OFFICE_POLICY con una política local explícita.');
    const text = readFileSync(policyPath, 'utf8');
    insist(Buffer.byteLength(text) <= 64000, 'POLICY', 'Política demasiado grande.');
    return JSON.parse(text);
  });
  function policy() {
    try { return validatePolicy(load()); } catch { throw new OfficeError('POLICY_UNAVAILABLE', 'La política local no está disponible o no es válida. Acceso retirado.', 503); }
  }
  // Fallo cerrado al arrancar; no se sustituye una configuración rota por una demo.
  policy();
  const sessions = new Map(); const streams = new Map(); const busy = new Set();
  let attempts = 0; let windowStart = now(); let activeReads = 0;
  const publicSession = s => ({ memberId: s.memberId, expiresAt: s.expiresAt });
  function getSession(req, p) {
    const id = /(?:^|;\s*)office=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    const session = sessions.get(id);
    insist(session && session.expiresAt > now() && session.policyHash === digest(JSON.stringify(p)) && p.members.some(m => m.id === session.memberId), 'AUTH', 'La sesión ha caducado o se ha revocado.', 401);
    return { id, session };
  }
  function revoke(id) {
    sessions.delete(id);
    for (const res of streams.get(id) ?? []) { res.write('event: revoke\ndata: {}\n\n'); res.end(); }
    streams.delete(id);
  }
  const server = createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      insist([`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host), 'HOST', 'Host no permitido.', 403);
      insist(!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']), 'ORIGIN', 'Acceso entre sitios no permitido.', 403);
      if (req.method === 'POST') insist(req.headers.origin === `http://${req.headers.host}`, 'ORIGIN', 'Origen no permitido.', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      insist(!url.search, 'QUERY', 'No se admiten parámetros arbitrarios.');
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        res.writeHead(200, { ...security, 'Content-Type': type });
        return res.end(readFileSync(new URL(file, import.meta.url)));
      }
      if (req.method === 'GET' && url.pathname === '/api/info') return json(res, 200, { version: VERSION, mode, ttl: TTL, integration: 'metadata-read-only' });
      if (req.method === 'POST' && url.pathname === '/api/session') {
        if (now() - windowStart >= 60000) { attempts = 0; windowStart = now(); }
        insist(attempts < 20 && sessions.size < 100, 'RATE_LIMIT', 'Demasiados intentos. Reintenta en un minuto.', 429);
        attempts++;
        const data = await body(req, ['key']); const p = policy(); const member = authenticate(p, data.key);
        insist(member, 'AUTH', 'Clave local no válida.', 401);
        const id = randomBytes(32).toString('hex');
        const session = { memberId: member.id, policyHash: digest(JSON.stringify(p)), expiresAt: now() + 3600000 };
        sessions.set(id, session);
        return json(res, 200, publicSession(session), { 'Set-Cookie': `office=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600` });
      }
      const p = policy(); const { id, session } = getSession(req, p);
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        await body(req, []); revoke(id);
        return json(res, 200, { ok: true }, { 'Set-Cookie': 'office=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0', 'Clear-Site-Data': '"cache", "storage"' });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        const connected = streams.get(id) ?? new Set();
        insist(connected.size < 3, 'RATE_LIMIT', 'Demasiadas conexiones de sesión.', 429);
        res.writeHead(200, { ...security, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.write(': Office: solo señales de revocación, nunca metadatos de tareas.\n\n');
        connected.add(res); streams.set(id, connected);
        res.on('close', () => { connected.delete(res); if (!connected.size) streams.delete(id); });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/demo/advance') {
        insist(demo, 'MODE', 'La simulación está desactivada en modo conectado.', 404);
        const data = await body(req, ['version']);
        insist(Number.isSafeInteger(data.version), 'VERSION', 'Versión requerida.');
        const result = demo.advance(session.memberId, data.version);
        insist(!result.error, result.error, result.error === 'FORBIDDEN' ? 'Esta fase corresponde al otro equipo de ejemplo.' : 'El estado ha cambiado. Actualiza la vista.', result.error === 'FORBIDDEN' ? 403 : 409);
        // Solo fixtures: mantener las sesiones al aparecer la asociación sintética issue/PR.
        const hash = digest(JSON.stringify(policy()));
        for (const s of sessions.values()) s.policyHash = hash;
        return json(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/api/snapshot') {
        insist(!busy.has(id) && activeReads < 4, 'RATE_LIMIT', 'Ya hay una lectura en curso. Reintenta después.', 429);
        busy.add(id); activeReads++;
        try {
          const projects = authorizedProjects(p, session.memberId);
          const projected = [];
          // Secuencial: evita ráfagas de consultas y mantiene un límite de recursos simple.
          for (const project of projects) {
            const data = await remote.read(project);
            getSession(req, policy()); // Revocación durante una consulta: descartar antes de continuar.
            projected.push(projectSnapshot(project, data, p));
          }
          getSession(req, policy());
          const memberIds = new Set(projects.flatMap(pr => pr.readers)); memberIds.add(session.memberId);
          return json(res, 200, {
            mode, version: VERSION, generatedAt: now(), expiresAt: now() + TTL,
            memberId: session.memberId, members: p.members.filter(m => memberIds.has(m.id)).map(publicMember), projects: projected,
            demo: demo ? { step: demo.step, version: demo.version } : null,
            limitations: ['Lectura de metadatos; no ejecución de agentes.', 'Una cuenta compartida no identifica un agente individual.', 'La relación entre issue y PR se declara en la política local.']
          });
        } finally { busy.delete(id); activeReads--; }
      }
      throw new OfficeError('NOT_FOUND', 'Ruta no disponible.', 404);
    } catch (error) {
      if (res.headersSent) return res.end();
      const safe = error instanceof OfficeError ? error : new OfficeError('INTERNAL', 'Operación no disponible. No se conserva la vista.', 500);
      json(res, safe.status, { error: safe.code, message: safe.message });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const watcher = setInterval(() => {
    let hash;
    try { hash = digest(JSON.stringify(policy())); } catch { hash = null; }
    for (const [id, s] of sessions) if (s.expiresAt <= now() || s.policyHash !== hash) revoke(id);
  }, watchInterval);
  watcher.unref();
  const close = () => new Promise(resolveClose => {
    clearInterval(watcher);
    for (const id of sessions.keys()) revoke(id);
    server.close(resolveClose); server.closeAllConnections();
  });
  return { server, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    insist(args.length === 1 && ['--demo', '--live'].includes(args[0]), 'MODE', 'Usa --demo o --live explícitamente.');
    const port = Number(process.env.OFFICE_PORT ?? 4173);
    insist(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, 'PORT', 'Puerto no válido.');
    const app = createOffice({ mode: args[0].slice(2), policyPath: process.env.OFFICE_POLICY });
    app.server.on('error', () => { console.error('No se puede abrir el puerto local. Comprueba OFFICE_PORT.'); process.exitCode = 1; });
    app.server.listen(port, '127.0.0.1', () => console.log(`Office ${VERSION} · ${args[0].slice(2)} · http://127.0.0.1:${port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
  } catch (error) { console.error(error instanceof OfficeError ? error.message : 'Configuración no válida.'); process.exitCode = 1; }
}
