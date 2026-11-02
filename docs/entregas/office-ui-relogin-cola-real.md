# Interfaz de agencia: relogin y cola HTTP

Base integrada: `840ac6bacba536827b570f1d5cbcc4b68217b1a7`. Corte local de interfaz y pruebas sintéticas, sin despliegue ni runtime real conectado.

## Cambio

- El relogin volvía a cargar sesión, snapshot y cola, pero no `GET /api/agency`: `clearView()` cancelaba el temporizador de agencia sin poner su referencia a `null`. La condición de refresco interpretaba que seguía programado. La aserción final del navegador se conserva y comprueba también la respuesta HTTP de agencia.
- La interfaz envía `POST /api/agency/jobs` con título, instrucción y agente propio incorporado y disponible. Conserva el borrador durante los refrescos y usa una operación por intención; un reintento incierto reutiliza la misma operación. Muestra los estados y resultados que llegan de `GET /api/agency`, y obtiene el detalle por `GET /api/agency/jobs/:id`. El resumen se inserta como texto.
- El panel explícito de emparejamiento registra un conector mediante `POST /api/agency/connectors` para `hermes` o `claude-code`. Muestra el token solo en ese panel y lo retira al cerrarlo o salir de la sesión. No crea perfiles, instala claves ni conecta un runtime desde el navegador.
- La ayuda explica la diferencia entre cola, claim, ejecución y resultado, además de los límites de esta evaluación.

## Evidencia

- Reproducción inicial sobre la base: Node 22.23.2 y Chromium, fallo exacto en `.agency-avatar[aria-pressed="false"]` tras logout/relogin. Diagnóstico: DOM sin avatares; `/api/session`, `/api/snapshot` y `/api/queue` respondían 200, pero no se solicitaba `/api/agency`; una lectura directa de agencia respondía 200.
- Recorridos focales 2D y 3D con SwiftShader: correctos. La prueba con `createOffice` y SQLite sintética cubre envío desde la UI, doble evento sin duplicado, claim, heartbeat, resultado correcto y fallido, detalle, reinicio, dos propietarios, 403, conflicto 409, sesión caducada, lease `unknown`, texto no interpretado como HTML y limpieza del token.
- Suite completa con pruebas de navegador habilitadas: **524/524**, sin fallos ni omisiones, Node 22.23.2, CPU 0 y concurrencia 1. `npm run check`: **82 módulos, 0 errores**. Capturas sintéticas de escritorio, móvil y 3D guardadas fuera de Git.
- Una tanda focal conjunta anterior agotó `page.goto` (5 s) y después la espera de «Incorporar» (8 s). Las repeticiones aisladas y la suite completa pasaron sin cambiar los tiempos de espera. No se ha determinado la causa de esa intermitencia.

## Límites y reversión

El conector de prueba no es Hermes ni Claude Code real. «En cola» no acredita ejecución; un lease caducado queda `unknown` sin reintento automático. Tampoco se acredita despliegue, conexión bilateral real ni aceptación de producto. Para revertir, retirar el commit de esta entrega de la rama de trabajo; las tareas SQLite del servidor son datos separados y no se borran con la interfaz.
