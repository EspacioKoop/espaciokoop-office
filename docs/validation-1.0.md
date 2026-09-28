# Validación ejecutada del candidato 1.0.0-rc.1

## Identificación del candidato

Código comprobado: `29802cb8def05e277a5cc3fc60139aae37adc8fa`, rama `feat/office-1.0-candidate`. El commit de entrega posterior añade documentación, pruebas visuales reproducibles y captura; no modifica el runtime probado. Los catorce blobs de código, interfaz y pruebas se identifican en [tested-blobs.json](tested-blobs.json).

Node.js `v22.16.0`. Pruebas en entorno Linux aislado, con datos inventados y servidores HTTP de loopback. No se usaron credenciales de los propietarios, se conectaron agentes reales ni se hicieron llamadas de inferencia. Las comprobaciones son de esta contribución, no una revisión independiente.

## Resultados reales

| Comprobación | Resultado | Alcance |
|---|---|---|
| `npm run check` | 10 módulos, 0 errores | Sintaxis, espacios y prohibición de ejecución de procesos/eval en `src/`; cero dependencias de runtime. |
| `npm test` | 62 pruebas; 62 aprobadas; 0 fallos, cancelaciones u omisiones | Dominio, fuente GitHub simulada y servidor HTTP real de loopback. |
| Recorrido visual | 8 comprobaciones aprobadas | Chromium, interfaz real y servidor real mediante puente local. |
| Errores JavaScript observados | 0 | Durante los ocho recorridos, no auditoría de todos los posibles estados. |
| Peticiones exteriores observadas | 0 | Durante el recorrido sintético; el modo conectado consulta GitHub por diseño. |
| Escritorio y móvil | Sin desbordamiento horizontal en los tamaños probados | 1440 × 1120 y 390 × 844; capturas de página completa. |

El primer pase tuvo un fallo en la prueba de Host: el cliente `fetch` de ensayo no enviaba la cabecera sobreescrita. Se sustituyó ese caso por `node:http.request` y se comprobó el rechazo 403 con la cabecera real. No se eliminó ni relajó el control de Host del servidor. Se añadieron casos de datos incompletos y se corrigió la renovación del detalle abierto para no conservar una evidencia antigua mientras cambiaba el tablero.

## Qué prueban los 62 casos

Cadena positiva y casos negativos de asignación unilateral, responsable ambiguo, aceptación ausente, entrega ajena, revisión propia o de otro SHA, CI ausente/rojo/pendiente, borradores, PR cerrado, revisiones parciales y metadatos incompletos. Cerrar un issue o fusionar un PR no sustituye las condiciones verificadas.

Validación estricta de política, autenticación ligada a clave, lectores por proyecto, rechazo de campos no admitidos, respuesta del origen acotada y saneada, errores GraphQL con HTTP 200 rechazados, destino de red fijo y redirecciones desactivadas. El origen se consulta solo después de filtrar los proyectos del miembro.

Revocación durante una consulta, sesión caducada, invalidación por cambio de política, señal SSE de revocación sin tareas, ruta estática explícita, origen/Host, intentos limitados, y conflictos de versión en la simulación. Estas pruebas no demuestran una defensa exhaustiva frente a todos los ataques posibles.

## Límite importante de la prueba de navegador

Chromium rechazó la navegación HTTP local con `ERR_BLOCKED_BY_ADMINISTRATOR` en este entorno. No se alteró esa política. Para comprobar la interfaz se renderizaron los archivos reales y se transportaron sus peticiones al servidor Node mediante un cliente HTTP local de Python. Los equipos y tareas siguieron siendo los fixtures sintéticos del servidor, no un estado inventado en el navegador.

En ese modo el navegador utiliza un puente de `fetch` y una implementación inerte de EventSource; los recursos visuales locales se insertan en la página. Por tanto, **no se han validado en conjunto las cookies, los orígenes, la CSP, la carga de módulos y SSE con el transporte nativo del navegador**. El informe declara `transport: loopback-bridge` y `native_browser_security_verified: false`.

Los tests HTTP de Node comprueban por separado parte de esa frontera del servidor, pero no sustituyen el recorrido nativo pendiente. Las capturas son renders reales de la interfaz con datos sintéticos, no montajes conceptuales; tampoco acreditan una conexión de agentes.

## Reproducir

Desde la raíz del repositorio:

```sh
npm run check
npm test
```

Para la comprobación visual, en un entorno que ya tenga Python, Playwright y Chromium instalados:

```sh
python tools/browser-check.py
```

El modo predeterminado usa HTTP nativo. `CHROMIUM_PATH` permite indicar un binario existente. El script inicia un proceso local de ejemplo en el puerto 4191, genera capturas e informe y termina ese proceso. No instala paquetes ni modifica máquinas de los propietarios.

Para reproducir específicamente la comprobación limitada realizada aquí:

```sh
OFFICE_BROWSER_BRIDGE=1 python tools/browser-check.py
```

El informe diferencia ambos modos; no cambiar esa etiqueta ni presentar el resultado del puente como nativo. La captura reducida de portada está en [office-preview.webp](../assets/screenshots/office-preview.webp); el recorrido genera también las cuatro capturas PNG de escritorio, evidencia, tablero y móvil.

## Riesgos y aceptación pendientes

No se ha comprobado la consulta GraphQL contra una combinación real de token/permisos/repositorios autorizados. Tampoco se ha evaluado la actualización de proyecciones de revisiones de GitHub durante cambios, anulaciones o revocaciones reales. Una marca de refresco de Office no prueba por sí sola la inmediatez de todos los datos del proveedor. El candidato es de solo lectura y no debe usarse como certificador autónomo, automatismo de fusión o puerta de release.

El enlace issue/PR es una declaración explícita de la política local, no una relación descubierta en el cuerpo de una entrega. Las identidades de cuentas compartidas no distinguen personas de agentes. El sistema no para ejecutores externos ni impone presupuesto de inferencia porque no está conectado a ellos.

Faltan la prueba nativa en navegador, la integración real de ambos equipos, revisión independiente, acuerdo de alcance/alojamiento y los objetivos de juego no implementados. Véanse [las puertas de aceptación](acceptance-1.0.md). **No se ha publicado una versión estable ni se han superado esas puertas mediante estas pruebas sintéticas.**
