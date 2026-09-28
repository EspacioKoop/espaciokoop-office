# Office Space — espacio compartido

Módulo candidato para COEDIT-01, SPACE-01, AVATAR-01 y MGMT-01 de Office.
**No es Office 1.0 ni una aplicación gráfica.** La integración del editor y del
transporte autenticado de `office-remote` sigue pendiente. Este paquete funciona
**en el servicio común**, no guarda una oficina diferente en cada navegador.

## Comprobarlo

Node.js 22 o posterior. El almacén de ficheros está implementado para Linux.
Sin dependencias de npm y sin instalación de paquetes:

```sh
node --test packages/office-space/test/*.test.mjs
node packages/office-space/examples/shared-space.mjs
```

Desde el directorio del paquete también funcionan `npm test` y `npm run demo`.
El ejemplo utiliza únicamente dos identidades ficticias y una carpeta temporal,
que retira al acabar. No abre red, no conecta agentes ni invoca modelos.

## Contenido

- `src/space.mjs`: transacciones puras, proyección autorizada, validación y catálogo.
- `src/store.mjs`: persistencia atómica, exclusión de escritores y revalidación de acceso.
- `test/`: autorización, conflictos, geometría, idempotencia y recuperación.
- `examples/shared-space.mjs`: recorrido sintético con dos actores, conflicto y restauración.

[Contrato, integración, errores y límites](../../docs/office-space.md).

Código nuevo para este repositorio; no se ha importado código de los proyectos de
referencia. Solo se usa la biblioteca estándar de Node.js. Se mantiene la licencia
general pendiente de acuerdo; `private: true` evita publicación accidental en npm.
