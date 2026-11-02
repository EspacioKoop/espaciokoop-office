# Integración de interfaz y agencia persistente

Base: `0429ddef8ec29d11482690deafa6836ca291e4fe`. La interfaz usa `available` para permitir asignar; la escena distingue los cuatro estados del contrato sin animar actividad. La proyección de agentes se filtra por propietario también en el cliente. Cancelar el puntero y desmontar la escena limpian el arrastre; cerrar sesión limpia selección y vista.

Se añadió un recorrido opcional de Chromium con `createOffice`, política y sesiones de demostración, conector y agentes sintéticos y SQLite real. Cubre incorporación, secciones, arrastre 2D, selector, recarga y reinicio, aislamiento, 403 sin mutación, 409 con actualización y una sola solicitud, y limpieza ante 401. Con SwiftShader recorre selección, cancelación y arrastre 3D; sin WebGL comprueba la alternativa 2D. Incluye móvil de 360 px. No utiliza servicios ni credenciales reales.

Comprobación: Node 22.23.2, `npm ci`, `npm run check` (82 módulos), focales (14/14) y suite completa (521/521, sin omitidas), con CPU 0 y concurrencia de pruebas 1. El recorrido real 3D con SwiftShader también pasó. Las capturas y registros sintéticos están fuera de Git en `~/projects/espaciokoop-office/local/t/u132/recibos/`.

La suite se inició antes de añadir la comprobación adicional de selección al cerrar sesión; el resto del recorrido y el producto comprobados son los mismos. Una repetición simultánea con la suite agotó el tiempo de navegación; las repeticiones posteriores se vieron afectadas por espera de E/S Btrfs. Consultar el recibo final para el resultado de esa comprobación adicional. Esto no acredita ejecutores ni cola operativa, colaboración bilateral real o despliegue.

Reversión: revertir el commit de esta entrega, sin tocar datos de agencia persistidos. La integración y cualquier publicación corresponden al coordinador.
