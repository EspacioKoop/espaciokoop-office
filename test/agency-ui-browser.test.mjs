import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Opt-in: Playwright is installed outside the product lock; all data is synthetic.
test('agency: recorrido HTTP sintético en Chromium', { skip: !process.env.OFFICE_PLAYWRIGHT, timeout: 60000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.OFFICE_PLAYWRIGHT).href);
  let mode = 200; const writes = []; const sockets = new Set();
  const agents = [
    { id: 'a', name: 'Alba', owner_id: 'one', runtime: 'hermes', in_office: false, section_id: null, status: 'online', job_id: null, last_seen_at: '2026-01-01', capabilities: [], version: 1 },
    { id: 'b', name: 'Bruno', owner_id: 'two', runtime: 'claude-code', in_office: true, section_id: null, status: 'offline', job_id: null, last_seen_at: '2026-01-01', capabilities: [], version: 1 }
  ];
  const sections = [{ id: 's1', name: 'Taller' }, { id: 's2', name: 'Estudio' }];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'); const owner = req.headers.cookie?.includes('two') ? 'two' : 'one';
    const send = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/api/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); res.write(': ready\n\n'); return; }
    if (url.pathname === '/api/info') return send({ mode: 'demo', presenceConfigured: false });
    if (url.pathname === '/api/session') { let body = ''; for await (const c of req) body += c; res.setHeader('set-cookie', `owner=${JSON.parse(body).key === 'demo-marea' ? 'two' : 'one'}; Path=/`); return send({}); }
    if (url.pathname === '/api/snapshot' && !req.headers.cookie) return send({ error: 'AUTH' }, 401);
    if (url.pathname === '/api/snapshot') return send({ mode: 'live', memberId: owner, generatedAt: Date.now(), expiresAt: Date.now() + 120000, members: [{ id: owner, label: 'Equipo', githubLogin: 'synthetic' }], projects: [], demo: null });
    if (url.pathname === '/api/queue') return send({ memberId: owner, expiresAt: Date.now() + 120000, queue: [] });
    if (url.pathname === '/api/agency' && req.method === 'GET') return send({ version: 1, revision: 1, owner_id: owner, agents, jobs: [], sections, learnings: [], connectors: [], capabilities: { create_agent: false, connect_agent: false, assign: true }, observed_at: 'synthetic' });
    if (url.pathname.startsWith('/api/agency/') && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c; const payload = JSON.parse(raw); writes.push({ path: url.pathname, payload, owner });
      const result = mode; mode = 200;
      if (result !== 200) return send({ message: 'synthetic' }, result);
      if (url.pathname.endsWith('/membership')) { agents[0].in_office = payload.in_office; if (!payload.in_office) agents[0].section_id = null; agents[0].version++; }
      if (url.pathname.endsWith('/assign')) { agents[0].section_id = payload.section_id; agents[0].version++; }
      if (url.pathname.endsWith('/sections')) sections.push({ id: 's3', name: payload.name });
      return send({});
    }
    try { const path = resolve('web', `.${url.pathname === '/' ? '/index.html' : url.pathname}`); if (!path.startsWith(resolve('web') + '/')) throw Error(); const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }; const data = await readFile(path); res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end(); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.OFFICE_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox', ...(process.env.OFFICE_WEBGL ? ['--enable-unsafe-swiftshader'] : ['--disable-webgl'])], env: { ...process.env, TMPDIR: process.env.OFFICE_BROWSER_TMP || process.env.TMPDIR || '/tmp' } });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(5000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Entrar como Aurora' }).click();
    const card = page.locator('[data-agent-id="a"]');
    await card.getByRole('button', { name: 'Incorporar' }).click();
    await card.getByRole('button', { name: 'Retirar' }).waitFor();
    await card.locator('.agency-avatar').dragTo(page.locator('[data-section-id="s1"]'));
    await page.locator('[data-section-id="s1"]').getByText('Alba').waitFor();
    assert.equal(writes.at(-1).payload.expected_version, 2); assert.equal(writes.at(-1).payload.job_id, null);
    assert.ok(writes.at(-1).payload.operation_id); assert.notEqual(writes[0].payload.operation_id, writes[1].payload.operation_id);
    mode = 409; await card.locator('.agency-avatar').dragTo(page.locator('[data-section-id="s2"]'));
    await page.getByText(/Conflicto:/).waitFor(); assert.equal(agents[0].section_id, 's1');
    mode = 403; await card.locator('select').selectOption('s2'); await card.getByRole('button', { name: 'Asignar' }).click();
    await page.getByText(/Operación denegada/).waitFor(); assert.equal(agents[0].section_id, 's1');
    await card.locator('select').selectOption('s2'); await card.getByRole('button', { name: 'Asignar' }).focus(); await page.keyboard.press('Enter');
    await page.locator('[data-section-id="s2"]').getByText('Alba').waitFor();
    await page.getByLabel('Nombre de la sección').fill('Laboratorio'); await page.getByRole('button', { name: 'Crear sección' }).click();
    await page.locator('[data-section-id="s3"]').getByText('Laboratorio').waitFor();
    mode = 202; await page.getByLabel('Nombre de la sección').fill('Pendiente'); await page.getByRole('button', { name: 'Crear sección' }).click();
    await page.getByText(/Solicitud recibida/).waitFor(); assert.equal(await page.locator('[data-section-id]').filter({ hasText: 'Pendiente' }).count(), 0);
    mode = 202; await card.getByRole('button', { name: 'Retirar' }).click();
    await page.getByText(/Solicitud recibida/).waitFor(); await card.getByRole('button', { name: 'Retirar' }).waitFor();
    await page.getByRole('button', { name: 'Ver oficina en 3D' }).click();
    if (process.env.OFFICE_WEBGL) await page.locator('.scene-stage canvas').waitFor();
    else await page.getByText(/No se puede mostrar la vista 3D/).waitFor();
    if (process.env.OFFICE_ARTIFACTS && !process.env.OFFICE_WEBGL) await page.screenshot({ path: `${process.env.OFFICE_ARTIFACTS}/escritorio.png`, fullPage: true });
    const mobile = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    await mobile.goto(`http://127.0.0.1:${server.address().port}`); await mobile.getByRole('button', { name: 'Entrar como Marea' }).click();
    await mobile.locator('[data-agent-id="b"] strong').waitFor();
    assert.equal(await mobile.locator('[data-agent-id="a"] button:has-text("Retirar")').count(), 0);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.OFFICE_ARTIFACTS && !process.env.OFFICE_WEBGL) await mobile.screenshot({ path: `${process.env.OFFICE_ARTIFACTS}/movil.png`, fullPage: true });
    mode = 401; await card.getByRole('button', { name: 'Retirar' }).click();
    await page.getByText(/La sesión ha caducado/).waitFor(); assert.equal(await page.locator('[data-agent-id]').count(), 0);
    assert.equal(await page.locator('#office-view').textContent(), '');
  } finally { if (browser) await browser.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolveClose => server.close(resolveClose)); }
});
