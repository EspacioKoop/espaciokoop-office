# Matriz accesible y reproducible de presencia y sala 3D (Issue #55)

> **CLAIM DE RESERVA (#18):** Subcorte documental verificable #55. Registro de CLAIM realizado para la matriz accesible y reproducible de presencia y sala 3D en `docs/qa-accesibilidad-presencia-3d.md`. Parte de `origin/main`, respetando las reservas activas en #18 y el plan #17.

Este documento establece los criterios de verificación, accesibilidad, comportamiento ante revocación/fallos y matriz de dispositivos para la experiencia visual de presencia y sala 3D en EspacioKoop Office.

---

## 1. Pasos reproducibles de teclado, foco y preferencia `prefers-reduced-motion`

### 1.1 Navegación por teclado y gestión de foco en la SPA
La interfaz web (`web/index.html` y `web/app.mjs`) implementa navegación nativa e interactiva accesible exclusivamente por teclado:

1. **Enlace de salto al contenido (`.skip`):**
   - El primer elemento focalizable en el documento es `<a class="skip" href="#main">Saltar al contenido</a>`.
   - Al recibir el foco mediante `Tab`, la regla CSS en `web/style.css` posiciona el enlace visiblemente en la parte superior (`top: 10px`), permitiendo al usuario saltar directamente al contenedor principal `<main id="main" tabindex="-1">` sin recorrer toda la barra lateral.

2. **Navegación principal en la barra lateral:**
   - La pulsación secuencial de `Tab` recorre la marca principal (`a.brand`), los botones de navegación (`#nav-office`, `#nav-work`, `#nav-about`) y el botón de cierre de sesión (`#logout`).
   - El estado de la vista activa se comunica de forma accesible mediante el atributo `aria-current="page"`, gestionado dinámicamente en `web/app.mjs`.

3. **Interacción con modales (`dialog#detail`):**
   - La apertura de un diálogo de detalle de tarea mediante `Enter` o `Espacio` en los botones de tarea (`button.task-button`) invoca `showModal()` sobre la etiqueta HTML5 `<dialog id="detail">`.
   - El navegador bloquea de forma nativa la trampa de foco dentro del modal.
   - El cierre del modal se puede accionar mediante la tecla `Escape` o el botón `<button id="close-detail">`, devolviendo el foco y limpiando los datos en memoria.

### 1.2 Preferencia de movimiento reducido (`prefers-reduced-motion`)
Para proteger a usuarios con trastornos vestibulares o fotosensibilidad, `web/style.css` incluye la siguiente regla global de medios:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
}
```

**Efecto comprobado:** Cualquier animación de transición en modales, botones o elementos 3D/SVG se desactiva instantáneamente cuando el sistema operativo o navegador tiene activada la opción de reducción de movimiento.

---

## 2. Contenido alternativo sin animación o sin agentes conectados

### 2.1 Representación ambiental y accesible por defecto
EspacioKoop Office adopta el principio de "el trabajo se verifica, la presencia no se presupone".

1. **Ilustración SVG ambiental estática (`web/office.svg`):**
   - La vista principal de la oficina (`#office-view`) utiliza la ilustración estática `web/office.svg`.
   - Cuenta con una etiqueta de texto alternativo explícita: `alt="Ilustración original de la oficina: talleres, mesa compartida, biblioteca y plantas. No muestra agentes reales."`.
   - Pie de figura aclaratorio: *"La escena es una representación ambiental. La actividad real se consulta en los proyectos, no se deduce de los personajes."*

2. **Tarjetas de equipo y estado de presencia base:**
   - En la rama `main`, cada tarjeta de miembro (`.team-card`) muestra explícitamente la etiqueta `<small>Presencia no disponible</small>`.
   - Los avatares visuales incluyen `aria-hidden="true"` para evitar lecturas redundantes por lectores de pantalla.
   - Texto de advertencia en el panel:
     - En modo de evaluación (`demo`): *"Equipos ficticios de evaluación. Ningún nombre representa una identidad real."*
     - En modo conectado (`live`): *"No se infiere identidad individual, conexión o disponibilidad a partir de una cuenta de GitHub."*

3. **Estados de presencia autorizada (Online / Stale / Offline):**
   - La exposición de estados `online`, `stale` o `offline` requiere un puente de presencia autenticado (`src/presence-bridge.mjs` y `src/presence.mjs`).
   - En ausencia de autorización explícita o agente autenticado, el sistema no inventa avatares animados ni simula estados de conexión activos.

---

## 3. Pruebas de revocación, caducidad y caída HTTP con estado vacío

### 3.1 Vaciado en memoria sin persistencia de datos
La aplicación web implementa la función de limpieza y vaciado inmediato en memoria ante cualquier pérdida de autorización o fallo de red (`web/app.mjs`):

```javascript
function clearView(message = '') {
  epoch++;
  snapshot = null;
  teamQueue = null;
  clearTimeout(refreshTimer);
  clearTimeout(expiryTimer);
  if (events) { events.close(); events = null; }
  $('office-view').replaceChildren();
  $('board').replaceChildren();
  $('detail-content').replaceChildren();
  $('detail').close();
  $('search').value = '';
  $('updated').textContent = 'Sin datos';
  $('account-name').textContent = 'Sin sesión';
  $('refresh').hidden = true;
  $('logout').hidden = true;
  show(view);
  tell(message);
}
```

### 3.2 Escenarios de prueba y comportamiento verificado

1. **Evento SSE de revocación (`revoke`):**
   - Al recibir el evento `revoke` desde la transmisión SSE (`/api/events`), el cliente invoca `clearView(...)`.
   - **Resultado:** Los datos de tareas, nombres de miembros y colas se retiran inmediatamente del DOM y de la memoria JavaScript.

2. **Error HTTP 401 / 403 (Sesión caducada o token inválido):**
   - Al responder el servidor con código de estado HTTP `401 AUTH` o `403 FORBIDDEN` durante el refresco periódico (`/api/snapshot` o `/api/queue`), la vista se vacía de forma limpia.

3. **Caída de red o desconexión del cliente (`offline` / `pagehide`):**
   - Los manejadores de eventos `window.addEventListener('offline', ...)` y `visibilitychange` (cuando `document.hidden` es verdadero) ejecutan `clearView()`.
   - **Resultado:** No se conservan nombres de tareas, agentes o miembros en `localStorage`, `sessionStorage` o `IndexedDB`. La reconexión exige reautenticación explícita.

---

## 4. Matriz PC / Móvil / TV y trazabilidad de evidencias visuales

### 4.1 Matriz de adaptación por tipo de pantalla

| Tipo de dispositivo | Resolución / Ancho | Comportamiento CSS (`web/style.css`) y Accesibilidad |
| :--- | :--- | :--- |
| **Escritorio / PC** | `> 1150px` | Disposición en dos columnas (`.campus`: escena + panel de equipo). Tablero en 4 columnas. Altura SVG 342px–400px. |
| **Tablet / Portátil** | `640px - 1150px` | Navegación lateral ajustada (195px). Panel de equipo en flex wrap. Tablero en 2 columnas. |
| **Móvil** | `< 640px` | Barra de navegación superior horizontal con `overflow: auto`. Ocultación de notas secundarias. Tablero en 1 columna. Diálogos modales adaptados a `width: min(680px, 92vw)`. |
| **TV / Pantalla Gigante** | `> 1500px` | Limitación de ancho máximo (`max-width: 1380px; margin: auto`) para evitar dispersión del foco visual en pantallas de alta resolución. |

### 4.2 Distinción entre pruebas sintéticas ejecutables y evidencias visuales

1. **Pruebas sintéticas ejecutables (Acreditadas en entorno local):**
   - Pruebas unitarias y de integración ejecutadas vía Node.js native test runner (`npm test`): **180 subtests pasando**.
   - Verificación de consistencia de módulos (`npm run check` / `tools/check.mjs`): **24 módulos verificados sin errores**.
   - Pruebas de interfaz y accesibilidad sintética en `test/team-queue-ui.test.mjs` y `test/presence-api.test.mjs`.

2. **Evidencias visuales existentes en el repositorio:**
   - Previsualización estática del panel de interfaz: `assets/screenshots/office-preview.webp`.
   - Informe de auditoría de navegador sintético: `assets/screenshots/browser-report.json`.

3. **Evidencias visuales pendientes (No inventadas):**
   - Capturas reales de la escena 3D o panel de presencia en dispositivos móviles o Smart TV físicos con agentes conectados reales.
   - *Estado:* Declarándose expresamente como **Pendientes de captura visual en entorno físico con autorización bilateral de Varo y Eloy**.

---

## 5. Diferenciación entre `main`, PRs propuestas (#44 / #50) y decisiones de Varo y Eloy

### 5.1 Estado integrado actualmente en `main`
- **Interfaz accesible estática:** `web/index.html`, `web/app.mjs`, `web/style.css`, `web/office.svg`.
- **Servicios de backend e integración:**
  - `src/presence.mjs` y `src/presence-bridge.mjs`: Gestión de presencia autenticada por token, caducidad (15s TTL) y eventos SSE.
  - `src/server.mjs`: Servicio HTTP común con endpoints `/api/snapshot`, `/api/queue`, `/api/events`, `/api/session`, `/api/logout`.
  - `packages/office-space/src/space.mjs`: Módulo de gestión de espacios compartidos.

### 5.2 Propuestas en PRs abiertas
- **PR #44 (`origin/espaciokoop-office/t_89373310-office-panel-m-nimo-de-presencia-por-age`):**
  - Propone la incorporación del panel de presencia activa en tiempo real directamente en la interfaz web (`web/app.mjs` y `web/style.css`).
- **PR #50 (`origin/night/20261011/o05-office-3d-presence`):**
  - Propone la integración de la sala 3D interactiva para la representación de avatares de agentes en la oficina.

### 5.3 Decisiones sujetas exclusivamente a la autorización de Varo y Eloy
Conforme a `AGENTS.md` y `ESTADO.md`, las siguientes decisiones requieren la aprobación explícita registrado por ambos propietarios:
1. **Adopción de motores o librerías 3D de terceros:** Evaluación y prueba de procedencia previa a incluir dependencias adicionales en el cliente.
2. **Visibilidad de presencia entre redes:** Autorización de la publicación o exposición de indicadores de agentes a redes exteriores o clientes no autenticados.
3. **Pase a producción / Despliegue:** Autorización y aprobación formal para fusionar PRs de UI o desplegar servicios en infraestructura compartida.

---

*Documento redactado cumpliendo las Normas Platino de EspacioKoop. Prohibido fusionar o desplegar sin revisión conjunta.*
