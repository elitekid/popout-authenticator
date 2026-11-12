import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const targets = process.argv.slice(2);
const supported = new Set(['chrome', 'edge', 'firefox', 'safari']);
if (targets.some((target) => !supported.has(target))) {
  throw new Error('Use chrome, edge, firefox or safari.');
}

function zip(args, cwd) {
  const result = spawnSync('zip', args, { cwd, stdio: 'inherit' });
  if (result.error) throw new Error('Packaging requires the zip command.', { cause: result.error });
  if (result.status !== 0) throw new Error(`zip failed (${result.status}).`);
}

for (const target of targets.length ? targets : ['default']) {
  const source = target === 'default' ? 'dist' : `dist-${target}`;
  const suffix = target === 'safari' ? 'safari-web-extension' : target;
  const name = target === 'default'
    ? 'popout-authenticator.zip'
    : `popout-authenticator-${version}-${suffix}.zip`;
  const archive = `${root}${name}`;
  // 이전 버전에만 있던 파일이 ZIP 안에 남지 않게 새로 만든다.
  rmSync(archive, { force: true });
  zip(['-qrX', archive, '.', '-x', '.DS_Store'], `${root}${source}`);
  zip(['-qjX', archive, 'LICENSE'], root);
  console.log(name);
}
