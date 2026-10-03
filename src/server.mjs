import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { OfficeError, insist, digest, validatePolicy, authenticate, authorizedProjects, publicMember, projectSnapshot } from './domain.mjs';
import { buildTeamQueue, validateTeamRoutes } from './team-queue.mjs';
import { GitHubSource } from './github.mjs';
import { DemoSource } from './fixtures.mjs';
import { createPresenceBridge } from './presence-bridge.mjs';
import { createSpaceBridge, spaceFailure } from './space-bridge.mjs';
import { SpaceError, createSpaceState } from '../packages/office-space/src/space.mjs';

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
  const req = res.req;
  const unreadBody = !req.readableEnded && (Number(req.headers['content-length']) > 0 ||
    /(?:^|,)\s*chunked\s*(?:,|$)/i.test(req.headers['transfer-encoding'] ?? ''));
  if (status >= 400 && unreadBody) {
    // Never drain an attacker-controlled body after rejection. Keep the writable
    // side alive until the complete error (including 413) has been flushed.
    const socket = req.socket;
    req.pause(); socket.pause(); res.shouldKeepAlive = false;
    headers = { ...headers, Connection: 'close' };
    res.once('finish', () => socket.destroy());
  }
  res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(value));
}
async function body(req, allowed) {
  insist(req.headers['content-type']?.split(';')[0] === 'application/json', 'CONTENT_TYPE', 'Se requiere JSON.', 415);
  const chunks = []; let length = 0;
  // Keep the connection writable on rejection; no unbounded buffering/draining.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    insist(length <= 2048, 'BODY_LIMIT', 'Petición demasiado grande.', 413);
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new OfficeError('JSON', 'JSON no válido.'); }
  insist(data && typeof data === 'object' && !Array.isArray(data) && (!allowed || Object.keys(data).every(k => allowed.includes(k))), 'FIELDS', 'Campos no admitidos.');
  return data;
}

// Administrator-only settings. Never derive transport trust from forwarded headers.
export function serviceConfiguration(env = {}) {
  const bind = env.OFFICE_BIND === 'localhost' ? '127.0.0.1' : (env.OFFICE_BIND ?? '127.0.0.1');
  insist(isIP(bind), 'CONFIG', 'OFFICE_BIND debe ser una dirección literal o localhost.');
  const loopback = (isIP(bind) === 4 && bind.startsWith('127.')) || bind === '::1';
  let publicOrigin;
  if (env.OFFICE_PUBLIC_ORIGIN !== undefined) {
    let u;
    try { u = new URL(env.OFFICE_PUBLIC_ORIGIN); } catch { throw new OfficeError('CONFIG', 'OFFICE_PUBLIC_ORIGIN no válido.'); }
    insist(['http:', 'https:'].includes(u.protocol) &&
      [u.origin, `${u.origin}/`].includes(env.OFFICE_PUBLIC_ORIGIN), 'CONFIG', 'OFFICE_PUBLIC_ORIGIN debe ser un origen sin credenciales, ruta ni parámetros.');
    publicOrigin = u.origin;
  }
  const key = env.OFFICE_TLS_KEY; const cert = env.OFFICE_TLS_CERT;
  insist((key === undefined && cert === undefined) || (typeof key === 'string' && key.length && typeof cert === 'string' && cert.length), 'CONFIG', 'Configura conjuntamente OFFICE_TLS_KEY y OFFICE_TLS_CERT.');
  insist(!key || publicOrigin?.startsWith('https://'), 'CONFIG', 'TLS requiere un origen https explícito.');
  insist(loopback || publicOrigin, 'CONFIG', 'Un servicio no local requiere OFFICE_PUBLIC_ORIGIN.');
  insist(loopback || key || env.OFFICE_PRIVATE_TUNNEL === '1', 'CONFIG', 'Sin TLS, OFFICE_PRIVATE_TUNNEL=1 se permite únicamente detrás de un túnel cifrado privado.');
  return { bind, publicOrigin, tls: key ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined };
}

export function createOffice({ mode = 'demo', policyPath, source, policyLoader, taskRoutesLoader, presenceLoader, now = Date.now, watchInterval = 750, config = {} } = {}) {
  const transport = serviceConfiguration(config);
  insist(['demo', 'live'].includes(mode), 'MODE', 'Modo no válido.');
  const demo = mode === 'demo' ? (source ?? new DemoSource()) : null;
  const remote = source ?? (demo || new GitHubSource({ token: process.env.OFFICE_GITHUB_TOKEN }));
  const load = policyLoader ?? (demo ? () => demo.policy() : () => {
    insist(typeof policyPath === 'string' && policyPath.length > 0, 'CONFIG', 'Indica OFFICE_POLICY con una política local explícita.');
    const text = readFileSync(policyPath, 'utf8');
    insist(Buffer.byteLength(text) <= 64000, 'POLICY', 'Política demasiado grande.');
    return JSON.parse(text);
  });
  let presence = null;
  function policy() {
    try {
      const checked = validatePolicy(load()); presence?.observePolicy(checked); return checked;
    } catch {
      presence?.invalidate();
      throw new OfficeError('POLICY_UNAVAILABLE', 'La política local no está disponible o no es válida. Acceso retirado.', 503);
    }
  }
  // Fallo cerrado al arrancar; no se sustituye una configuración rota por una demo.
  const initialPolicy = policy();
  const loadRoutes = taskRoutesLoader ?? (() => {
    if (config.OFFICE_TASK_ROUTES === undefined) return [];
    const text = readFileSync(config.OFFICE_TASK_ROUTES, 'utf8');
    insist(Buffer.byteLength(text) <= 16000, 'TASK_ROUTE', 'Rutas demasiado grandes.');
    return JSON.parse(text);
  });
  function taskRoutes(p) {
    try { return validateTeamRoutes(loadRoutes(), p); }
    catch { throw new OfficeError('QUEUE_UNAVAILABLE', 'Las rutas locales no están disponibles o no son válidas.', 503); }
  }
  taskRoutes(initialPolicy);
  const loadPresence = presenceLoader ?? (config.OFFICE_AGENT_DIRECTORY === undefined ? null : () => {
    const text = readFileSync(config.OFFICE_AGENT_DIRECTORY, 'utf8');
    insist(Buffer.byteLength(text) <= 64000, 'PRESENCE_CONFIG', 'Directorio demasiado grande.');
    return JSON.parse(text);
  });
  presence = loadPresence ? createPresenceBridge({ load: loadPresence,
    projectId: config.OFFICE_PRESENCE_PROJECT, now }) : null;
  insist(presence || config.OFFICE_PRESENCE_PROJECT === undefined, 'CONFIG', 'Configura OFFICE_AGENT_DIRECTORY junto al proyecto de presencia.');
  presence?.initialize(initialPolicy);
  const projectId = config.OFFICE_SPACE_PROJECT ?? (demo ? 'demo/observatorio' : undefined);
  if (projectId !== undefined || config.OFFICE_SPACE_DIR !== undefined) {
    insist(projectId && (demo || config.OFFICE_SPACE_DIR), 'CONFIG', 'Configura OFFICE_SPACE_PROJECT y OFFICE_SPACE_DIR para espacios persistentes.');
    createSpaceState(projectId);
    insist(initialPolicy.projects.some(p => p.repo === projectId), 'CONFIG', 'El proyecto de oficina debe existir en la política.');
  }
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
  const spaceBusy = new Set();
  function spaceGuard(req) {
    // Initial authentication has the same AUTH contract as the core API.
    const { id, session } = getSession(req, policy());
    const assertAuthorized = () => {
      let p;
      try {
        p = policy(); const current = getSession(req, p);
        if (current.id !== id || current.session !== session) throw new Error();
      } catch {
        revoke(id);
        throw new SpaceError('ACCESS_REVOKED');
      }
      // A valid member lacking this project keeps their core session and SSE.
      if (projectId && !authorizedProjects(p, session.memberId).some(p => p.repo === projectId)) throw new SpaceError('FORBIDDEN');
      return true;
    };
    assertAuthorized();
    return { id, session, assertAuthorized };
  }
  function invalidateSpace() {
    // A single configured project; only its currently authorised sessions get a signal.
    for (const [id, responses] of streams) {
      const s = sessions.get(id);
      let p;
      try { p = policy(); } catch { revoke(id); continue; }
      if (!s || s.expiresAt <= now() || s.policyHash !== digest(JSON.stringify(p))) { revoke(id); continue; }
      if (!authorizedProjects(p, s.memberId).some(p => p.repo === projectId)) continue;
      for (const res of responses) {
        if (!res.write('event: space\ndata: {}\n\n')) res.end();
      }
    }
  }
  const spaces = createSpaceBridge({ mode, directory: config.OFFICE_SPACE_DIR, projectId, now, onCommit: invalidateSpace });
  const handler = async (req, res) => {
    try {
      const port = server.address()?.port;
      const hosts = transport.publicOrigin ? [new URL(transport.publicOrigin).host] : [`127.0.0.1:${port}`, `localhost:${port}`];
      insist(hosts.includes(req.headers.host), 'HOST', 'Host no permitido.', 403);
      insist(!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']), 'ORIGIN', 'Acceso entre sitios no permitido.', 403);
      const origin = transport.publicOrigin ?? `http://${req.headers.host}`;
      if (req.method === 'POST') insist(req.headers.origin === origin, 'ORIGIN', 'Origen no permitido.', 403);
      insist(req.url.startsWith('/') && !req.url.startsWith('//'), 'URL', 'Ruta no válida.');
      const url = new URL(req.url, origin);
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
        return json(res, 200, publicSession(session), { 'Set-Cookie': `office=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${transport.publicOrigin?.startsWith('https://') ? '; Secure' : ''}` });
      }
      if ((req.method === 'GET' && url.pathname === '/api/space') || (req.method === 'POST' && url.pathname === '/api/space/command')) {
        let activeId;
        try {
          const { id, session, assertAuthorized } = spaceGuard(req);
          if (spaceBusy.has(id) || spaceBusy.size >= 4) return json(res, 429, { error: 'RATE_LIMIT' });
          activeId = id; spaceBusy.add(id);
          if (req.method === 'GET') return json(res, 200, await spaces.read(session.memberId, assertAuthorized));
          if (!session.spaceWindow || now() - session.spaceWindow.at >= 60000) session.spaceWindow = { at: now(), count: 0 };
          if (++session.spaceWindow.count > 60) return json(res, 429, { error: 'RATE_LIMIT' });
          // No field is discarded: the package owns the exact per-command schemas.
          const command = await body(req);
          const result = await spaces.apply(session.memberId, assertAuthorized, command);
          return json(res, 200, result);
        } catch (error) {
          if (error instanceof OfficeError && ['AUTH', 'POLICY_UNAVAILABLE', 'CONTENT_TYPE', 'BODY_LIMIT', 'JSON', 'FIELDS'].includes(error.code)) {
            return json(res, error.status, { error: error.code });
          }
          const failure = spaceFailure(error);
          return json(res, failure.status, failure.body);
        } finally { if (activeId) spaceBusy.delete(activeId); }
      }
      if (req.method === 'POST' && url.pathname === '/api/presence/heartbeat') {
        insist(presence, 'NOT_FOUND', 'Presencia no configurada.', 404);
        const key = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '')?.[1];
        const publication = presence.prepare(key, policy());
        try {
          const data = await body(req, ['projectId', 'sequence']);
          return json(res, 200, publication.commit(data, policy()));
        } finally { publication.release(); }
      }
      const p = policy(); const { id, session } = getSession(req, p);
      if (req.method === 'GET' && url.pathname === '/api/presence') {
        insist(presence, 'NOT_FOUND', 'Presencia no configurada.', 404);
        const result = presence.read(session.memberId, p);
        getSession(req, policy());
        return json(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        await body(req, []); revoke(id);
        return json(res, 200, { ok: true }, { 'Set-Cookie': `office=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${transport.publicOrigin?.startsWith('https://') ? '; Secure' : ''}`, 'Clear-Site-Data': '"cache", "storage"' });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        const connected = streams.get(id) ?? new Set();
        insist(connected.size < 3, 'RATE_LIMIT', 'Demasiadas conexiones de sesión.', 429);
        res.writeHead(200, { ...security, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.write(': Office: invalidación y revocación, nunca datos.\n\n');
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
      if (req.method === 'GET' && ['/api/snapshot', '/api/queue'].includes(url.pathname)) {
        insist(!busy.has(id) && activeReads < 4, 'RATE_LIMIT', 'Ya hay una lectura en curso. Reintenta después.', 429);
        busy.add(id); activeReads++;
        try {
          const routes = url.pathname === '/api/queue' ? taskRoutes(p) : null;
          const routeHash = routes && digest(JSON.stringify(routes));
          const routedProjects = new Set(routes?.filter(r => r.team_id === session.memberId).map(r => r.project_id));
          const projects = authorizedProjects(p, session.memberId).filter(project => !routes || routedProjects.has(project.repo));
          const revalidate = () => {
            const currentPolicy = policy();
            getSession(req, currentPolicy);
            if (routes) insist(digest(JSON.stringify(taskRoutes(currentPolicy))) === routeHash,
              'QUEUE_CHANGED', 'Las rutas han cambiado. Repite la consulta.', 409);
          };
          const projected = [];
          // Secuencial: evita ráfagas de consultas y mantiene un límite de recursos simple.
          for (const project of projects) {
            const data = await remote.read(project);
            revalidate(); // Revocación durante una consulta: descartar antes de continuar.
            projected.push(projectSnapshot(project, data, p));
          }
          revalidate();
          if (routes) return json(res, 200, {
            mode, version: VERSION, generatedAt: now(), expiresAt: now() + TTL,
            memberId: session.memberId,
            queue: buildTeamQueue({ routes, policy: p, teamId: session.memberId, snapshots: projected })
          });
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
  };
  const server = transport.tls ? createSecureServer(transport.tls, handler) : createServer(handler);
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const watcher = setInterval(() => {
    let hash;
    try { hash = digest(JSON.stringify(policy())); } catch { hash = null; }
    for (const [id, s] of sessions) if (s.expiresAt <= now() || s.policyHash !== hash) revoke(id);
  }, watchInterval);
  watcher.unref();
  const close = async () => {
    clearInterval(watcher);
    for (const id of sessions.keys()) revoke(id);
    const stopped = new Promise(resolveClose => server.close(resolveClose));
    server.closeAllConnections();
    await stopped;
    await spaces.close();
  };
  return { server, close, bind: transport.bind };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    insist(args.length === 1 && ['--demo', '--live'].includes(args[0]), 'MODE', 'Usa --demo o --live explícitamente.');
    const port = Number(process.env.OFFICE_PORT ?? 4173);
    insist(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, 'PORT', 'Puerto no válido.');
    const app = createOffice({ mode: args[0].slice(2), policyPath: process.env.OFFICE_POLICY, config: process.env });
    app.server.on('error', async () => { console.error('No se puede abrir el servicio. Comprueba la configuración.'); await app.close(); process.exitCode = 1; });
    app.server.listen(port, app.bind, () => console.log(`Office ${VERSION} · ${args[0].slice(2)} · ${process.env.OFFICE_PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
  } catch (error) { console.error(error instanceof OfficeError ? error.message : 'Configuración no válida.'); process.exitCode = 1; }
}
