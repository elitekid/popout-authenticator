import { sizePage, uploadFixture } from './browser.mjs';
// 새 복구 도구의 실제 화면 연결: 읽기 전용 대조, 작업 취소, 계정 하나만 복원, 잠금 시 폐기.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { makeNoneVault } from './vault-fixture.mjs';

const SECRET = Buffer.from('48656c6c6f21deadbeef', 'hex');
function account(id, secret = SECRET) {
  return { id, type: 'totp', issuer: id, label: `${id}@example.test`, secret, algorithm: 'SHA-1',
    digits: 6, period: 30, note: '현재 메모', pinned: false, matchHosts: [], createdAt: 1, updatedAt: 2, lastUsedAt: 3 };
}
function base32(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
async function readAccounts(vault) {
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(vault.wrappedKeys[0].data, 'base64'), 'AES-GCM', false, ['decrypt']);
  const bytes = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(vault.iv, 'base64') }, key, Buffer.from(vault.data, 'base64'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function runRecoveryToolsScenario(session, screenshotDir) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const page = await browser.newPage();
  const dir = await fs.mkdtemp('/tmp/otp-recovery-tools-');
  page.on('pageerror', (error) => problems.push(`recovery pageerror: ${error.message}`));
  try {
    await sizePage(page, { width: 400, height: 700 });
    await page.goto(`${origin}/manage.html?compact=1#backup`, { waitUntil: session.navigationWait ?? 'load' });
    const accounts = [account('Alpha'), account('Bravo', Buffer.from('12345678901234567890')), account('Charlie', Buffer.from('12345678901234567890123456789012')),
      ...Array.from({ length: 9 }, (_, i) => account(`Fake${i}`))];
    const vault = await makeNoneVault(accounts);
    const snapshots = [];
    for (let i = 1; i <= 11; i++) snapshots.push(await makeNoneVault(accounts.map((a) => ({ ...a, note: `과거 메모 ${i}`, updatedAt: i }))));
    await page.evaluate(async ({ vault, snapshots }) => {
      await chrome.storage.session.clear();
      await chrome.storage.local.set({ vault, settings: { language: 'ko', theme: 'dark', popupSize: 'small', clockCheck: false, syncEnabled: false } });
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('popout-authenticator', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true }).createIndex('takenAt', 'takenAt');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        const store = tx.objectStore('snapshots'); store.clear();
        snapshots.forEach((file, i) => store.add({ id: i + 1, takenAt: Date.now() - (20 - i) * 1000, count: file.count, lock: file.lock, file }));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, { vault, snapshots });
    await page.reload({ waitUntil: session.navigationWait ?? 'load' });

    const backupPath = path.join(dir, 'fake-comparison.json');
    const plainBackup = { format: 'popout-authenticator-backup', version: 1,
      encrypted: false, exportedAt: new Date().toISOString(),
      accounts: accounts.slice(0, 2).map((a, i) => ({ ...a, secret: base32(a.secret), digits: i ? 8 : 6 })) };
    await fs.writeFile(backupPath, JSON.stringify(plainBackup));
    await uploadFixture((await page.waitForSelector('[data-role="compare-file"]')), backupPath, session);
    await page.waitForSelector('[data-role="compare-results"]');
    assert.deepEqual(await page.$$eval('[data-compare-status]', (els) => els.map((e) => e.dataset.compareStatus)), ['same', 'changed', ...Array(10).fill('missing')]);
    assert.equal(await page.evaluate(() => chrome.storage.local.get('vault').then(({ vault }) => vault.checksum)), vault.checksum, '대조가 금고를 바꾸면 안 됨');
    assert.equal(await page.$eval('[data-role="compare-results"]', (e) => /JBSWY3DPEHPK3PXP|otpauth:/.test(e.textContent)), false);
    if (screenshotDir) {
      await sizePage(page, { width: 320, height: 700 });
      await page.screenshot({ path: path.join(screenshotDir, 'compare-dark-320.png') });
    }

    // 기존 가짜 암호화 백업: 잘못된 비밀번호 뒤 취소, 같은 파일 재선택과 올바른 비밀번호.
    const encryptedPath = new URL('../fixtures/2fa-enc-backup.json', import.meta.url).pathname;
    await uploadFixture((await page.$('[data-role="compare-file"]')), encryptedPath, session);
    await page.waitForSelector('[data-role="compare-password"]');
    await page.type('[data-role="compare-password"]', 'wrong-fake-password');
    await page.click('[data-role="compare-submit"]');
    await page.waitForSelector('[data-role="compare-password"]');
    await page.type('[data-role="compare-password"]', 'fake-pass-5678');
    await page.click('[data-role="compare-submit"]');
    const cancelledAt = Date.now();
    await page.click('[data-role="compare-cancel"]');
    await page.waitForFunction(() => !document.querySelector('[data-role="compare-password"]') && !document.querySelector('[data-role="compare-results"]') && !document.querySelector('[data-role="compare-file"]').disabled);
    console.log(`recovery compare cancel: ${Date.now() - cancelledAt}ms`);
    await uploadFixture((await page.$('[data-role="compare-file"]')), encryptedPath, session);
    await page.waitForSelector('[data-role="compare-password"]');
    await page.type('[data-role="compare-password"]', 'fake-pass-5678');
    await page.click('[data-role="compare-submit"]');
    await page.waitForSelector('[data-role="compare-results"]', { timeout: 30000 });
    assert.equal(await page.evaluate(() => chrome.storage.local.get('vault').then(({ vault }) => vault.checksum)), vault.checksum);

    // 자체 Argon2 백업도 Worker의 WASM/CSP 환경에서 해독할 수 있어야 한다.
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const rawKey = await argon2id({ password: 'fake-own-password', salt, iterations: 3, memorySize: 65536, parallelism: 1, hashLength: 32, outputType: 'binary' });
    const key = await webcrypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ accounts: plainBackup.accounts })));
    const ownEncrypted = { format: plainBackup.format, version: 1, encrypted: true, exportedAt: plainBackup.exportedAt,
      kdf: { name: 'argon2id', salt: Buffer.from(salt).toString('base64'), iterations: 3, memoryKiB: 65536, parallelism: 1 },
      iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64') };
    const ownPath = path.join(dir, 'fake-own-encrypted.json');
    await fs.writeFile(ownPath, JSON.stringify(ownEncrypted));
    await uploadFixture((await page.$('[data-role="compare-file"]')), ownPath, session);
    await page.waitForSelector('[data-role="compare-password"]');
    await page.type('[data-role="compare-password"]', 'fake-own-password');
    await page.click('[data-role="compare-submit"]');
    await page.waitForSelector('[data-role="compare-results"]', { timeout: 30000 });
    assert.equal(await page.$$eval('[data-compare-status="same"]', (els) => els.length), 1);
    // 높은 비용을 요구한 가짜 파일도 화면을 막지 않고 계산 도중 종료할 수 있어야 한다.
    await fs.writeFile(ownPath, JSON.stringify({ ...ownEncrypted, kdf: { ...ownEncrypted.kdf, iterations: 64 } }));
    await uploadFixture((await page.$('[data-role="compare-file"]')), ownPath, session);
    await page.waitForSelector('[data-role="compare-password"]');
    await page.type('[data-role="compare-password"]', 'fake-own-password');
    await page.click('[data-role="compare-submit"]');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const argonCancelAt = Date.now();
    await page.click('[data-role="compare-cancel"]');
    await page.waitForFunction(() => !document.querySelector('[data-role="compare-file"]').disabled && !document.querySelector('[data-role="compare-results"]'));
    console.log(`recovery Argon2 cancel: ${Date.now() - argonCancelAt}ms`);

    // 실제 popup 메뉴에서 기록으로 들어가고, 10개 다음 페이지를 읽어 가장 최근 과거 상태를 복원.
    await page.goto(`${origin}/popup.html`, { waitUntil: session.navigationWait ?? 'load' });
    await page.waitForSelector('[data-account-id="Alpha"] [data-role="more"]');
    const listScroll = await page.$eval('.popup-list', (e) => { e.scrollTop = 100; return e.scrollTop; });
    // 메뉴 단추 클릭에 따른 자동 스크롤을 피하려고 이미 보이는 Charlie에서 기록에 들어갔다 뒤로 돌아온다.
    await page.click('[data-account-id="Charlie"] [data-role="more"]');
    const beforeHistoryScroll = await page.$eval('.popup-list', (e) => e.scrollTop);
    assert.ok(listScroll > 0);
    await page.click('[data-role="menu-history"]');
    await page.waitForSelector('[data-role="history-entry"]');
    await page.click('[data-role="screen-back"]');
    await page.waitForSelector('.popup-list');
    assert.equal(await page.$eval('.popup-list', (e) => e.scrollTop), beforeHistoryScroll, '기록에서 돌아올 때 목록 위치가 바뀜');
    await page.$eval('.popup-list', (e) => { e.scrollTop = 0; });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.click('[data-account-id="Alpha"] [data-role="more"]');
    await page.click('[data-role="menu-history"]');
    await page.waitForSelector('[data-role="history-entry"]');
    assert.equal(await page.$$eval('[data-role="history-entry"]', (els) => els.length), 10);
    await page.click('[data-role="history-more"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-role="history-entry"]').length === 11);
    await page.click('[data-role="history-entry"][data-id="11"] [data-role="history-preview"]');
    await page.waitForSelector('[data-role="history-confirm"]');
    assert.equal(await page.$eval('[data-role="history-confirm"]', (e) => e.textContent.includes('과거 메모 11')), true);
    assert.equal(await page.$eval('[data-role="account-history"]', (e) => /JBSWY3DPEHPK3PXP|otpauth:/.test(e.textContent)), false);
    if (screenshotDir) {
      await page.$eval('[data-role="history-confirm"]', (e) => e.scrollIntoView({ block: 'end' }));
      await page.screenshot({ path: path.join(screenshotDir, 'history-dark-320.png') });
    }
    // 복원 대기 중 외부 쓰기가 들어오면 결과를 비우되 실패/다시 불러오기 길이 남아야 한다.
    await page.evaluate(async () => {
      let ready;
      const acquired = new Promise((resolve) => { ready = resolve; });
      void navigator.locks.request('popout-vault-write', () => new Promise((resolve) => {
        window.__releaseRecoveryLock = resolve; ready();
      }));
      await acquired;
    });
    await page.click('[data-role="history-restore"]');
    await page.waitForFunction(() => document.querySelector('[data-role="history-restore"]').disabled);
    await page.evaluate(async () => {
      const { vault } = await chrome.storage.local.get('vault');
      await chrome.storage.local.set({ vault: { ...vault, savedAt: vault.savedAt + 1 } });
    });
    await page.waitForSelector('[data-role="history-reload"]');
    assert.equal(await page.evaluate(() => chrome.storage.local.get('vault').then(({ vault }) => vault.checksum)), vault.checksum);
    await page.click('[data-role="history-reload"]');
    await page.waitForSelector('[data-role="history-entry"][data-id="11"] [data-role="history-preview"]');
    // 재조회가 끝난 다음 옛 대기 작업이 실패해도 새 화면에 오류나 busy 상태를 덮어쓰면 안 된다.
    await page.evaluate(() => window.__releaseRecoveryLock());
    await page.waitForFunction(() => navigator.locks.query().then(({ pending }) => !pending.some((l) => l.name === 'popout-vault-write')));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.$('[data-role="account-history"] [role="alert"]'), null);
    await page.click('[data-role="history-entry"][data-id="11"] [data-role="history-preview"]');
    await page.waitForSelector('[data-role="history-confirm"]');
    await page.click('[data-role="history-restore"]');
    await page.waitForFunction((checksum) => chrome.storage.local.get('vault').then(({ vault }) => vault.checksum !== checksum), {}, vault.checksum);
    const restored = await page.evaluate(() => chrome.storage.local.get('vault').then(({ vault }) => vault));
    const decoded = await readAccounts(restored);
    assert.deepEqual(decoded.map((a) => a.id), accounts.map((a) => a.id));
    assert.equal(decoded[0].note, '과거 메모 11');
    assert.equal(decoded[0].lastUsedAt, accounts[0].lastUsedAt);
    assert.deepEqual(decoded.slice(1), accounts.slice(1).map((a) => ({ ...a, secret: a.secret.toString('base64') })));

    // 잠금 뒤 대조 결과/파일 선택기가 남지 않아야 한다.
    const unlockedKey = restored.wrappedKeys[0].data;
    await page.evaluate(async ({ restored, unlockedKey }) => {
      await chrome.storage.session.set({ vaultKey: unlockedKey, unlockedAt: Date.now() });
      await chrome.storage.local.set({ vault: { ...restored, lock: 'password', wrappedKeys: [] } });
    }, { restored, unlockedKey });
    await page.goto(`${origin}/manage.html?compact=1#backup`, { waitUntil: session.navigationWait ?? 'load' });
    await uploadFixture((await page.waitForSelector('[data-role="compare-file"]')), backupPath, session);
    await page.waitForSelector('[data-role="compare-results"]');
    await page.evaluate(() => chrome.storage.session.remove('vaultKey'));
    await page.waitForSelector('[data-role="unlock-form"]');
    assert.equal(await page.$('[data-role="compare-results"]'), null);
    assert.equal(await page.$('[data-role="compare-file"]'), null);
  } catch (error) {
    problems.push(`recovery: ${error instanceof Error ? error.stack : String(error)}`);
  } finally {
    await page.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
  return problems;
}
