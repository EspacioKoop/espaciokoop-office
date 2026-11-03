import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('bootstrap efímero Hermes: propiedad, limpieza y salida', () => {
  const result = spawnSync('/usr/bin/python3', ['test/hermes-office-profile.py'], { encoding:'utf8', env:{PATH:'/usr/bin:/bin', TMPDIR:process.env.TMPDIR || '/tmp'} });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
