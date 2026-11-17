import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('source manifest limits site access and uses only packaged code', async () => {
  const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Touch Grass');
  assert.equal(manifest.action.default_title, 'Open Touch Grass');
  assert.ok(!manifest.permissions.includes('tabs'));
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));
  assert.equal(manifest.content_scripts[0].matches.length, 2);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
});
