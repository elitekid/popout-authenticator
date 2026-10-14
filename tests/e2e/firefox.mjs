// Firefox BiDi에서 같은 제품 시나리오를 실행한다. 실제 확장을 임시 프로필에 설치한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, launchWithExtension, openAndCheck } from './browser.mjs';
import { runPopupScenario } from './popup.mjs';
import { runOpenModeScenario } from './open-mode.mjs';
import { runAddScenario } from './add.mjs';
import { runAccountsScenario } from './accounts.mjs';
import { runFieldButtonScenario, runKnownFieldScenario } from './field-button.mjs';
import { runBackupScenario } from './backup.mjs';
import { runShareScenario } from './share.mjs';
import { runRecoveryToolsScenario } from './recovery-tools.mjs';
import { runResetScenario } from './reset.mjs';

if (!process.env.FIREFOX_PATH) throw new Error('Set FIREFOX_PATH to the Firefox executable.');
const distDir = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR)
  : fileURLToPath(new URL('../../dist-firefox', import.meta.url));
const testDist = fs.mkdtempSync('/tmp/otp-firefox-dist-');
fs.cpSync(distDir, testDist, { recursive: true });
const manifestPath = path.join(testDist, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
// Chrome 시험과 같이 가짜 사이트 권한만 사전 허용한다. 네이티브 허용창 시험은 아니다.
manifest.host_permissions = ['*://127.0.0.1/*', ...[
  'github.com', 'gitlab.com', 'accounts.google.com', 'dash.cloudflare.com',
  'www.dropbox.com', 'dropbox.com', 'account.jetbrains.com',
].map((host) => `https://${host}/*`)];
manifest.permissions = [...manifest.permissions, 'clipboardRead'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const scenarios = [
  ['popup', runPopupScenario], ['open-mode', runOpenModeScenario], ['add', runAddScenario],
  ['accounts', runAccountsScenario], ['field-button', runFieldButtonScenario],
  ['known-field', runKnownFieldScenario], ['backup', runBackupScenario],
  ['share', runShareScenario], ['recovery-tools', runRecoveryToolsScenario],
  // 모든 저장소를 지우므로 마지막에 실행한다.
  ['reset', runResetScenario],
];
const selected = new Set(process.argv.slice(2));
let session;
let failed = false;
try {
  session = await launchWithExtension({
    chromePath: process.env.FIREFOX_PATH, distDir: testDist, browserName: 'firefox',
  });
  console.log(await session.browser.version());
  if (!selected.size) {
    for (const [file, root] of [['popup', 'popup'], ['manage', 'manage'], ['window', 'popup'], ['sidepanel', 'popup']]) {
      const problems = await openAndCheck(session.browser, `${session.baseUrl}/${file}.html`, root, session.navigationWait);
      if (problems.length) { failed = true; console.error(`FAIL ${file}`, problems); }
      else console.log(`ok ${file}`);
    }
  }
  for (const [name, run] of scenarios) {
    if (selected.size && !selected.has(name)) continue;
    const problems = await run(session);
    if (problems.length) { failed = true; console.error(`FAIL ${name}`, problems); }
    else console.log(`ok ${name}`);
  }
  console.log('NOT RUN: CDP-only virtual passkey/approval hooks, service-worker-only fill hooks, Chromium fake-camera stream.');
  console.log('Field-button scenarios exercise real content-script fill and auto-submit; no native permission or biometric prompt was accepted.');
  console.log('File fixtures use DOM File input because Firefox BiDi cannot set files in extension pages; file decoding and downloads remain real.');
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  if (session) await cleanup(session);
  fs.rmSync(testDist, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
