# Entrega parcial: escena 3D y acceso a la demo

Base: `30e96a81af8130adce62cda73c1aece63c6ff405`. El SHA de entrega
se obtiene con `git rev-parse HEAD` sobre la rama publicada
`agent/office-entera-sims-operativa`. Esta entrega **no satisface la aceptación
Office completa** ni debe presentarse como una integración operativa de agentes.

## Utilizable y evidencia

- Vista 3D WebGL con Three.js 0.180.0 local, geometría propia, iluminación,
  cámara ortográfica y controles de giro. La vista 2D sigue disponible. La
  escena es ambiental: no contiene agentes ni modifica tareas. Su dependencia y
  licencia MIT están en `web/vendor/` y `docs/third-party-provenance.md`.
- Corregido el acceso cuando no hay presencia configurada: el servidor lo
  declara y la interfaz no solicita ese recurso. Si está configurada, sus
  errores siguen retirando la vista. No se infiere presencia de esta ausencia.
- Chromium de escritorio con el servidor HTTP real y fixtures sintéticos:
  [captura](assets/screenshots/office-3d-desktop.png). Comprobados render,
  giro, conservación de la selección 3D tras refresco y retorno a 2D. En
  ventana estrecha se comprobó render y ausencia de desbordamiento:
  [captura](assets/screenshots/office-3d-mobile.png). No se ha emulado gesto
  táctil ni probado con agentes reales.
- `npm run check`: 76 módulos, cero errores. Pruebas focalizadas de servidor
  y presencia: 17/17; tras añadir regresión, presencia 9/9. La ejecución de
  las suites existentes produjo 635/636: una prueba de almacenamiento falló
  por `ENOSPC` en `/tmp`. Repetido el archivo de pruebas de almacenamiento
  con `TMPDIR` en disco con espacio: 13/13. La suite completa no se repitió.

## Cobertura y decisiones

Se consultaron instrucciones locales, estado, README, visión, contratos de
producto, arquitectura, interoperabilidad, cooperación y gestión, seguridad,
catálogo de investigación, estructura del repositorio y módulos de gestión,
cola, servidor e interfaz pertinentes. **No se han leído 144/144 archivos**,
ni verificado todas las PR ni todos los comentarios de #18. GitHub no devolvió
los issues en la consulta disponible y `gh` no está instalado en el nodo
consultado. La reserva del coordinador y su SHA se toman de la orden recibida.
No se comprueba por ello el estado de una posible PR de esta rama: el
coordinador debe comprobarlo antes de publicar o integrar.

La cola `team-queue` proyecta tareas de GitHub, no es una cola durable de
trabajadores. `agent-management` es un contrato de adaptador y conserva recibos
en memoria; no conecta por sí mismo Hermes ni Claude Code. Los módulos de
recetas, vida, historia, recuperación y espacios existen, pero no se han
integrado en este recorrido. Se actualizó la decisión de producto sobre 3D y
asincronía sin atribuir autorización sobre recursos del otro propietario.

## Instalación, despliegue y pendientes

El artefacto es el árbol fuente de la rama; no requiere CDN ni instalación de
Three.js para ejecutarse. Para evaluación aislada con Node 22.16 o posterior:
`npm ci` (dependencias de desarrollo), `npm start`, abrir `127.0.0.1:4173` y
entrar con un equipo sintético. Para volver al estado anterior, usar una
copia aislada del SHA base. No se ha preparado ni ejecutado un despliegue de
producción: el alojamiento, revisión y autorización siguen pendientes.

Faltan agentes visibles y distintos; alta y conexión local de Hermes y Claude
Code; incorporación y retirada persistente; asignación y arrastre accesible;
propiedad y permisos de ejecución; cola durable y adaptador de la malla;
recorrido inocuo con ejecución comprobable; aprendizaje con procedencia,
validación, reutilización y revocación; integración de vida, inventario,
historia y recetas; pruebas reales de desconexión y aislamiento entre dos
propietarios; receta mínima de activación autorizada; y revisión del SHA.
No se han leído credenciales, conectado perfiles, abierto servicios ni
realizado acciones de terceros. No existe aún artefacto instalable de la
experiencia operativa completa.

## Para la memoria

- En la base `30e96a8`, `team-queue.mjs` proyecta tareas seleccionadas de
  GitHub; no implementa leases ni ejecución durable.
- La presencia es opcional en el servidor; cuando no está configurada, la
  versión anterior de la interfaz rechazaba la demo al consultar su endpoint.
- La vista 3D de esta rama es ambiental y no acredita presencia, asignación ni
  trabajo de agentes.
