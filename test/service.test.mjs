import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
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
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url)), '--demo'], {
    env: { ...env, OFFICE_PORT: String(port), ...config }, stdio: ['ignore', 'pipe', 'pipe'],
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
  return { ...ready, request, output: () => output };
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
