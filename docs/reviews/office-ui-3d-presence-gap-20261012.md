> **Documento de Auditoría y Evaluación de Brechas:** Este documento analiza de forma de solo lectura y sin red la diferencia entre la presencia autenticada/escena 3D de las PRs históricas #44 y #50 y el estado actual de `main` (#130, #135, #136). No modifica archivos de la aplicación ni autoriza despliegues.

# Auditoría de Brecha: Escena 3D y Presencia Autenticada en Main (`office-ui-3d-presence-gap-20261012.md`)

**Fecha de evaluación:** 12 de octubre de 2026
**SHA/HEAD de main auditado:** `b25d458c35eb8df3fdd4b04586d0b6165e31fa6b` (`test(office): port Jules adversarial DST calendar regressions onto current main (#136)`)
**Rama de trabajo de auditoría:** `jules-14738917800726429185-962b6bb7`
**PRs históricas evaluadas:** #44 (`agent/44-authenticated-presence-ui`), #50 (`agent/50-office-3d-scene`), #47 (auditoría asociada a #44)
**PRs en `main` analizadas:** #87, #89, #96, #97, #98, #99, #104, #105, #130, #135, #136
**Registro de Reserva de Rutas (#18 / Normas Platino):**
- **CLAIM Activo:** `CLAIM` registrado para la rama `jules-14738917800726429185-962b6bb7` en la issue #18 para el archivo exclusivo `docs/reviews/office-ui-3d-presence-gap-20261012.md`.
- **Ámbito:** Unifichero de documentación. Cero modificaciones en `web/app.mjs`, `web/style.css`, `src/server.mjs`, servicios, VPN, `AGENTS.md` o las PRs originales.

---

## 1. Resumen Ejecutivo

Esta auditoría evalúa la brecha (*gap*) existente entre las funcionalidades proyectadas en las PRs históricas #44 (presencia autenticada en UI) y #50 (escena 3D de la oficina) frente al estado actual del código en la rama `main`.

### Hallazgo Principal:
En la arquitectura backend de `main`, la lógica de presencia autenticada (`src/presence.mjs`, `src/presence-bridge.mjs`), gestión de espacios (`src/space-bridge.mjs`, `packages/office-space`), planificación de salas (`src/room-layout-planner.mjs`) y navegabilidad/pathfinding (`src/avatar-pathfinding.mjs`) está **totalmente implementada, aislada y cubierta por suites de pruebas automáticas**. Asimismo, el servidor HTTP (`src/server.mjs`) dispone de los endpoints correspondientes (`/api/presence`, `/api/presence/heartbeat`, `/api/space`, `/api/space/command`, `/api/events`).

Sin embargo, en la capa de interfaz de usuario (`web/app.mjs` y `web/index.html`), **existe un desacoplamiento completo**:
1. La vista de la oficina (`#office-view`) muestra una ilustración SVG ambiental estática (`/office.svg`) con el mensaje *"Vista ambiental · sin telemetría"* y la etiqueta *"Presencia no disponible"* para cada equipo.
2. `web/app.mjs` **no invoca** los endpoints `/api/presence` ni `/api/space`.
3. No se realiza ningún renderizado 3D (WebGL/Canvas) de avatares ni mobiliario en el navegador.

Integrar las PRs históricas #44 y #50 mediante un merge directo reintroduciría código obsoleto que violaría las garantías actuales de `main` sobre **cuotas SSE (#89), rotación de sesión (#96), invalidación por evento space (#98), accesibilidad de paneles (#99) y modelo fail-closed de espacios (#97)**.

---

## 2. Evidencia de Ejecución de Pruebas y Comandos Exactos

Todas las verificaciones se han ejecutado en un entorno aislado con **Node.js v22.22.1** mediante comandos puros sobre los módulos de `main` sin simular conexiones de red ni modificar archivos.

### Comando 1: Verificación de Integridad y Suite Completa de Pruebas
```bash
npm run check && npm test
```
**Resultado:**
- `check.mjs`: Conforme. Sin trailing whitespace, sin `child_process`, `eval` ni `Function`.
- Suite oficial: 423 pruebas unitarias y de contratos pasadas al 100% (0 fallos, 0 cancelaciones).

---

### Comando 2: Prueba de Comportamiento del Motor de Presencia y Transiciones de Estado
```bash
node --input-type=module -e "
import { createPresenceRegistry } from './src/presence.mjs';
import { demoPolicy } from './src/fixtures.mjs';

let clock = 1000000;
const directory = [
  { id: 'marea/agent-1', label: 'Marea Bot', ownerId: 'marea', projects: ['demo/observatorio'] },
  { id: 'aurora/agent-2', label: 'Aurora Bot', ownerId: 'aurora', projects: ['demo/observatorio'] }
];

const registry = createPresenceRegistry({
  directory,
  policy: demoPolicy,
  now: () => clock,
  onlineFor: 5000,
  ttl: 15000
});

console.log('1. Snapshot Inicial (Sin heartbeats):', registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' })[0].status);

registry.heartbeat({ agentId: 'marea/agent-1', projectId: 'demo/observatorio', sequence: 1 });
console.log('2. Tras Heartbeat (t=0s):', registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' })[0].status);

clock += 6000; // 6s > 5s (onlineFor)
console.log('3. Tras 6 segundos (t=6s):', registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' })[0].status);

clock += 10000; // 16s > 15s (ttl)
console.log('4. Tras 16 segundos (t=16s):', registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' })[0].status);
"
```
**Salida Real Obtenida:**
```
1. Snapshot Inicial (Sin heartbeats): offline
2. Tras Heartbeat (t=0s): online
3. Tras 6 segundos (t=6s): stale
4. Tras 16 segundos (t=16s): offline
```

---

### Comando 3: Verificación de Respuestas HTTP de Servidor (`/api/presence` y `/api/space`)
```bash
node --input-type=module -e "
import { createOffice } from './src/server.mjs';

async function testServer() {
  const app = createOffice({ mode: 'demo' });
  const server = app.server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    const base = 'http://127.0.0.1:' + port;
    const headers = { 'host': '127.0.0.1:' + port, 'origin': base };

    // 1. Sin autenticación -> 401 AUTH
    const noAuth = await fetch(base + '/api/presence', { headers });
    console.log('GET /api/presence sin auth:', noAuth.status, await noAuth.json());

    // 2. Iniciar sesión demo-marea
    const login = await fetch(base + '/api/session', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'demo-marea' })
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];

    // 3. GET /api/presence con sesión pero sin directorio configurado -> 404 NOT_FOUND
    const presNoDir = await fetch(base + '/api/presence', { headers: { ...headers, cookie } });
    console.log('GET /api/presence con sesion (sin dir):', presNoDir.status, await presNoDir.json());

    // 4. GET /api/space con sesión demo -> 200 OK
    const spaceRes = await fetch(base + '/api/space', { headers: { ...headers, cookie } });
    const spaceData = await spaceRes.json();
    console.log('GET /api/space con sesion:', spaceRes.status, 'project:', spaceData.project_id);

    await app.close();
  });
}
testServer();
"
```
**Salida Real Obtenida:**
```
GET /api/presence sin auth: 401 { error: 'AUTH', message: 'La sesión ha caducado o se ha revocado.' }
GET /api/presence con sesion (sin dir): 404 { error: 'NOT_FOUND', message: 'Presencia no configurada.' }
GET /api/space con sesion: 200 project: demo/observatorio
```

---

## 3. Análisis de Vectores Requeridos (Sin Red)

### Vector 1: Estados de Presencia (Vacía / No Autorizada / 401 / 403 / 503)
- **Estado Vacío / No Configurado (`404 NOT_FOUND`):** Si `OFFICE_AGENT_DIRECTORY` no está definido en el servidor, las llamadas a `GET /api/presence` o `POST /api/presence/heartbeat` devuelven HTTP `404` con mensaje `"Presencia no configurada."`.
- **No Autenticado (`401 AUTH` / `401 PRESENCE_AUTH`):** Las peticiones a `/api/presence` sin una cookie de sesión válida o con sesión expirada son rechazadas inmediatamente con HTTP `401`. Para las publicaciones de heartbeat (`/api/presence/heartbeat`), la ausencia o invalidez del token Bearer en la cabecera `Authorization` devuelve HTTP `401 PRESENCE_AUTH`.
- **No Autorizado (`403 PRESENCE_FORBIDDEN`):** Si una sesión autenticada pertenece a un miembro que no tiene acceso de lectura al proyecto de presencia especificado en la política local, o si un agente intenta emitir heartbeat para un proyecto no asignado, el sistema responde HTTP `403`.
- **Servicio No Disponible (`503 PRESENCE_UNAVAILABLE`):** Si el archivo del directorio de agentes no se puede leer, está corrupto o la política local se invalida durante el tiempo de ejecución, el puente de presencia entra en fallo cerrado (*fail-closed*) respondiendo HTTP `503`.

---

### Vector 2: Revocación SSE y Señalización (`/api/events`)
- **Control de Cuotas SSE (#89):** El servidor limita a **3 conexiones SSE simultáneas por sesión**. Intentos de abrir una cuarta conexión responden HTTP `429 RATE_LIMIT` sin interrumpir los streams existentes.
- **Evento `revoke`:** Ante un `logout` o la invalidez del `policyHash` (cambio de política local), el servidor emite el evento SSE `event: revoke` y cierra inmediatamente la conexión.
- **Recepción en Cliente (`web/app.mjs`):** El listener actual `events.addEventListener('revoke', ...)` ejecuta `clearView()`, lo que:
  - Cierra el `EventSource`.
  - Cancela los temporizadores `refreshTimer` y `expiryTimer`.
  - Vacía los elementos DOM `#office-view`, `#board` y `#detail-content`.
  - Oculta los controles de actualización y retira todos los metadatos en memoria.
- **Evento `space` (#98):** Cuando se modifica el estado del espacio (p. ej., movimiento de mobiliario o avatar), el servidor invalida el estado y transmite `event: space`. En `web/app.mjs`, el listener ejecuta `refresh()`, el cual reutiliza la secuencia de llamadas `GET` de solo lectura existentes de forma segura sin re-crear la conexión SSE.

---

### Vector 3: Rotación de Sesión y Aislamiento de Estado
- **Cierre de Sesión (`/api/logout`):** Destruye el objeto de sesión interna en `sessions.delete(id)`, invalida los streams SSE activos vinculados a esa sesión y emite las cabeceras:
  ```
  Set-Cookie: office=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0
  Clear-Site-Data: "cache", "storage"
  ```
- **Nueva Autenticación (`/api/session`):** Genera una nueva clave aleatoria de 32 bytes (`randomBytes(32).toString('hex')`) con un plazo de expiración de 1 hora.
- **Aislamiento de Cuotas:** Las ventanas de límite de velocidad (*rate limit*) y cuotas SSE son independientes por ID de sesión.
- **Protección de Lecturas Concurrentes (#96):** El servidor restringe las lecturas activas en `/api/snapshot` y `/api/queue` a máximo 1 lectura en curso por sesión (`busy.has(id)`) y un máximo global de 4 lecturas concurrentes en todo el servidor, previniendo ataques de agotamiento de recursos.

---

### Vector 4: Visualización de Agentes (Online / Stale / Offline sin conexión real)
- **Determinismo Estricto sin Conexión Externa:** El estado de un agente no presupone ni verifica si el proceso está en ejecución, ni realiza conexiones de red.
- **Clasificación por Marcas de Tiempo:**
  - `online`: La marca de tiempo del último heartbeat (`seenAt`) fue recibida dentro de los últimos `onlineFor` milisegundos (5.000 ms por defecto).
  - `stale`: El último heartbeat fue recibido entre `onlineFor` y `ttl` milisegundos (entre 5.000 ms y 15.000 ms).
  - `offline`: No existen heartbeats registrados o la antigüedad del último heartbeat supera el valor de `ttl` (> 15.000 ms).
- **Invariante de Privacidad:** La presencia representa únicamente la publicación voluntaria de latidos autenticados con la clave de agente local. No se expone dirección IP, sistema operativo ni métricas internas.

---

### Vector 5: Interacción con Reservas de Equipo (#18)
- **Separación de Responsabilidades:** La visualización de la escena de la oficina y la presencia de agentes son exclusivamente proyecciones de lectura. No alteran el registro de reservas `#18` (`src/claim-registry.mjs`), las asignaciones en GitHub ni las rutas de tareas (`OFFICE_TASK_ROUTES`).
- **Consultas Secuenciales en Frontend:** Para evitar colisiones en la regla de lectura única por sesión de `main`, la interfaz debe consultar de forma secuencial `/api/snapshot`, `/api/queue`, `/api/presence` y `/api/space`.

---

### Vector 6: Límites de Accesibilidad y Teclado
- **Navegación de Avatares por Teclado:** El módulo `src/avatar-pathfinding.mjs` expone la función `resolveKeyboardMove`, mapeando las teclas `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` y `WASD` a desplazamientos unitarios con comprobación estricta de colisión con muros y mobiliario.
- **Lienzo 3D / Canvas Accesible (WCAG 2.1 AA):**
  - Cualquier elemento de lienzo WebGL o Canvas de 3D/2D en el DOM debe contar con `aria-hidden="true"` o `role="img"` y su correspondiente `aria-label` descriptivo.
  - La información de estado de los avatares (quién está online/stale/offline y en qué sala) debe ser accesible mediante texto plano en la estructura HTML o mediante un panel desplegable accesible con regiones vivas (`aria-live="polite"`).
  - No se deben implementar interacciones que requieran exclusivamente uso de ratón o gestos táctiles complejos.

---

### Vector 7: Rendimiento Móvil y Presupuesto de Cómputo
- **Límite de Búsqueda de Rutas (`avatar-pathfinding.mjs`):** El algoritmo de pathfinding impone un límite máximo de exploración de `maxNodes = 4096`. Si un cálculo excede este umbral, el algoritmo aborta devolviendo `{ found: false, reason: 'CPU_LIMIT_EXCEEDED' }`, evitando bloqueos del hilo principal del navegador (*main thread*).
- **Content Security Policy (CSP) Estricta:** `src/server.mjs` define:
  ```
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  ```
  Esto prohíbe explícitamente cargar librerías 3D pesadas (como Three.js) desde CDNs externas o usar eval/blobs no autorizados.
- **Estrategia de Degradación Elegante (*Graceful Degradation*):**
  - Si el navegador no soporta WebGL o se detecta un dispositivo de baja potencia/móvil, la interfaz debe mantener la imagen SVG ambiental (`/office.svg`) existente en `main` como fallback sin interrumpir la experiencia de usuario.

---

## 4. Propuesta de Migración Mínima

Para conectar la escena de la oficina y la presencia autenticada sin reintroducir la base obsoleta de #44/#50 ni romper los parches integrados en `main`, se propone la siguiente estrategia modular en dos etapas:

### Etapa 1: Módulos Puros en Backend y Lógica de Dominio (Ya Integrados en Main)
Los siguientes componentes ya cumplen las especificaciones y no requieren cambios estructurales:
- `src/presence.mjs` y `src/presence-bridge.mjs`: Registro y gestión de latidos de presencia de agentes.
- `src/space-bridge.mjs` y `packages/office-space`: Persistencia y motor de estado de espacio/mobiliario.
- `src/room-layout-planner.mjs`: Validador y planificador de distribución de salas.
- `src/avatar-pathfinding.mjs`: Calculador determinista de rutas y movimientos por teclado.

---

### Etapa 2: Migración Mínima en la Interfaz de Usuario (`web/app.mjs`)
Cualquier futura PR de interfaz deberá limitarse a:
1. **Consumo Adaptativo de `/api/presence` y `/api/space`:**
   - Incorporar llamadas a `api('/api/presence')` y `api('/api/space')` dentro de la rutina `refresh()` de `web/app.mjs` de forma **secuencial** después de `/api/snapshot` y `/api/queue`.
2. **Componente de Renderizado Ligero y Desacoplado:**
   - Implementar la representación visual mediante un componente puramente declarativo en Canvas 2D/3D o SVG dinámico, embebido directamente en el proyecto bajo `script-src 'self'`.
3. **Manejo Amigable de Ausencia de Presencia:**
   - Si `/api/presence` responde `404 NOT_FOUND` (entorno sin agentes), la interfaz debe mostrar las tarjetas de equipo indicando *"Sin agentes registrados"* sin marcar error ni bloquear el tablero de tareas.

---

## 5. Recorrido Humano Visual e Inspección Requerida

Dado que los tests automáticos en Node.js operan en entorno sin red ni motor gráfico DOM, se identifican las siguientes verificaciones que **requerirán obligatoriamente un recorrido humano visual** con interfaz real antes de cualquier release final:

1. **Prueba Visual Responsiva y Renderizado en Pantallas Móviles:**
   - Verificar la tasa de fotogramas (FPS) y la fluidez del lienzo Canvas/SVG en navegadores móviles (iOS Safari / Android Chrome).
   - Comprobar que el fallback de SVG ambiental se activa correctamente si la GPU no está disponible.
2. **Navegación Táctil y Accesibilidad de Enfoque Teclado:**
   - Inspeccionar visualmente que los avatares y muebles representados en la escena no ocultan elementos interactivos.
   - Probar con lector de pantalla (NVDA/VoiceOver) la locución de cambios de estado en las regiones `aria-live`.
3. **Verificación Multidispositivo de Dos Propietarios (Varo y Eloy):**
   - Realizar una sesión de colaboración simultánea con dos dispositivos reales desde redes separadas (a través del túnel VPN autorizado).
   - Confirmar visualmente que la actualización de presencia de un agente de Varo se refleja en la pantalla de Eloy tras el refresco por evento `space` o ciclo de polling sin fuga de datos ni errores de sesión.

---

## 6. Lista de Bloqueos y Gates para Futuras PRs de UI

Antes de abrir o fusionar cualquier PR de código que modifique `web/app.mjs` o `web/style.css`, se deben resolver los siguientes bloqueos:

| ID Bloqueo | Descripción | Condición de Desbloqueo |
|---|---|---|
| **BLK-01** | `web/app.mjs` no tiene controlador para respuestas 404 de `/api/presence`. | Añadir manejo elegante en cliente cuando el servidor no tiene directorio configurado. |
| **BLK-02** | Conflicto potencial con el límite de 1 lectura por sesión si `/api/presence` se invoca en paralelo. | Garantizar que `refresh()` encadena las peticiones `await` de forma estrictamente secuencial. |
| **BLK-03** | Ausencia de librería 3D embebida compatible con la política CSP `script-src 'self'`. | Diseñar la vista 3D/2D usando la API nativa de `Canvas` o SVG interactivo sin dependencias externas en `package.json`. |
| **BLK-04** | Falta de prueba de aceptación conjunta con ambos propietarios (Varo/Eloy). | Ejecución del recorrido visual en vivo documentado en `ESTADO.md` con credenciales reales autorizadas. |

---

## 7. Conclusiones

- La base de código actual en `main` es **robusta, segura y determinista** en lo que respecta al motor de presencia backend y la lógica de espacios de oficina.
- Las PRs históricas #44 y #50 **no deben ser fusionadas directamente**, ya que reintroducirían código cliente incompatible con las reglas de sesión, SSE y seguridad de `main`.
- La solución consiste en realizar una **migración mínima y progresiva en `web/app.mjs`**, conectando los endpoints existententes de forma secuencial y accesible, garantizando la degradación elegante y manteniendo una arquitectura de cero dependencias en producción.
- El presente entregable cumple estrictamente con el mandato de ser **un único archivo de documentación** (`docs/reviews/office-ui-3d-presence-gap-20261012.md`), sin alterar el código de la aplicación ni las reservas activas.
