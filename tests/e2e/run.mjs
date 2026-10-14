import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, launchWithExtension, openAndCheck } from './browser.mjs';
import { writeFakeCamera } from './fake-camera.mjs';
import { CAMERA_LINKS, runQrScenario } from './qr.mjs';
import { runPopupScenario } from './popup.mjs';
import { runOpenModeScenario } from './open-mode.mjs';
import { runAddScenario } from './add.mjs';
import { runAccountsScenario } from './accounts.mjs';
import { runClipboardScenario, runFillScenario } from './fill.mjs';
import { runFieldButtonScenario, runKnownFieldScenario } from './field-button.mjs';
import { runBackupScenario } from './backup.mjs';
import { runShareScenario } from './share.mjs';
import { runLockScenario, runCodeAccessScenario } from './lock.mjs';
import { runResetScenario } from './reset.mjs';
import { runRecoveryToolsScenario } from './recovery-tools.mjs';

const chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  console.error(
    'CHROME_PATH is not set. Point it at a Chrome for Testing executable, e.g.\n' +
      '  CHROME_PATH="/path/to/Google Chrome for Testing" npm run e2e',
  );
  process.exit(1);
}

const distDir = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
  console.error(`dist/ not found at ${distDir}. Run "npm run build" first.`);
  process.exit(1);
}

const pages = [
  { file: 'popup.html', app: 'popup' },
  { file: 'manage.html', app: 'manage' },
];

const cameraFile = `/tmp/otp-e2e-cam-${crypto.randomBytes(6).toString('hex')}.y4m`;

// 시험용 사본: 코드 넣기는 실제로는 사용자 동작(우클릭·단축키·팝업)이 주는 activeTab 으로 탭에 들어간다.
// 시험에서는 그 동작을 흉내 낼 수 없어 사본 manifest 에만 시험 서버 접근을 더한다. 제품 manifest 는 그대로.
const testDist = `/tmp/otp-e2e-dist-${crypto.randomBytes(6).toString('hex')}`;
fs.cpSync(distDir, testDist, { recursive: true });
{
  const manifestPath = path.join(testDist, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = ['*://127.0.0.1/*', ...['github.com', 'gitlab.com', 'accounts.google.com', 'dash.cloudflare.com', 'www.dropbox.com', 'dropbox.com', 'account.jetbrains.com'].map(host => `https://${host}/*`)];
  manifest.permissions = [...manifest.permissions, 'clipboardRead'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

let session;
let failed = false;
try {
  await writeFakeCamera(cameraFile, CAMERA_LINKS);
  session = await launchWithExtension({
    chromePath,
    distDir: testDist,
    extraArgs: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${cameraFile}`,
    ],
  });
  console.log(`extension id: ${session.extensionId}`);
  for (const { file, app } of pages) {
    const problems = await openAndCheck(
      session.browser,
      `chrome-extension://${session.extensionId}/${file}`,
      app,
    );
    if (problems.length > 0) {
      failed = true;
      console.error(`FAIL ${file}`);
      for (const problem of problems) console.error(`  ${problem}`);
    } else {
      console.log(`ok   ${file}`);
    }
  }
  const popupProblems = await runPopupScenario(session);
  if (popupProblems.length > 0) {
    failed = true;
    console.error('FAIL popup scenario');
    for (const problem of popupProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   popup scenario');
  }
  const openModeProblems = await runOpenModeScenario(session);
  if (openModeProblems.length > 0) {
    failed = true;
    console.error('FAIL open-mode scenario');
    for (const problem of openModeProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   open-mode scenario');
  }
  const addProblems = await runAddScenario(session);
  if (addProblems.length > 0) {
    failed = true;
    console.error('FAIL add scenario');
    for (const problem of addProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   add scenario');
  }
  const qrProblems = await runQrScenario(session);
  if (qrProblems.length > 0) {
    failed = true;
    console.error('FAIL qr scenario');
    for (const problem of qrProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   qr scenario');
  }
  const accountsProblems = await runAccountsScenario(session);
  if (accountsProblems.length > 0) {
    failed = true;
    console.error('FAIL accounts scenario');
    for (const problem of accountsProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   accounts scenario');
  }
  const fillProblems = await runFillScenario(session);
  if (fillProblems.length > 0) {
    failed = true;
    console.error('FAIL fill scenario');
    for (const problem of fillProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   fill scenario');
  }
  const fieldButtonProblems = await runFieldButtonScenario(session);
  if (fieldButtonProblems.length > 0) {
    failed = true;
    console.error('FAIL field-button scenario');
    for (const problem of fieldButtonProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   field-button scenario');
  }
  const knownFieldProblems = await runKnownFieldScenario(session);
  if (knownFieldProblems.length > 0) {
    failed = true;
    console.error('FAIL known-field scenario');
    for (const problem of knownFieldProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   known-field scenario');
  }
  const clipboardProblems = await runClipboardScenario(session);
  if (clipboardProblems.length > 0) {
    failed = true;
    console.error('FAIL clipboard scenario');
    for (const problem of clipboardProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   clipboard scenario');
  }
  const backupProblems = await runBackupScenario(session);
  if (backupProblems.length > 0) {
    failed = true;
    console.error('FAIL backup scenario');
    for (const problem of backupProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   backup scenario');
  }
  const shareProblems = await runShareScenario(session);
  if (shareProblems.length > 0) {
    failed = true;
    console.error('FAIL share scenario');
    for (const problem of shareProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   share scenario');
  }
  const lockProblems = await runLockScenario(session);
  if (lockProblems.length > 0) {
    failed = true;
    console.error('FAIL lock scenario');
    for (const problem of lockProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   lock scenario');
  }
  const recoveryProblems = await runRecoveryToolsScenario(session);
  if (recoveryProblems.length > 0) {
    failed = true;
    console.error('FAIL recovery-tools scenario');
    for (const problem of recoveryProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   recovery-tools scenario');
  }
  const codeAccessProblems = await runCodeAccessScenario(session);
  if (codeAccessProblems.length > 0) {
    failed = true;
    console.error('FAIL code-access scenario');
    for (const problem of codeAccessProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   code-access scenario');
  }
  // 저장소를 모두 지우므로 반드시 맨 마지막에 돌린다.
  const resetProblems = await runResetScenario(session);
  if (resetProblems.length > 0) {
    failed = true;
    console.error('FAIL reset scenario');
    for (const problem of resetProblems) console.error(`  ${problem}`);
  } else {
    console.log('ok   reset scenario');
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  if (session) await cleanup(session);
  fs.rmSync(cameraFile, { force: true });
  fs.rmSync(testDist, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
