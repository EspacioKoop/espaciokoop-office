import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
let errors = 0; let count = 0;
for (const dir of ['src', 'web', 'test', 'tools']) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.mjs')) continue;
    const path = join(dir, file); count++;
    const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', shell: false });
    if (checked.status !== 0) { console.error(checked.stderr); errors++; }
    const text = readFileSync(path, 'utf8');
    if (text.split('\n').some(line => /[\t ]+$/.test(line))) { console.error(`Espacios finales: ${path}`); errors++; }
    if (dir === 'src' && /child_process|\beval\s*\(|new Function\s*\(/.test(text)) { console.error(`Ejecución no permitida en runtime: ${path}`); errors++; }
  }
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (Object.keys(pkg.dependencies ?? {}).length) { console.error('El runtime ya no es de cero dependencias. Revisa la decisión.'); errors++; }
console.log(`${count} módulos comprobados; ${errors} errores.`); process.exitCode = errors ? 1 : 0;
