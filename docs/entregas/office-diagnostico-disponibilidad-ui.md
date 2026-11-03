# Diagnóstico de disponibilidad en la ficha

El reporte autenticado admite `reason_code` opcional con cinco valores: `auth_unavailable`, `runtime_unavailable`, `provider_unavailable`, `executable_unavailable` y `probe_failed`. Los valores arbitrarios se rechazan; no se transmiten excepciones ni rutas. Un reporte sin motivo, o con estado distinto de `offline`, limpia el motivo previo. Los conectores anteriores siguen siendo compatibles.

SQLite añade la columna sin borrar filas y solo cuando falta. La instantánea propia muestra el motivo enumerado mientras el reporte y el conector estén vigentes; la caducidad o revocación lo oculta. El runtime comunica el motivo del probe fallido y no reclama trabajo. La ficha propia muestra el motivo y ayuda accesible; la falta de conexión o de diagnóstico vigente se muestra por separado. No se automatiza la autenticación ni se solicitan credenciales.

Las pruebas usan datos sintéticos y servidor local: HTTP/SQLite, aislamiento de propietario, duplicados, rechazo de valores arbitrarios, reinicio, migración, actualización, caducidad y revocación; el probe sintético comprueba que no se reclame el trabajo. Chromium sin WebGL verifica la ficha móvil, ayuda con teclado y asignación deshabilitada. No son una prueba humana ni bilateral. La autenticación propia de Hermes sigue pendiente; este cambio no la resuelve ni despliega ningún obrero.

Para revertir el comportamiento, revertir el commit de esta entrega. La columna SQLite añadida es nullable y puede permanecer sin afectar a versiones anteriores; no es necesario borrar datos.

Validación local con Node 22.23.2, un núcleo y concurrencia uno: las 21 pruebas focales pasaron. `npm test -- --test-concurrency=1` terminó con 537 pruebas aprobadas y dos timeouts de Chromium en recorridos existentes; ambos pasaron al repetirlos aislados (2/2). `npm run check` comprobó 86 módulos sin errores. La captura móvil sintética y los registros quedan fuera de Git. No se considera verde la ejecución completa que tuvo los dos fallos.
