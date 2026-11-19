import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
const base = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
for (const target of ['chromium', 'firefox']) {
  const outdir = `dist/${target}`;
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp('dist/app', outdir, { recursive: true });
  await cp('extension/popup.html', `${outdir}/popup.html`);
  await cp('assets/icons', `${outdir}/icons`, { recursive: true });
  const manifest = structuredClone(base);
  if (target === 'firefox') {
    manifest.background = { scripts: ['background.js'] };
    // Retain the installed add-on identity and its existing local journal data.
    manifest.browser_specific_settings = { gecko: { id: 'evergreen-climate@local.example', strict_min_version: '140.0', data_collection_permissions: { required: ['websiteContent'] } } };
  }
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await build({ entryPoints: ['extension/content.js', 'extension/background.js', 'extension/popup.js'], outdir, bundle: true, format: 'iife', loader: { '.css': 'text', '.png': 'dataurl' }, target: ['chrome120', 'firefox140'], minify: true });
  console.log(`Built ${outdir}`);
}
