import test from 'node:test';
import assert from 'node:assert/strict';
import { insist, clean, publicMember, OfficeError } from '../src/domain.mjs';

test('insist: no lanza excepción si la condición es verdadera', () => {
  assert.doesNotThrow(() => insist(true, 'TEST_CODE', 'Todo correcto'));
  assert.doesNotThrow(() => insist(1, 'TEST_CODE', 'Verdadero numérico'));
  assert.doesNotThrow(() => insist('ok', 'TEST_CODE', 'Cadena no vacía'));
  assert.doesNotThrow(() => insist({}, 'TEST_CODE', 'Objeto no nulo'));
});

test('insist: lanza OfficeError con código, mensaje y estado por defecto (400)', () => {
  assert.throws(
    () => insist(false, 'INVALID_INPUT', 'Parámetro inválido'),
    (err) => {
      assert.ok(err instanceof OfficeError);
      assert.ok(err instanceof Error);
      assert.equal(err.code, 'INVALID_INPUT');
      assert.equal(err.message, 'Parámetro inválido');
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test('insist: lanza OfficeError con estado HTTP personalizado', () => {
  assert.throws(
    () => insist(false, 'UNAUTHORIZED', 'Acceso denegado', 401),
    (err) => {
      assert.ok(err instanceof OfficeError);
      assert.equal(err.code, 'UNAUTHORIZED');
      assert.equal(err.message, 'Acceso denegado');
      assert.equal(err.status, 401);
      return true;
    }
  );
});

test('clean: maneja valores nulos y no definidos devuelven cadena vacía', () => {
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
});

test('clean: convierte tipos primitivos a cadena de texto', () => {
  assert.equal(clean(12345), '12345');
  assert.equal(clean(true), 'true');
  assert.equal(clean(0), '0');
});

test('clean: elimina todos los caracteres de control (0x00-0x1F y 0x7F)', () => {
  const dirty = 'Hola\u0000\u0001\u0009\u000A\u000D\u001F Mundo\u007f!';
  assert.equal(clean(dirty), 'Hola Mundo!');
});

test('clean: recorta a maximo 240 caracteres por defecto y soporta max personalizado', () => {
  const longText = 'a'.repeat(300);
  assert.equal(clean(longText).length, 240);
  assert.equal(clean(longText, 10), 'a'.repeat(10));
  assert.equal(clean('Texto corto', 50), 'Texto corto');
});

test('publicMember: filtra campos privados y expone solo la lista blanca autorizada', () => {
  const memberInput = {
    id: 'aurora',
    label: 'Equipo Aurora\u0000',
    githubLogin: 'aurora-dev',
    keyHash: 'a'.repeat(64),
    secretToken: 'super-secret',
    internalNotes: 'privado'
  };

  const result = publicMember(memberInput);

  assert.deepEqual(Object.keys(result).sort(), ['githubLogin', 'id', 'identity', 'label', 'presence']);
  assert.equal(result.id, 'aurora');
  assert.equal(result.githubLogin, 'aurora-dev');
  assert.equal(result.label, 'Equipo Aurora');
  assert.equal(result.identity, 'shared-account');
  assert.equal(result.presence, 'unknown');
  assert.equal('keyHash' in result, false);
  assert.equal('secretToken' in result, false);
});

test('publicMember: aplica la limpieza de etiqueta recortando a máximo 80 caracteres', () => {
  const longLabel = 'B'.repeat(100) + '\u0007';
  const memberInput = {
    id: 'marea',
    label: longLabel,
    githubLogin: 'marea-dev'
  };

  const result = publicMember(memberInput);
  assert.equal(result.label.length, 80);
  assert.equal(result.label, 'B'.repeat(80));
});
