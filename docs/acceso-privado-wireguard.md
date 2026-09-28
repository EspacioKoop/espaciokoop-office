# Acceso privado a la oficina común por WireGuard

**Estado:** propuesta **D5** ([#1](https://github.com/EspacioKoop/espaciokoop-office/issues/1#issuecomment-5868570693)), **pendiente de que Eloy la acepte**. Esta guía no abre ningún acceso: explica cómo se haría. La configuración real se hace fuera del repositorio, cuando los dos den el OK. Seguimiento en #26.

## Qué es y qué no es

- La oficina corre en un equipo del lado de Varo. Eloy entra por un **túnel WireGuard privado** que lleva **solo** al puerto de la oficina.
- El túnel no da acceso a la red de Varo, a otros equipos ni a otros servicios. Tampoco desvía el resto del tráfico de Eloy: su navegación normal sigue por su conexión de siempre.
- Hay dos llaves independientes y hacen falta las dos:
  1. **WireGuard** decide quién llega a la oficina.
  2. **La clave de miembro de la oficina** decide quién es cada uno dentro.
- Sin dominio, sin página pública y sin coste. Del lado de Varo solo queda accesible el puerto de WireGuard, que no responde a quien no tenga una clave autorizada.
- Requiere el servicio común (#21), todavía no integrado.

## Qué nunca va al repositorio

Claves privadas o públicas, direcciones, puertos, puntos de conexión, nombres de equipos, archivos de configuración ni capturas que los muestren. Todo eso se intercambia **por un canal privado** entre Varo y Eloy. En los issues solo se anota el resultado y la fecha.

## Pasos de Eloy

1. **Instalar WireGuard.** En Windows y macOS, la aplicación oficial de [wireguard.com/install](https://www.wireguard.com/install/). En Linux, el paquete `wireguard-tools` de su distribución.
2. **Generar su pareja de claves en su propio equipo.** La clave privada **no sale nunca de su equipo**.
   - Windows o macOS: en la aplicación, *Añadir túnel → Añadir túnel vacío*. La aplicación crea la pareja y muestra la clave pública.
   - Linux:
     ```sh
     umask 077
     wg genkey | tee eloy.key | wg pubkey > eloy.pub
     ```
3. **Enviar a Varo solo la clave pública**, por privado. No es secreta, pero tampoco se publica.
4. **Recibir de Varo, por privado:** su dirección dentro del túnel, la clave pública del servidor, el punto de conexión, la dirección exacta de la oficina y su clave de miembro de la oficina.
5. **Completar la configuración del túnel.** Los valores entre `<…>` son los que le pasa Varo:
   ```ini
   [Interface]
   PrivateKey = <CLAVE_PRIVADA_DE_ELOY>
   Address = <DIRECCION_DE_ELOY_EN_EL_TUNEL>/32

   [Peer]
   PublicKey = <CLAVE_PUBLICA_DEL_SERVIDOR>
   Endpoint = <PUNTO_DE_CONEXION>:<PUERTO_WIREGUARD>
   AllowedIPs = <DIRECCION_DE_LA_OFICINA>/32
   PersistentKeepalive = 25
   ```
   `AllowedIPs` contiene **una sola dirección**, la de la oficina, y eso es lo que impide que el resto de su tráfico pase por el túnel. No hace falta la línea `DNS`.
6. **Activar el túnel y abrir la dirección exacta de la oficina** en el navegador. Debe aparecer la pantalla de entrada. Se entra con la clave de miembro.

## Qué configura Varo en su lado

- Da de alta a Eloy en WireGuard con **su clave pública** y **una sola dirección** dentro del túnel.
- En el cortafuegos, desde esa dirección solo se permite **el puerto de la oficina**. Todo lo demás se descarta: otros puertos, otros equipos, salida a Internet o a su red.
- Arranca la oficina escuchando solo en la interfaz del túnel, con el origen exacto y `OFFICE_PRIVATE_TUNNEL=1` ([servicio común](https://github.com/EspacioKoop/espaciokoop-office/issues/21)). Dentro del túnel el tráfico va cifrado por WireGuard.
- Crea la clave de miembro de Eloy en la política de la oficina y se la entrega por privado.

## Retirar el acceso

- **Varo** puede cortarlo en cualquier momento de dos formas, que conviene aplicar juntas:
  - borrar el peer de Eloy, lo que corta la red al momento;
  - revocar su clave de miembro, lo que cierra su sesión y le retira la vista que ya tenía abierta.
- **Eloy** puede desactivar o borrar el túnel cuando quiera.
- **Si una clave se compromete**, Eloy genera una pareja nueva y envía la nueva clave pública. Varo sustituye la antigua.

## Prueba conjunta de aceptación

Se hace una vez con los dos presentes. En #26 se anotan solo el resultado y la fecha.

- [ ] Eloy, desde su red, ve la pantalla de entrada y entra con su clave.
- [ ] Desde el túnel no responde ningún otro puerto ni equipo del lado de Varo.
- [ ] Sin el túnel activo, la oficina no es accesible desde Internet.
- [ ] Al borrar el peer, la conexión cae. Al revocar la clave de miembro, la sesión se cierra y la vista desaparece.
- [ ] El tráfico normal de Eloy no pasa por el túnel.

Si Eloy prefiere otra vía (un túnel con cuenta propia o un alojamiento neutral), lo dice en #1 y esta guía se sustituye.
