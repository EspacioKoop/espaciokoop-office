# Interfaz de agencia: avatares y secciones

Base `6066dc32ac1c81a328a8e32df36afc9887aa0cb3`. El backend se integra por separado. La interfaz no crea datos de demostración de agencia ni conecta ejecutores.

La vista usa el snapshot autorizado para agentes y secciones; ofrece incorporación, retirada, creación de secciones y asignación mediante arrastre o selector. Las escrituras llevan identificador y versión, y esperan una lectura posterior; un conflicto provoca lectura, no reintento. Un 401 retira la vista. Los avatares representan datos observados, no actividad inferida. El acceso de ayuda usa la página de estado existente y Opinar enlaza al debate del proyecto.

## Comprobación

- Node `22.23.2`, `npm ci` con el lock existente y `NODE_OPTIONS=--max-old-space-size=1024`: instalación correcta.
- `npm run check`: 77 módulos, sin errores. Después se ajustó únicamente la prueba de navegador.
- `node --test test/team-queue-ui.test.mjs test/presence-ui.test.mjs`: 21/21.
- `node --test test/agency-ui-browser.test.mjs` con Playwright instalado fuera del proyecto y Chromium local: recorrido sintético correcto, tanto con WebGL desactivado como con SwiftShader. Dos propietarios, incorporación, arrastre 2D, conflicto 409, denegación 403, selector por teclado, creación de sección, respuesta 202 sin confirmación, 401, móvil de 360 px y vuelta a 2D sin WebGL. El 3D se montó con SwiftShader; la selección y arrastre 3D aún no se han acreditado en navegador.
- `npm test` se ejecutó una vez y quedó **incompleto**: Chromium no pudo arrancar porque la ruta del socket en el TMPDIR solicitado era demasiado larga; el servidor de prueba permaneció abierto y se interrumpió la ejecución. Después se corrigió la limpieza del servidor de prueba y se verificó la prueba focal usando un enlace corto al mismo TMPDIR autorizado. No se ha repetido la suite completa.

Capturas y recibos sintéticos en `local/agentes/office-ui-avatares-arrastre-real-20261102-0058-remoto/` del repositorio de trabajo principal. El mock no acredita persistencia ni integración HTTP con el backend real. Antes de integrar falta repetir la suite completa sobre el candidato final y probar selección y arrastre 3D, además del recorrido HTTP persistente por el integrador.

## Para la memoria

- Chromium puede fallar al arrancar cuando el TMPDIR largo supera el límite de longitud del socket Unix; un enlace corto al mismo directorio permitió ejecutar el recorrido focal.
- El contrato de esta fase deja la creación y conexión de agentes fuera de la interfaz operativa; una respuesta 202 solo acredita recepción, no creación.
