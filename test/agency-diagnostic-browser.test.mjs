import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOffice } from '../src/server.mjs';

test('ficha sintética explica el diagnóstico en Chromium sin WebGL', {skip: !process.env.OFFICE_PLAYWRIGHT, timeout:60000}, async () => {
  const {chromium} = await import(pathToFileURL(process.env.OFFICE_PLAYWRIGHT).href);
  const dir=mkdtempSync(join(tmpdir(),'diag-ui-')); let app, browser;
  try {
    app=createOffice({mode:'demo',config:{OFFICE_AGENCY_DIR:dir}});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${app.server.address().port}`;
    async function request(path,data,headers={}) {
      const res=await fetch(origin+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{origin,'content-type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
      return {body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
    }
    const cookie=(await request('/api/session',{key:'demo-aurora'})).cookie;
    const connector=(await request('/api/agency/connectors',{operation_id:'fixture',runtime:'hermes'},{cookie})).body;
    await request('/api/agency/connectors/agents',{operation_id:'report',agents:[{agent_ref:'fixture',name:'Agente sintético',status:'offline',capabilities:[],reason_code:'auth_unavailable'}]},{authorization:`Bearer ${connector.token}`});
    browser=await chromium.launch({executablePath:process.env.OFFICE_CHROMIUM || '/usr/bin/chromium',args:['--no-sandbox','--disable-webgl']});
    const page=await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
    await page.goto(origin); await page.getByRole('button',{name:'Entrar como Aurora'}).click();
    const card=page.locator('.agency-agent').filter({hasText:'Agente sintético'});
    await card.getByText('Falta autenticar el proveedor').waitFor();
    assert.equal(await card.getByRole('button',{name:'Asignar'}).isDisabled(),true);
    await card.getByText('Cómo resolverlo').focus(); await page.keyboard.press('Enter');
    await card.getByText(/El titular debe preparar/).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if (process.env.OFFICE_ARTIFACTS) await card.screenshot({path:join(process.env.OFFICE_ARTIFACTS,'diagnostico-sintetico.png')});
  } finally { await browser?.close(); await app?.close(); rmSync(dir,{recursive:true,force:true}); }
});
