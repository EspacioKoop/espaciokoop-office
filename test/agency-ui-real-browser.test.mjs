import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOffice } from '../src/server.mjs';

test('navegador y Office real: agencia persistente y aislamiento', { skip: !process.env.OFFICE_PLAYWRIGHT, timeout: 90000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.OFFICE_PLAYWRIGHT).href);
  const dir = mkdtempSync(join(tmpdir(), 'office-real-')); let app; let browser;
  async function start(port = 0) {
    app = createOffice({ mode: 'demo', config: { OFFICE_AGENCY_DIR: dir } });
    await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
    return `http://127.0.0.1:${app.server.address().port}`;
  }
  try {
    const origin = await start();
    async function request(path, data, headers = {}) {
      const res = await fetch(origin + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
    }
    const a = (await request('/api/session', { key: 'demo-aurora' })).cookie;
    const b = (await request('/api/session', { key: 'demo-marea' })).cookie;
    const connector = (await request('/api/agency/connectors', { operation_id: 'connector', runtime: 'hermes' }, { cookie: a })).body;
    assert.equal((await request('/api/agency/connectors/agents', { operation_id: 'report', agents: [{ agent_ref: 'sintetico', name: 'Alba sintética', status: 'available', capabilities: [] }] }, { authorization: `Bearer ${connector.token}` })).status, 200);
    const agent = (await request('/api/agency', undefined, { cookie: a })).body.agents[0];
    browser = await chromium.launch({ executablePath: process.env.OFFICE_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox', ...(process.env.OFFICE_WEBGL ? ['--enable-unsafe-swiftshader'] : ['--disable-webgl'])] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(8000);
    await page.goto(origin); await page.getByRole('button', { name: 'Entrar como Aurora' }).click();
    const card = page.locator(`[data-agent-id="${agent.id}"]`); await card.getByRole('button', { name: 'Incorporar' }).click(); await card.getByRole('button', { name: 'Retirar' }).waitFor();
    await page.getByLabel('Nombre de la sección').fill('Taller sintético'); await page.getByRole('button', { name: 'Crear sección' }).click();
    const zone = page.locator('[data-section-id]').filter({ hasText: 'Taller sintético' }); await zone.waitFor();
    await card.locator('.agency-avatar').dragTo(zone); await zone.getByText('Alba sintética').waitFor();
    await page.getByLabel('Nombre de la sección').fill('Estudio sintético'); await page.getByRole('button', { name: 'Crear sección' }).click();
    const second = page.locator('[data-section-id]').filter({ hasText: 'Estudio sintético' }); await second.waitFor();
    await card.locator('select').selectOption({ label: 'Estudio sintético' }); await card.getByRole('button', { name: 'Asignar' }).click(); await second.getByText('Alba sintética').waitFor();
    if (process.env.OFFICE_WEBGL) {
      await page.getByRole('button', { name: 'Ver oficina en 3D' }).click();
      const canvas = page.locator('.scene-stage canvas'); await canvas.waitFor(); await canvas.scrollIntoViewIfNeeded();
      async function coordinates(sectionId) {
        const state = (await request('/api/agency', undefined, { cookie: a })).body;
        return page.evaluate(async ({ sections, agent, sectionId }) => {
          const THREE = await import('/vendor/three.module.min.js');
          const rect = document.querySelector('.scene-stage canvas').getBoundingClientRect();
          const aspect = rect.width / rect.height;
          const camera = new THREE.OrthographicCamera(-6 * aspect, 6 * aspect, 6, -6, 0.1, 100);
          camera.position.set(16 * Math.sin(Math.PI / 4), 14, 16 * Math.cos(Math.PI / 4)); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
          const columns = Math.ceil(Math.sqrt(sections.length)), rows = Math.ceil(sections.length / columns);
          const pos = id => { const i = sections.findIndex(s => s.id === id); return { x: -5.5 + (i % columns + 0.5) * 11 / columns, z: -3.4 + (Math.floor(i / columns) + 0.5) * 6.8 / rows }; };
          const project = (p, y, dx = 0) => { const v = new THREE.Vector3(p.x + dx, y, p.z).project(camera); return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2 }; };
          return { person: project(pos(agent.section_id), 0.5, -0.35), target: project(pos(sectionId), 0.06) };
        }, { sections: state.sections, agent: state.agents[0], sectionId });
      }
      const destination = await zone.getAttribute('data-section-id'); let points = await coordinates(destination);
      let writes = 0; page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/assign')) writes++; });
      await page.mouse.move(points.person.x, points.person.y); await page.mouse.down();
      await canvas.dispatchEvent('pointercancel'); await page.mouse.move(points.target.x, points.target.y); await page.mouse.up(); assert.equal(writes, 0);
      await page.mouse.click(points.person.x, points.person.y); await card.locator('.agency-avatar[aria-pressed="true"]').waitFor();
      await canvas.waitFor(); points = await coordinates(destination);
      await page.mouse.move(points.person.x, points.person.y); await page.mouse.down(); await page.mouse.move(points.target.x, points.target.y, { steps: 5 }); await page.mouse.up();
      await zone.getByText('Alba sintética').waitFor(); assert.equal(writes, 1);
      await card.locator('select').selectOption({ label: 'Estudio sintético' }); await card.getByRole('button', { name: 'Asignar' }).click(); await second.getByText('Alba sintética').waitFor();
      if (process.env.OFFICE_ARTIFACTS) await page.screenshot({ path: `${process.env.OFFICE_ARTIFACTS}/real-3d.png`, fullPage: true });
    } else {
      await page.getByRole('button', { name: 'Ver oficina en 3D' }).click(); await page.getByText(/No se puede mostrar la vista 3D/).waitFor();
    }
    await page.reload(); await second.getByText('Alba sintética').waitFor();
    let snap = (await request('/api/agency', undefined, { cookie: a })).body; const current = snap.agents[0];
    const forbidden = await request(`/api/agency/agents/${agent.id}/membership`, { operation_id: 'forbidden', in_office: false, expected_version: current.version }, { cookie: b });
    assert.equal(forbidden.status, 403); assert.equal((await request('/api/agency', undefined, { cookie: a })).body.agents[0].version, current.version);
    const firstId = await zone.getAttribute('data-section-id');
    assert.equal((await request(`/api/agency/agents/${agent.id}/assign`, { operation_id: 'concurrent', section_id: firstId, job_id: null, expected_version: current.version }, { cookie: a })).status, 200);
    let attempts = 0; page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/assign')) attempts++; });
    await card.locator('select').selectOption({ label: 'Estudio sintético' }); await card.getByRole('button', { name: 'Asignar' }).click();
    await page.getByText(/Conflicto:/).waitFor(); await zone.getByText('Alba sintética').waitFor(); assert.equal(attempts, 1);
    const port = app.server.address().port; await app.close(); app = null; await start(port);
    await page.reload(); await page.getByRole('button', { name: 'Entrar como Aurora' }).click(); await zone.getByText('Alba sintética').waitFor();
    const mobile = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    await mobile.goto(origin); await mobile.getByRole('button', { name: 'Entrar como Marea' }).click(); await mobile.getByText('Aún no hay agentes visibles.').waitFor();
    assert.equal(await mobile.getByText('Alba sintética').count(), 0); assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.OFFICE_ARTIFACTS) { await page.screenshot({ path: `${process.env.OFFICE_ARTIFACTS}/real-escritorio.png`, fullPage: true }); await mobile.screenshot({ path: `${process.env.OFFICE_ARTIFACTS}/real-movil.png`, fullPage: true }); }
    await page.bringToFront(); await card.locator('.agency-avatar').click(); await card.locator('.agency-avatar[aria-pressed="true"]').waitFor();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click(); await page.getByText('Sesión cerrada.').waitFor();
    assert.equal(await page.locator('[data-agent-id]').count(), 0);
    await page.getByRole('button', { name: 'Entrar como Aurora' }).click(); await card.locator('.agency-avatar[aria-pressed="false"]').waitFor();
    await page.context().clearCookies();
    await card.getByRole('button', { name: 'Retirar' }).click(); await page.getByText(/La sesión ha caducado/).waitFor(); assert.equal(await page.locator('[data-agent-id]').count(), 0);
  } finally { await browser?.close(); await app?.close(); rmSync(dir, { recursive: true, force: true }); }
});
