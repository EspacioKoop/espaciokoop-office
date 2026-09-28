// Ejecutar SOLO en la máquina del propietario. No importa credenciales ni datos de GitHub.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { digest, validatePolicy } from '../src/domain.mjs';
const [file, login, repo] = process.argv.slice(2);
if (!file || !login || !repo || process.argv.length !== 5) {
  console.error('Uso: node tools/create-local-policy.mjs .office/policy.json CUENTA_GITHUB PROPIETARIO/REPO');
  process.exitCode = 1;
} else {
  try {
    const key = randomBytes(32).toString('base64url');
    const policy = validatePolicy({ version: 1, members: [{ id: 'local', label: 'Equipo local', githubLogin: login, keyHash: digest(key) }], projects: [{ repo, label: 'Proyecto seleccionado', readers: ['local'], tasks: [] }] });
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(policy, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Política creada sin tareas seleccionadas. No se ha consultado GitHub.');
    console.log('Clave local de Office (guárdala en tu gestor local; no es un token de GitHub):');
    console.log(key);
  } catch { console.error('No se ha creado la política. Comprueba los argumentos y que el archivo no exista.'); process.exitCode = 1; }
}
