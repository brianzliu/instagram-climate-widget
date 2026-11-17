import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
await mkdir('release', { recursive: true });
const checksums = [];
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
for (const [target, suffix] of [['chromium', 'zip'], ['firefox', 'xpi']]) {
  const name = `touch-grass-${target}-${version}.${suffix}`;
  const file = resolve('release', name);
  await rm(file, { force: true });
  const result = spawnSync('zip', ['-qr', file, '.'], { cwd: resolve('dist', target), stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Packaging requires the zip command. The unpacked extension folders are still ready in dist/.');
  const hash = createHash('sha256').update(await readFile(file)).digest('hex');
  checksums.push(`${hash}  ${name}`);
  console.log(`Packaged release/${name}`);
}
await writeFile('release/SHA256SUMS', `${checksums.join('\n')}\n`);
