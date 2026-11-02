# Conector ejecutable de runtime (corte local)

Base `840ac6bacba536827b570f1d5cbcc4b68217b1a7`. El proceso `tools/agency-runtime.mjs` sale desde el equipo del operador hacia la API ya existente de Office. Office solo mantiene autenticación, cola, lease y resultado. El ejecutor lanza un hijo local con `spawn` y argumentos literales, sin shell; conserva un journal privado antes de lanzarlo y guarda la salida acotada en un artefacto local. No se ha desplegado ni conectado ningún agente real.

## Uso autorizado

Node 22.16 o posterior. El operador crea por separado un conector en la UI o en `POST /api/agency/connectors` y guarda el token una sola vez en un JSON privado (`0600`) dentro de un directorio del mismo UID con modo `0700`. Prepara `output_dir` con modo `0700` y, dentro, `profile/` también privado. Para Hermes debe existir `profile/config.yaml` de un perfil de **proyecto** ya aprobado. El ejecutor no crea perfiles, no toma credenciales de otro perfil y no inicia por sí mismo.

Campos del JSON: `origin` (origen literal de loopback o LAN HTTPS), `connector_token`, `runtime` (`hermes` o `claude-code`), `agent_ref`, `name`, `executable`, `executable_allowlist` (incluye la ruta absoluta del binario aprobada por el operador), `workspace` (raíz absoluta de un repositorio Git autorizado), `profile` (`{"scope":"project","approved":true,"name":"nombre-de-proyecto","home":"<output_dir>/profile"}`), `output_dir`, `timeout_seconds` (1–1800), `provider` (`openai-codex` o `anthropic`), `model` explícito y, opcionalmente, `provider_env` con solo la clave del proveedor elegido. El JSON no pertenece al repositorio.

```sh
node tools/agency-runtime.mjs --config /ruta/privada/config.json --once
node tools/agency-runtime.mjs --config /ruta/privada/config.json --serve --max-seconds 1800
```

Cada POST lleva `Origin` exacto y Bearer; el token nunca se imprime. Cada sondeo nuevo usa una operación nueva, y un reintento de transporte de ese sondeo reutiliza su ID. Se reporta `offline` si falta el ejecutable. El estado `available` solo se reporta tras validar config, binario y perfil. Durante un hijo hay heartbeat de conector y lease cada 10 segundos. La pérdida del lease o la revocación detiene el hijo observado y deja `unknown` local si Office rechaza el resultado. Un trabajo incierto en el journal bloquea nuevos claims hasta intervención del operador; nunca se ejecuta de nuevo automáticamente. `--serve` acaba como máximo tras 1800 segundos, y el timeout del hijo queda limitado al tiempo restante.

Hermes recibe `chat --provider <aprobado> --model <aprobado> --query-file - --oneshot`, con `HERMES_HOME` fijado al perfil privado y la instrucción literal por stdin. Claude Code recibe `--bare --strict-mcp-config --no-session-persistence --model <aprobado> -p`, con la instrucción por stdin; no hay bypass de permisos. La [CLI oficial de Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/cli) y [perfiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles) confirman `--query-file -`, `--oneshot` y `HERMES_HOME`. El `--help` local confirma los argumentos empleados. **La CLI de Hermes puede delegar una consulta a su gateway:** detener el proceso CLI no demuestra que ese gateway se haya detenido. No se ha ejecutado una consulta Hermes real ni Claude Code real, por lo que queda pendiente validar ese control antes de usar un perfil operativo.

## Evidencia y límites

`test/agency-runtime.test.mjs` ejercita servidor `createOffice` real, HTTP, SQLite, alta, incorporación, cola, proceso fixture sin IA que incrementa un contador, artefacto y resultado persistido tras reiniciar Office. Incluye dos propietarios, texto con sustituciones de shell, permisos, enlace, allowlist, error de salida, timeout, lease caducado, revocación y caída tras spawn. El fixture demuestra un proceso local real, **no** inferencia Hermes/Claude. El servidor no recibe artefactos ni salida completa, solo `artifact_id` opaco y resumen genérico; el artefacto privado queda en `output_dir`.

Node 22.23.2: focales 6/6; `npm run check` equivalente (`node tools/check.mjs`) 85 módulos, 0 errores; suite completa 528 correctas, 0 fallos y 2 omitidas. La primera ejecución de la suite no pudo cargar cuatro archivos porque faltaba `fast-check`, dependencia de desarrollo ya declarada; `npm ci --offline --ignore-scripts` la instaló sin cambiar manifiestos y la repetición pasó.

Rollback: detener `--serve`; revocar el conector desde Office; conservar `journal.json` y artefactos hasta reconciliar los trabajos `unknown`. Retirar esta rama restaura el estado previo sin modificar cola, rutas HTTP ni producción.
