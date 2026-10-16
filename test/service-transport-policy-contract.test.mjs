import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceConfiguration } from '../src/server.mjs';

// Only synthetic configuration. No listeners, credentials, network calls or TLS files.
const configError = env => assert.throws(
  () => serviceConfiguration(env),
  error => error?.code === 'CONFIG',
  'Unsafe service configuration must fail closed with a typed CONFIG error',
);

test('remote policy: default and both IP families of loopback stay local', () => {
  for (const bind of ['127.0.0.1', '127.5.1.2', '::1']) {
    const config = serviceConfiguration({ OFFICE_BIND: bind });
    assert.equal(config.bind, bind);
    assert.equal(config.publicOrigin, undefined);
    assert.equal(config.tls, undefined);
  }
  assert.equal(serviceConfiguration({ OFFICE_BIND: 'localhost' }).bind, '127.0.0.1');
});

test('remote policy: a non-loopback bind needs its own origin and encrypted transport', () => {
  for (const bind of ['0.0.0.0', '192.0.2.50', '::', '2001:db8::50', '::ffff:127.0.0.1']) {
    configError({ OFFICE_BIND: bind });
    configError({ OFFICE_BIND: bind, OFFICE_PUBLIC_ORIGIN: 'https://office.example' });
    configError({ OFFICE_BIND: bind, OFFICE_PRIVATE_TUNNEL: '1' });

    const allowed = serviceConfiguration({
      OFFICE_BIND: bind, OFFICE_PUBLIC_ORIGIN: 'http://office.example',
      OFFICE_PRIVATE_TUNNEL: '1'
    });
    assert.equal(allowed.bind, bind);
    assert.equal(allowed.publicOrigin, 'http://office.example');
  }
});

test('remote policy: guessed tunnel values and forwarded headers are not authority', () => {
  for (const flag of ['true', 'yes', '0', 'on', 'TRUE', ' 1', '1 ']) {
    configError({ OFFICE_BIND: '0.0.0.0', OFFICE_PUBLIC_ORIGIN: 'https://office.example',
      OFFICE_PRIVATE_TUNNEL: flag });
  }
  configError({ OFFICE_BIND: '0.0.0.0', OFFICE_PUBLIC_ORIGIN: 'https://office.example',
    HTTP_X_FORWARDED_PROTO: 'https', HTTP_X_FORWARDED_HOST: 'office.example',
    FORWARDED: 'proto=https' });
});

test('remote policy: origin is exactly scheme and authority, without extras', () => {
  const accepted = ['https://office.example', 'https://office.example/'];
  for (const value of accepted) {
    const config = serviceConfiguration({ OFFICE_PUBLIC_ORIGIN: value });
    assert.equal(config.publicOrigin, 'https://office.example');
  }
  for (const invalid of [
    'https://alice:secret@office.example', 'https://office.example/a',
    'https://office.example/?token=secret', 'https://office.example/#frag',
    'https://office.example:443/', 'https://office.example/../other',
    'wss://office.example', 'file:///office.example', 'https://',
    'https://office.example.evil.invalid/path', 'javascript:alert(1)'
  ]) {
    configError({ OFFICE_PUBLIC_ORIGIN: invalid });
  }
});

test('remote policy: TLS settings must be paired, non-empty and explicitly HTTPS', () => {
  for (const bad of [
    { OFFICE_TLS_KEY: 'key.pem' }, { OFFICE_TLS_CERT: 'cert.pem' },
    { OFFICE_TLS_KEY: '', OFFICE_TLS_CERT: '' },
    { OFFICE_TLS_KEY: 'key.pem', OFFICE_TLS_CERT: 'cert.pem',
      OFFICE_PUBLIC_ORIGIN: 'http://office.example' }
  ]) {
    configError(bad);
  }
});

test('remote policy: invalid bind is never interpreted as a hostname', () => {
  for (const bind of ['office.example', 'localhost.localdomain', '', '[::1]', '127.0.0.1:4173']) {
    configError({ OFFICE_BIND: bind });
  }
});
