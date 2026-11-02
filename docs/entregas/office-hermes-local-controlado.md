# Adaptador Hermes local controlado

Este corte permite que el ejecutor de Office invoque la API `AIAgent` de
Hermes en su proceso hijo, sin invocar `hermes chat` ni la pasarela de
mensajería. El proveedor `openai-codex` y el modelo se fijan expresamente;
la resolución fallida detiene la tarea y no cambia de proveedor. Se excluyen
herramientas, memoria y archivos de contexto, y se desactiva la cadena de
fallback. El texto entra por stdin. Solo una conversación completada y sin
fallo se registra como éxito.

El ejecutable aprobado en la configuración de Hermes es el intérprete Python
del entorno donde está instalado Hermes, no el comando `hermes`. El ejecutor
le pasa el puente de este repositorio y el modelo. `HOME` apunta al perfil
privado aprobado de Office y `HERMES_HOME` a su subdirectorio `hermes`, creado
con permisos 0700. No se hereda el entorno del proceso padre, salvo las variables
seleccionadas por el propio ejecutor. Hermes no admite `provider_env` en este
corte: necesita autenticación propia del perfil de proyecto. Se rechazan
configuración, hooks, plugins y MCP en ese directorio. El proceso usa umask 077;
los artefactos y el journal de Office mantienen permisos 0600.

La ejecución conserva el grupo POSIX, timeout, señales, renovación de lease y
estado `unknown` del ejecutor existente. Un grupo de procesos y un perfil no
constituyen una sandbox: no garantizan contener procesos que se separen del
grupo ni limitan por sí mismos el acceso al sistema de archivos o a la red.

Se comprobó el circuito HTTP → SQLite → proceso → resultado con un ejecutable
fixture y se instrumentó el puente con módulos Python sintéticos y conexión de
socket prohibida; esto no es inferencia. El proveedor real, consultado en un
HOME y HERMES_HOME nuevos, devolvió `AuthError: No Codex credentials stored`.
No se copiaron credenciales, no se hizo login y no se ejecutó una tarea real.
Queda pendiente validar la inferencia y la cancelación de Hermes real con una
cuenta propia autorizada y autenticada de forma nativa en el perfil Office.
No se ha desplegado ni se acredita aceptación de producto.
