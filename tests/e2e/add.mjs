import { focusPage, uploadFixture } from './browser.mjs';
// 추가 화면 시나리오: 암호화 백업 → 완료 안내 → 필요한 경우에만 코드 확인 펼치기.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { totp } from './vault-fixture.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/orig-enc-backup.json', import.meta.url));
const PASSWORD = 'test-pass-1234';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Bytes(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

// 1.0.5 형식: 비밀번호 건 2FAS·SDA maFile·manifest.json(비밀키 없음 안내)을 한꺼번에 고른다. 모두 가짜 계정.
async function writeNewFormatFiles() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'otp-e2e-files-'));
  const salt = crypto.randomBytes(256);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync('fake-2fas-pass', salt, 10000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const services = [{ name: 'E2E-2FAS', secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    otp: { account: 'bob', digits: 6, period: 30, algorithm: 'SHA1', tokenType: 'TOTP' } }];
  const body = Buffer.concat([cipher.update(JSON.stringify(services)), cipher.final(), cipher.getAuthTag()]);
  const twoFas = { services: [], groups: [], schemaVersion: 4, appOrigin: 'android', reference: 'x',
    servicesEncrypted: [body, salt, iv].map((b) => b.toString('base64')).join(':') };
  const files = {
    'backup.2fas': JSON.stringify(twoFas),
    '76561198000000001.maFile': JSON.stringify({ shared_secret: Buffer.from('abcdefghijklmnopqrst').toString('base64'),
      account_name: 'e2e-gamer', revocation_code: 'R00000' }),
    'manifest.json': JSON.stringify({ encrypted: false, entries: [{ filename: '76561198000000001.maFile', steamid: 1 }] }),
  };
  const paths = [];
  for (const [name, text] of Object.entries(files)) {
    const p = path.join(dir, name);
    await fs.writeFile(p, text);
    paths.push(p);
  }
  return { dir, paths };
}

export async function runAddScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];

  try {
    // 빈 금고에서 시작
    const seed = await browser.newPage();
    pages.push(seed);
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate(() => chrome.storage.local.remove('vault'));
    await seed.close();
    pages.pop();

    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`add pageerror: ${err.message}`));
    await page.goto(`${origin}/manage.html#add`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(page);
    await page.waitForSelector('[data-section="add"] .add-tabs', { timeout: 10000 });

    const startedAt = Date.now();
    await page.click('[data-role="tab-file"]');
    const input = await page.waitForSelector('[data-role="file-input"]', { timeout: 5000 });
    await uploadFixture(input, FIXTURE, session);

    await page.waitForSelector('[data-role="password"]', { timeout: 10000 });
    await page.type('[data-role="password"]', PASSWORD);
    await page.click('[data-role="submit-password"]');

    await page.waitForSelector('[data-role="result"]', { timeout: 15000 });
    const added = await page.$eval('[data-role="result"]', (el) => el.getAttribute('data-added'));
    if (added !== '1') problems.push(`추가가 1개여야 하는데 data-added=${added}`);
    if (await page.$('[data-role="verify-row"]')) problems.push('선택하지 않은 코드 확인 목록이 기본 표시됨');
    await page.click('[data-role="verify-toggle"]');
    await page.waitForSelector('[data-role="verify-row"] [data-code]', { timeout: 10000 });
    const code = await page.$eval('[data-role="verify-row"] [data-code]', (el) =>
      el.getAttribute('data-code'),
    );
    const endedAt = Date.now();
    const secret = base32Bytes('JBSWY3DPEHPK3PXP');
    const expected = [totp(secret, startedAt), totp(secret, endedAt)];
    if (!expected.includes(code)) {
      problems.push(`확인 줄 코드가 다름: got ${JSON.stringify(code)}, want one of ${expected.join('/')}`);
    }

    // 새 형식 묶음
    const made = await writeNewFormatFiles();
    try {
      await page.goto(`${origin}/manage.html#add`, { waitUntil: session.navigationWait ?? 'load' });
      await page.waitForSelector('[data-section="add"] .add-tabs', { timeout: 10000 });
      await page.click('[data-role="tab-file"]');
      const more = await page.waitForSelector('[data-role="file-input"]', { timeout: 5000 });
      await uploadFixture(more, made.paths, session);
      await page.waitForSelector('[data-role="password"]', { timeout: 10000 });
      await page.type('[data-role="password"]', 'wrong-pass');
      await page.click('[data-role="submit-password"]');
      await page.waitForSelector('.add-password .error[role="alert"]', { timeout: 15000 })
        .catch(() => problems.push('틀린 2FAS 비밀번호 안내가 보이지 않음'));
      await page.$eval('[data-role="password"]', (el) => { el.value = ''; });
      await page.type('[data-role="password"]', 'fake-2fas-pass');
      await page.click('[data-role="submit-password"]');
      await page.waitForSelector('[data-role="result"]', { timeout: 15000 });
      const r = await page.$eval('[data-role="result"]', (el) => ({
        added: el.getAttribute('data-added'), failed: el.getAttribute('data-failed'), text: el.textContent ?? '',
      }));
      if (r.added !== '2') problems.push(`새 형식 추가가 2개여야 하는데 data-added=${r.added}`);
      if (r.failed !== '1') problems.push(`새 형식 실패가 1개(manifest)여야 하는데 data-failed=${r.failed}`);
      if (!r.text.includes('manifest.json') || !r.text.includes('.maFile')) {
        problems.push(`manifest.json 안내가 없음: ${r.text.slice(0, 200)}`);
      }

      // 여러 파일 중 잠긴 파일의 비밀번호를 취소해도 나머지 파일 결과가 남아야 한다.
      await page.reload({ waitUntil: session.navigationWait ?? 'load' });
      await page.waitForSelector('[data-section="add"] .add-tabs', { timeout: 10000 });
      await page.click('[data-role="tab-file"]');
      const again = await page.waitForSelector('[data-role="file-input"]', { timeout: 5000 });
      await uploadFixture(again, made.paths, session);
      await page.waitForSelector('[data-role="cancel-password"]', { timeout: 10000 });
      await page.click('[data-role="cancel-password"]');
      const c = await page.waitForSelector('[data-role="result"]', { timeout: 15000 })
        .then(() => page.$eval('[data-role="result"]', (el) => ({ failed: el.getAttribute('data-failed'), text: el.textContent ?? '' })))
        .catch(() => null);
      if (!c) problems.push('비밀번호 취소 뒤 나머지 파일 결과가 안 나옴');
      else if (c.failed !== '2' || !c.text.includes('backup.2fas')) {
        problems.push(`비밀번호 취소 결과가 다름: failed=${c.failed} ${c.text.slice(0, 200)}`);
      }
    } finally {
      await fs.rm(made.dir, { recursive: true, force: true });
    }
  } catch (error) {
    problems.push(`시나리오 오류: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    for (const page of pages) {
      try {
        await page.close();
      } catch {
        // 이미 닫힘
      }
    }
  }
  return problems;
}
