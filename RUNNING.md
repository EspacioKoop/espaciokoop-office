# Ejecutar el candidato de EspacioKoop Office

**Versión de trabajo: 1.0.0-rc.1. No es una versión estable aceptada.** La implementación está en la rama `feat/office-1.0-candidate`; no sustituye la visión completa ni las decisiones bilaterales pendientes de #1. [Alcance y aceptación](docs/acceptance-1.0.md).

## Evaluación local, sin credenciales

Necesitas Node.js 22.16 o posterior. No hay paquetes de runtime que instalar.

```sh
git switch feat/office-1.0-candidate
npm start
```

Abre `http://127.0.0.1:4173`. `OFFICE_PORT` permite elegir otro puerto local por encima de 1023. El proceso solo escucha en `127.0.0.1`; no abre una interfaz pública ni despliega nada.

Entra como **Aurora**. El recorrido guiado permite cambiar a **Marea**, aceptar el ejemplo #11, entregar su PR sintético y volver a Aurora para revisarlo. Los botones indican que son ejemplos. La oficina, el tablero, el detalle, la búsqueda y la comprobación de permisos comparten el mismo recorrido. Marea no puede ver el área privada de Aurora. El ejemplo se reinicia al cerrar y volver a arrancar el proceso.

**Todo este modo es sintético:** los equipos, nombres de cuenta, tareas, aprobaciones y CI son inventados. No se consulta GitHub, no se crea un agente ni se llama a modelos. La oficina ilustrada no representa presencia real.

## Comprobaciones automatizadas

```sh
npm run check
npm test
```

Las pruebas no requieren claves ni conexión de red exterior. Usan orígenes simulados, políticas sintéticas y servidores de prueba en loopback. El verificador de desarrollo ejecuta `node --check` sin shell; el runtime de `src/` no ejecuta procesos.

## Modo GitHub de solo lectura

Este modo es un adaptador candidato: debe probarse sobre objetos seleccionados y autorizados antes de afirmar compatibilidad con ambos equipos reales. No importa inventarios de repositorios, archivos, diffs, cuerpos de issues/PR, comentarios o memorias. GraphQL solicita únicamente metadatos explícitos de cada selección.

### 1. Crear una política en tu máquina

```sh
node tools/create-local-policy.mjs .office/policy.json TU_CUENTA PROPIETARIO/REPO
```

El comando genera una clave aleatoria de acceso a Office y guarda **solo su hash** en el fichero. La clave se muestra una vez en tu terminal local para guardarla en tu gestor. No es una credencial de GitHub. No copies ninguna clave al repositorio, a un issue o a este chat. El comando no llama a GitHub y no sobrescribe un fichero existente.

El directorio `.office/` está excluido de Git. La política inicial no contiene tareas: no se descubre ni consulta ningún objeto hasta seleccionarlo. Ejemplo del campo que debes completar localmente:

```json
"tasks": [
  { "issue": 123, "pullRequest": null },
  { "issue": 124, "pullRequest": 130 }
]
```

Esos números son ilustrativos. La asociación issue/PR la declara el propietario; Office **no lee cuerpos para inferirla ni afirma haber probado una relación automática**. Omitir un objeto es excluirlo: no se consulta y no participa en recuentos. Para excluir una entrega ya vinculada, retira la selección de tarea entera hasta revisar su alcance.

La política completa tiene `version`, `members` y `projects`. Cada miembro tiene `id`, `label`, `githubLogin`, `keyHash`. Cada proyecto tiene `repo`, `label`, `readers` y `tasks`. Se rechazan campos extra, identidades o claves duplicadas, lectores desconocidos y números no válidos. `readers` regula la visibilidad de Office, no cambia permisos de GitHub ni autoriza ejecutar trabajo.

Para incorporar otra persona hacen falta su autorización, una clave independiente y una cuenta de GitHub distinta. No uses una clave común ni rellenes la ficha de otro propietario por suposición. El candidato no es un alojamiento compartido de producción.

### 2. Credencial GitHub local y de alcance mínimo

Prepara una credencial local de GitHub limitada a **lectura de issues y pull requests**, más la lectura de resultados de checks/estados necesaria para el CI, y a los repositorios explícitos. La combinación exacta de permisos y tipo de token debe validarse en tu entorno; un error o un resultado parcial se rechaza sin mostrar datos. No se requiere permiso de escritura de Office.

Inyecta `OFFICE_GITHUB_TOKEN` en el entorno mediante tu gestor local de secretos, sin escribirlo en comandos que queden en el historial. El servidor no devuelve la credencial a la interfaz. No registra cuerpos ni respuestas de GitHub. No carga un `.env` automáticamente.

```sh
OFFICE_POLICY=.office/policy.json npm run start:live
```

Introduce en la interfaz **la clave local de Office**, nunca el token GitHub. El modo conectado no habilita los botones de simulación. Las acciones reales se hacen mediante enlaces a GitHub, con sus permisos y revisión habitual. **Office todavía no crea agentes, autoasigna tareas ni publica revisiones.**

### 3. Cómo interpreta el ciclo

- **Solicitada:** issue seleccionado de un autor incorporado; no se infiere ejecución.
- **Aceptada:** un único destinatario de otro equipo se ha autoasignado, según el último evento de asignación pertinente. Una asignación realizada por el solicitante no demuestra consentimiento. Eventos antiguos fuera de la ventana consultada quedan sin confirmar.
- **Entregada:** PR seleccionado, no borrador, del responsable de la tarea. La relación entre ambos objetos es una declaración local explícita.
- **Revisada:** aprobación del equipo solicitante sobre el SHA actual, CI `SUCCESS` de ese mismo SHA, revisión completa, sin cambios solicitados ni revisión obligatoria pendiente. Un PR fusionado o un issue cerrado no bastan.

Las cuentas compartidas se muestran como tales: no se inventa identidad por agente, presencia, tokens consumidos, aprendizaje ni productividad. El historial de contenido y los comentarios permanecen en GitHub.

### 4. Revocación y datos efímeros

La política se valida en cada petición y después de cada consulta. Si cambia durante una lectura, el resultado se descarta. Un cambio de política invalida las sesiones y envía una señal de retirada a la interfaz (comprobación cada 750 ms). No hay base de datos ni caché de tareas en disco. Cada vista caduca a los 12 segundos y se intenta renovar a los 9; ante fallo, pérdida de sesión, pestaña oculta o desconexión se vacía.

Revocar acceso en GitHub se detecta en la siguiente consulta, **no de forma instantánea**. Estos plazos no son una garantía contra un usuario que ya haya copiado lo autorizado ni contra una pestaña suspendida por el navegador. La revocación de Office tampoco detiene trabajadores externos: **no tiene autoridad ni conexión para hacerlo**. La parada de cada equipo sigue siendo local.

Cerrar sesión retira el contenido mostrado y la cookie. Cerrar el proceso elimina las sesiones y los datos sintéticos. No hay trabajo asíncrono persistente, cron, despliegue, gasto de modelos o archivos de trabajo que recuperar.

## Servicio común: candidato de #21

Esta rama añade configuración de origen, escucha, TLS opcional y API de espacios,
sin interfaz nueva. La ejecución local sin variables adicionales se conserva.
Consulta [la guía de servicio común](docs/remote-collaboration.md) para las
variables del administrador, HTTPS, túnel privado, persistencia y límites.
La verificación final está pendiente: no integrar ni desplegar este candidato.
No se han probado dos redes reales, despliegue ni uso por personas.

## Frontera técnica y procedencia

Node.js y las APIs del navegador; cero dependencias de runtime, sin CDN ni recursos remotos. Código y SVG ambiental originales de esta contribución. No se incorpora código, arte o ejecutores de los upstream estudiados. La licencia global del proyecto sigue pendiente: este incremento no la decide unilateralmente.

Consulta [el informe de aceptación](docs/acceptance-1.0.md) y [la reserva #13](https://github.com/EspacioKoop/espaciokoop-office/issues/13). La aprobación de este código no selecciona infraestructura ni sustituye el consentimiento de ambos propietarios.
