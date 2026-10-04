// Copies circuits, inputs and reference results from the repo root into
// web/public/data so the static site can fetch them. Writes a manifest with
// file sizes so the UI knows what is available (the SHA-256 Groth16 zkey is
// ~290 MB and is not committed; it is only served if you built it locally).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '..');
const out = join(web, 'public/data');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const manifest = { files: {}, reference: { native: [], browser: [] } };
function copyDir(src, dst, filter = () => true) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    const p = join(src, f);
    if (!statSync(p).isFile() || !filter(f)) continue;
    cpSync(p, join(dst, f));
    manifest.files[join(dst, f).slice(out.length + 1)] = statSync(p).size;
  }
}
copyDir(join(root, 'artifacts/noir'), join(out, 'noir'));
copyDir(join(root, 'artifacts/circom'), join(out, 'circom'));
copyDir(join(root, 'inputs'), join(out, 'inputs'));
cpSync(join(root, 'artifacts/circuit-sizes.json'), join(out, 'circuit-sizes.json'));

for (const kind of ['native', 'browser']) {
  const dir = kind === 'native' ? join(root, 'results') : join(root, 'results/browser');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    manifest.reference[kind].push(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  }
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
console.log(
  `synced ${Object.keys(manifest.files).length} files, ${manifest.reference.native.length} native + ${manifest.reference.browser.length} browser reference runs`,
);
