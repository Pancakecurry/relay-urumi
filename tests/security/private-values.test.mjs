import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { privateValues } from '../../scripts/private-values.mjs';

test('Kubernetes field projections and scheduling keys are public references', () => {
  const values = [];
  privateValues({ items: [{ spec: {
    tolerations: [{ key: 'node.kubernetes.io/unreachable', operator: 'Exists' }],
    containers: [{ env: [{ valueFrom: { secretKeyRef: { name: 'store', key: 'SECURE_AUTH_SALT' } } }] }],
    volumes: [
      { secret: { secretName: 'store', items: [{ key: 'SECURE_AUTH_SALT', path: 'salt' }] } },
      { projected: { sources: [{ secret: { name: 'store', items: [{ key: 'SECURE_AUTH_SALT', path: 'salt' }] } }] } },
      { configMap: { name: 'settings', items: [{ key: 'PUBLIC_CONFIGURATION', path: 'config' }] } },
    ],
  } }] }, values);
  assert.deepEqual(values, []);
});

test('actual personal keys, passwords, OAuth codes and authorization values remain collected', () => {
  const values = [];
  const fixtures = { key: 'personal-key-test-only-123', password: 'password-test-only-123', code: 'oauth-code-test-only-123', authorization: 'Bearer token-test-only-123' };
  privateValues(fixtures, values);
  for (const value of Object.values(fixtures)) {
    assert(values.includes(value));
    assert(values.includes(Buffer.from(value).toString('base64')));
  }
});

test('ordinary key objects and arrays cannot escape collection by resembling projections', () => {
  const values = [];
  const credential = 'actual-key-test-only-123';
  privateValues({ items: [{ key: credential, path: 'salt', name: 'store' }], secret: { items: [{ key: credential, path: 'salt' }] } }, values);
  assert.equal(values.filter(value => value === credential).length, 2);
});
