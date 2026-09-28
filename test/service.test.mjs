import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function launch(t, config = {}) {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('OFFICE_')));
  // Bound child thread pools; simultaneous test files also have Node pools.
  const child = spawn(process.execPath, ['--v8-pool-size=1', fileURLToPath(new URL('../src/server.mjs', import.meta.url)), '--demo'], {
    env: { ...env, UV_THREADPOOL_SIZE: '1', OFFICE_PORT: String(port), ...config }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited; });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Startup timeout')); }, 5000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); resolve({ started: false, code }); });
    child.stdout.on('data', () => { if (output.includes('Office 1.0.0-rc.1')) { clearTimeout(timer); resolve({ started: true }); } });
  });
  function request(path, { data, headers = {}, tls = false, ca } = {}) {
    const origin = config.OFFICE_PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
    return new Promise((resolve, reject) => {
      const req = (tls ? httpsRequest : httpRequest)({ hostname: '127.0.0.1', port, path,
        servername: 'oficina.ejemplo', ca,
        method: data === undefined ? 'GET' : 'POST',
        headers: { host: new URL(origin).host, ...(data === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers },
      }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.setTimeout(3000, () => req.destroy(new Error('Request timeout')));
      req.on('error', reject); req.end(data === undefined ? undefined : JSON.stringify(data));
    });
  }
  return { ...ready, request, port, output: () => output };
}

// Do not half-close the client when the peer sends FIN. Keep trying to upload
// after the complete response, so a header/FIN without stopping reads cannot
// masquerade as a closed server socket. The upload is bounded to 1 MiB.
async function rejectedUpload(t, port, { path, method = 'POST', headers = {}, chunked, initial = '' }) {
  const socket = createConnection({ host: '127.0.0.1', port, allowHalfOpen: true });
  t.after(() => socket.destroy());
  const encode = data => chunked ? `${Buffer.byteLength(data).toString(16)}\r\n${data}\r\n` : data;
  let text = ''; let bytesAfterResponse = 0; let complete = false; let forced = false; let error;
  let sender;
  const result = new Promise(resolve => {
    const timer = setTimeout(() => { forced = true; socket.destroy(); }, 3000);
    socket.on('error', e => { error = e.code; });
    socket.on('close', () => {
      clearTimeout(timer); clearInterval(sender);
      resolve({ text, complete, forced, bytesAfterResponse, error });
    });
    socket.on('data', data => {
      text += data.toString('utf8');
      const split = text.indexOf('\r\n\r\n');
      if (split < 0 || complete) return;
      const head = text.slice(0, split); const body = text.slice(split + 4);
      const length = /\r\ncontent-length:\s*(\d+)/i.exec(head)?.[1];
      complete = length !== undefined ? Buffer.byteLength(body) >= Number(length) : /\r\n0\r\n\r\n$/.test(body);
      if (!complete) return;
      sender = setInterval(() => {
        if (bytesAfterResponse >= 1024 * 1024) { forced = true; socket.destroy(); return; }
        if (!socket.destroyed) {
          const chunk = 'x'.repeat(16384);
          bytesAfterResponse += Buffer.byteLength(chunk);
          socket.write(encode(chunk));
        }
      }, 2);
    });
    socket.once('connect', () => {
      const all = { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}`,
        Connection: 'keep-alive', 'Content-Type': 'application/json',
        ...(chunked ? { 'Transfer-Encoding': 'chunked' } : { 'Content-Length': 50 * 1024 * 1024 }), ...headers };
      socket.write(`${method} ${path} HTTP/1.1\r\n${Object.entries(all).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n${initial ? encode(initial) : ''}`);
    });
  });
  return result;
}

for (const chunked of [false, true]) {
  for (const scenario of [
    { name: 'AUTH núcleo', path: '/api/logout', status: 401, code: 'AUTH' },
    { name: 'AUTH comando espacio', path: '/api/space/command', status: 401, code: 'AUTH' },
    { name: 'AUTH lectura espacio', path: '/api/space', method: 'GET', status: 401, code: 'AUTH' },
    { name: 'HOST núcleo', path: '/api/session', headers: { Host: 'ajena.ejemplo' }, status: 403, code: 'HOST' },
    { name: 'ORIGIN espacio', path: '/api/space/command', headers: { Origin: 'https://ajena.ejemplo' }, status: 403, code: 'ORIGIN' },
    { name: 'tipo núcleo', path: '/api/session', headers: { 'Content-Type': 'text/plain' }, status: 415, code: 'CONTENT_TYPE' },
    { name: 'tipo espacio', path: '/api/space/command', login: true, headers: { 'Content-Type': 'text/plain' }, status: 415, code: 'CONTENT_TYPE' },
    { name: 'límite núcleo', path: '/api/session', initial: 'x'.repeat(4096), status: 413, code: 'BODY_LIMIT' },
    { name: 'límite espacio', path: '/api/space/command', login: true, initial: 'x'.repeat(4096), status: 413, code: 'BODY_LIMIT' },
    { name: 'FORBIDDEN espacio', path: '/api/space/command', login: true, config: { OFFICE_SPACE_PROJECT: 'demo/archivo' }, status: 403, code: 'FORBIDDEN' },
    { name: 'ruta núcleo', path: '/api/unknown', login: true, status: 404, code: 'NOT_FOUND' },
    { name: 'intentos núcleo', path: '/api/session', rateLimit: true, status: 429, code: 'RATE_LIMIT' },
  ]) test(`regresión r3: cuerpo ${chunked ? 'chunked' : '50 MiB'} rechazado (${scenario.name}) cierra el socket`, async t => {
    const app = await launch(t, scenario.config); assert.equal(app.started, true, app.output());
    const headers = { ...scenario.headers };
    if (scenario.login) {
      const login = await app.request('/api/session', { data: { key: 'demo-marea' } });
      assert.equal(login.status, 200); headers.Cookie = login.headers['set-cookie'][0].split(';')[0];
    }
    if (scenario.rateLimit) for (let i = 0; i < 20; i++) {
      assert.equal((await app.request('/api/session', { data: { key: 'wrong' } })).status, 401);
    }
    const result = await rejectedUpload(t, app.port, { ...scenario, headers, chunked });
    assert.equal(result.complete, true, 'el error HTTP debe llegar completo antes del cierre');
    assert.match(result.text, new RegExp(`^HTTP/1.1 ${scenario.status} `));
    assert.match(result.text, new RegExp(`"error":"${scenario.code}"`));
    assert.equal(result.forced, false, `el servidor seguía aceptando datos: ${result.bytesAfterResponse} bytes`);
    assert.ok(result.bytesAfterResponse < 1024 * 1024, 'cierre antes de 1 MiB tras la respuesta');
    assert.match(result.text, /\r\nconnection: close\r\n/i);
    assert.ok(!result.error || ['ECONNRESET', 'EPIPE'].includes(result.error), result.error);
    t.diagnostic(`bytes intentados después de la respuesta: ${result.bytesAfterResponse}`);
  });
}

test('servicio: origen configurado admite Host propio y rechaza Host/origen ajenos', async t => {
  const app = await launch(t, { OFFICE_PUBLIC_ORIGIN: 'https://oficina.ejemplo' });
  assert.equal(app.started, true);
  assert.equal((await app.request('/api/info')).status, 200);
  assert.equal((await app.request('/api/info', { headers: { host: 'ajena.ejemplo', 'x-forwarded-host': 'oficina.ejemplo' } })).status, 403);
  assert.equal((await app.request('/api/session', { data: { key: 'demo-aurora' }, headers: { origin: 'https://ajena.ejemplo' } })).status, 403);
  assert.equal((await app.request('/api/session', { data: { key: 'demo-aurora' }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await app.request('/api/session', { data: { key: 'demo-aurora' }, headers: { origin: 'null', 'x-forwarded-proto': 'https' } })).status, 403);
});

test('servicio: https configura Secure al entrar y salir para ambos principales', async t => {
  const app = await launch(t, { OFFICE_PUBLIC_ORIGIN: 'https://oficina.ejemplo' });
  assert.equal(app.started, true);
  for (const member of ['aurora', 'marea']) {
    const login = await app.request('/api/session', { data: { key: `demo-${member}` } });
    assert.equal(login.status, 200); assert.equal(JSON.parse(login.body).memberId, member);
    assert.match(login.headers['set-cookie'][0], /; Secure/);
    assert.match(login.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
    const logout = await app.request('/api/logout', { data: {}, headers: { cookie: login.headers['set-cookie'][0].split(';')[0] } });
    assert.equal(logout.status, 200); assert.match(logout.headers['set-cookie'][0], /Max-Age=0; Secure/);
  }
});

test('servicio: bind no-loopback sin TLS falla cerrado incluso con origen https', async t => {
  const app = await launch(t, { OFFICE_BIND: '0.0.0.0', OFFICE_PUBLIC_ORIGIN: 'https://oficina.ejemplo' });
  assert.equal(app.started, false); assert.equal(app.code, 1);
  assert.match(app.output(), /túnel cifrado privado/);
});

test('servicio: bandera explícita permite bind no-loopback solo durante la prueba', async t => {
  const app = await launch(t, { OFFICE_BIND: '0.0.0.0', OFFICE_PRIVATE_TUNNEL: '1', OFFICE_PUBLIC_ORIGIN: 'http://oficina.ejemplo' });
  assert.equal(app.started, true);
  assert.equal((await app.request('/api/info')).status, 200);
  const login = await app.request('/api/session', { data: { key: 'demo-marea' } });
  assert.equal(login.status, 200); assert.doesNotMatch(login.headers['set-cookie'][0], /Secure/);
});

for (const [name, config] of [
  ['bandera no explícita', { OFFICE_BIND: '0.0.0.0', OFFICE_PRIVATE_TUNNEL: 'true', OFFICE_PUBLIC_ORIGIN: 'http://oficina.ejemplo' }],
  ['falta origen fuera de loopback', { OFFICE_BIND: '0.0.0.0', OFFICE_PRIVATE_TUNNEL: '1' }],
  ['ruta en origen', { OFFICE_PUBLIC_ORIGIN: 'https://oficina.ejemplo/office' }],
  ['credenciales en origen', { OFFICE_PUBLIC_ORIGIN: 'https://example:example@oficina.ejemplo' }],
  ['esquema no HTTP', { OFFICE_PUBLIC_ORIGIN: 'file://oficina.ejemplo' }],
  ['bind ambiguo', { OFFICE_BIND: 'example' }],
  ['TLS incompleto', { OFFICE_PUBLIC_ORIGIN: 'https://oficina.ejemplo', OFFICE_TLS_CERT: 'example' }],
]) test(`servicio: configuración inválida (${name}) no arranca`, async t => {
  const app = await launch(t, config);
  assert.equal(app.started, false); assert.equal(app.code, 1);
  assert.doesNotMatch(app.output(), /ENOENT|stack|example:example/);
});

test('servicio: HTTPS nativo con certificado efímero verificado, sin credenciales reales', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-tls-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = join(directory, 'key.pem'); const cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=oficina.ejemplo', '-addext', 'subjectAltName=DNS:oficina.ejemplo', '-keyout', key, '-out', cert], { stdio: 'ignore', timeout: 15000 });
  const app = await launch(t, { OFFICE_PUBLIC_ORIGIN: 'https://oficina.ejemplo', OFFICE_TLS_KEY: key, OFFICE_TLS_CERT: cert });
  assert.equal(app.started, true);
  const ca = await readFile(cert);
  const result = await app.request('/api/session', { tls: true, ca, data: { key: 'demo-aurora' } });
  assert.equal(result.status, 200); assert.match(result.headers['set-cookie'][0], /Secure/);
  assert.equal((await app.request('/api/info', { tls: true, ca, headers: { host: 'ajena.ejemplo' } })).status, 403);
});

test('cobertura local: sin configuración mantiene HTTP y los dos principales en proceso hijo', async t => {
  const app = await launch(t);
  assert.equal(app.started, true);
  for (const member of ['aurora', 'marea']) {
    const result = await app.request('/api/session', { data: { key: `demo-${member}` } });
    assert.equal(result.status, 200); assert.doesNotMatch(result.headers['set-cookie'][0], /Secure/);
    assert.equal(JSON.parse(result.body).memberId, member);
  }
});
