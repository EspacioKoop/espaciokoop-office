"""Recorrido visual local. Requiere Python Playwright y Chromium ya instalados.
No instala paquetes, no consulta sitios externos y no usa credenciales reales.
Ejecutar desde la raíz: python tools/browser-check.py
"""
from pathlib import Path
import json
import base64
import http.cookiejar
import urllib.error
import os
import shutil
import subprocess
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
out = root / 'assets' / 'screenshots'
out.mkdir(parents=True, exist_ok=True)
port = 4191
origin = f'http://127.0.0.1:{port}'
server = subprocess.Popen(['node', 'src/server.mjs', '--demo'], cwd=root, env={**os.environ, 'OFFICE_PORT': str(port)}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
checks = []
errors = []
external = []
try:
    for attempt in range(50):
        if server.poll() is not None:
            raise RuntimeError('El servidor de prueba no pudo arrancar.')
        try:
            urllib.request.urlopen(origin + '/api/info', timeout=1).close()
            break
        except OSError:
            time.sleep(0.1)
    else:
        raise RuntimeError('No responde el servidor local de prueba.')
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1120}, locale='es-ES', reduced_motion='reduce')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        def route(request):
            if not request.request.url.startswith(origin + '/'):
                external.append(request.request.url)
                request.abort()
            else:
                request.continue_()
        page.route('**/*', route)
        bridge_mode = os.environ.get('OFFICE_BROWSER_BRIDGE') == '1'
        if bridge_mode:
            # Solo para entornos que permiten renderizar pero no navegar en Chromium.
            # Las peticiones van al servidor real de loopback, no a fixtures del navegador.
            # No valida cookies/origen/CSP/SSE nativos del navegador: lo declara el informe.
            jar = http.cookiejar.CookieJar()
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            def bridge(path, options):
                assert path in ['/api/info', '/api/session', '/api/snapshot', '/api/logout', '/api/demo/advance']
                headers = {'origin': origin, 'content-type': 'application/json'}
                payload = options.get('body')
                request = urllib.request.Request(origin + path, data=payload.encode() if payload is not None else None, headers=headers, method=options.get('method', 'GET'))
                try:
                    result = client.open(request, timeout=12)
                except urllib.error.HTTPError as error:
                    result = error
                with result:
                    return {'status': result.status, 'body': result.read().decode()}
            page.expose_function('__officeBridge', bridge)
            html = (root / 'web' / 'index.html').read_text(encoding='utf-8')
            html = html.replace('<link rel="stylesheet" href="/style.css">', '<style>' + (root / 'web' / 'style.css').read_text() + '</style>')
            html = html.replace('<script type="module" src="/app.mjs"></script>', '')
            page.set_content(html)
            svg = 'data:image/svg+xml;base64,' + base64.b64encode((root / 'web' / 'office.svg').read_bytes()).decode()
            page.evaluate("""svg => {
                window.fetch = async (path, options = {}) => {
                    const r = await window.__officeBridge(path, options);
                    return new Response(r.body, {status: r.status, headers: {'content-type':'application/json'}});
                };
                window.EventSource = class extends EventTarget { close() {} };
                const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
                Object.defineProperty(HTMLImageElement.prototype, 'src', {
                    get: original.get,
                    set(value) { original.set.call(this, value === '/office.svg' ? svg : value); }
                });
            }""", svg)
            page.evaluate('(async () => {' + (root / 'web' / 'app.mjs').read_text() + '})()')
        else:
            page.goto(origin, wait_until='domcontentloaded')
        page.get_by_role('button', name='Entrar como Aurora').click()
        expect(page.locator('#account-name')).to_have_text('Equipo Aurora')
        expect(page.locator('#office-view .project-card')).to_have_count(2)
        expect(page.locator('#notice')).to_contain_text('Datos sintéticos')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(out / 'office-desktop.png'), full_page=True)
        checks.append('Inicio, dos proyectos, aviso sintético y escritorio sin desbordamiento')
        page.locator('#office-view').get_by_role('button', name='#11 Compartir una comprobación de accesibilidad Solicitada').click()
        expect(page.locator('#detail')).to_be_visible()
        expect(page.locator('#detail .chain-step.confirmed')).to_have_count(1)
        page.keyboard.press('Escape')
        expect(page.locator('#detail')).not_to_be_visible()
        checks.append('Detalle semántico y cierre con Escape')
        page.get_by_role('button', name='Cambiar a Marea').click()
        expect(page.locator('#account-name')).to_have_text('Equipo Marea')
        expect(page.locator('#office-view .project-card')).to_have_count(1)
        assert 'demo/archivo' not in page.content()
        checks.append('Marea no recibe ni representa el proyecto privado de Aurora')
        page.get_by_role('button', name='Aceptar ejemplo').click()
        page.locator('#office-view').get_by_role('button', name='#11 Compartir una comprobación de accesibilidad Aceptada').click()
        expect(page.locator('#detail .pill')).to_have_text('Aceptada')
        status = page.evaluate("""async () => (await fetch('/api/demo/advance', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({version: 1}) })).status""")
        assert status == 200
        expect(page.locator('#detail .pill')).to_have_text('Entregada', timeout=12000)
        checks.append('El detalle abierto se actualiza al cambiar la evidencia de origen')
        page.get_by_role('button', name='Cerrar detalle').click()
        page.get_by_role('button', name='Cambiar a Aurora').click()
        expect(page.locator('#account-name')).to_have_text('Equipo Aurora')
        page.get_by_role('button', name='Revisar ejemplo').click()
        expect(page.locator('#office-view .flow-panel')).to_contain_text('Cadena sintética completa')
        checks.append('Cadena bilateral sintética completa con dos identidades de prueba')
        page.get_by_role('button', name='Trabajo y evidencias').click()
        page.get_by_role('searchbox', name='Buscar tarea').fill('#11')
        expect(page.locator('#board .task-button')).to_have_count(1)
        page.locator('#board .task-button').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#detail .chain-step.confirmed')).to_have_count(4)
        page.screenshot(path=str(out / 'office-evidence.png'), full_page=True)
        page.keyboard.press('Escape')
        page.get_by_role('searchbox', name='Buscar tarea').fill('')
        page.screenshot(path=str(out / 'office-board.png'), full_page=True)
        checks.append('Búsqueda, apertura por teclado, cuatro evidencias y tablero')
        page.get_by_role('button', name='La oficina', exact=True).click()
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(out / 'office-mobile.png'), full_page=True)
        checks.append('Vista móvil de 390 píxeles sin desbordamiento horizontal')
        context.set_offline(True)
        expect(page.locator('#office-view')).to_be_hidden()
        assert 'demo/observatorio' not in page.content()
        if not bridge_mode:
            assert not page.evaluate('localStorage.length || sessionStorage.length')
        checks.append('Desconexión vacía el DOM de tareas')
        context.set_offline(False)
        browser.close()
    assert not external, external
    assert not errors, errors
    report = {'checks': checks, 'passed': len(checks), 'javascript_errors': errors, 'external_requests': external, 'mode': 'synthetic-only', 'transport': 'loopback-bridge' if bridge_mode else 'native-http', 'native_browser_security_verified': not bridge_mode, 'browser': 'Chromium', 'viewport': [1440, 1120], 'mobile': [390, 844]}
    (out / 'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=5)
