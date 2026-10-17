import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { validatePolicy, authenticate } from '../src/domain.mjs';

const SCRIPT_PATH = resolve('tools/create-local-policy.mjs');

function withTempDir(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'test-create-local-policy-'));
  try {
    fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('muestra mensaje de uso y falla si el número de argumentos es incorrecto', () => {
  for (const args of [[], ['file.json', 'login'], ['file.json', 'login', 'repo', 'extra']]) {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Uso: node tools\/create-local-policy\.mjs/);
  }
});

test('crea una política local válida y devuelve la clave de acceso', () => {
  withTempDir(tmp => {
    const policyPath = join(tmp, '.office', 'policy.json');
    const res = spawnSync(process.execPath, [SCRIPT_PATH, policyPath, 'alice', 'acme/repo'], { encoding: 'utf8' });

    assert.equal(res.status, 0);
    assert.match(res.stdout, /Política creada sin tareas seleccionadas/);

    const keyMatch = res.stdout.match(/Clave local de Office[^\n]*\n([A-Za-z0-9_-]+)/);
    assert.ok(keyMatch, 'Se debe imprimir la clave generada en stdout');
    const key = keyMatch[1].trim();

    assert.ok(existsSync(policyPath));
    const content = JSON.parse(readFileSync(policyPath, 'utf8'));

    const validated = validatePolicy(content);
    assert.equal(validated.version, 1);
    assert.equal(validated.members[0].githubLogin, 'alice');
    assert.equal(validated.projects[0].repo, 'acme/repo');

    const authenticated = authenticate(validated, key);
    assert.ok(authenticated);
    assert.equal(authenticated.id, 'local');
  });
});

test('crea directorios anidados automáticamente si no existen', () => {
  withTempDir(tmp => {
    const policyPath = join(tmp, 'nested', 'deep', 'folder', 'policy.json');
    const res = spawnSync(process.execPath, [SCRIPT_PATH, policyPath, 'bob', 'org/proj'], { encoding: 'utf8' });

    assert.equal(res.status, 0);
    assert.ok(existsSync(policyPath));
    const content = JSON.parse(readFileSync(policyPath, 'utf8'));
    assert.equal(validatePolicy(content).members[0].githubLogin, 'bob');
  });
});

test('no sobrescribe una política existente si el archivo ya existe', () => {
  withTempDir(tmp => {
    const policyPath = join(tmp, 'policy.json');
    const initialContent = JSON.stringify({ existing: true });
    writeFileSync(policyPath, initialContent, 'utf8');

    const res = spawnSync(process.execPath, [SCRIPT_PATH, policyPath, 'charlie', 'org/proj'], { encoding: 'utf8' });

    assert.equal(res.status, 1);
    assert.match(res.stderr, /No se ha creado la política/);
    assert.equal(readFileSync(policyPath, 'utf8'), initialContent);
  });
});

test('falla si la cuenta de github o el repositorio no son válidos según la política', () => {
  withTempDir(tmp => {
    for (const [login, repo] of [['-invalid-login-', 'owner/repo'], ['user', 'invalid-repo-without-slash']]) {
      const policyPath = join(tmp, `policy-${login}-${repo}.json`);
      const res = spawnSync(process.execPath, [SCRIPT_PATH, policyPath, login, repo], { encoding: 'utf8' });

      assert.equal(res.status, 1);
      assert.match(res.stderr, /No se ha creado la política/);
      assert.equal(existsSync(policyPath), false);
    }
  });
});
