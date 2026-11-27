// 가져오기 해석 진입점: 텍스트의 모양으로 형식을 판별한다.
import { isCxf, readCxfWithFailures } from '../export/cxf';
import { isOwnBackup, readOwnBackup } from '../export/own';
import { parseLinks } from '../uri';
import { detectApp, parseApp } from './apps';
import { isFreeOtpBackup, parseFreeOtpBackup, parseFreeOtpPreferences } from './freeotp';
import { isProtonAuthenticator, parseProton } from './proton';
import { isSealed2fas, isSealedAegis, open2fas, openAegis } from './sealed';
import { isEncryptedMaFile, isMaFile, isSteamManifest, parseMaFile, rejectSteamManifest, SDA } from './steam';
import { isOriginalBackup, parseOriginal } from './original';
import { isTwoFaEncrypted, isTwoFaPlain, parseTwoFaEncrypted, parseTwoFaPlain } from './twofa';
import { ImportRejectedError, NeedsPasswordError, isObject, type ImportOutcome } from './types';

export * from './types';
export { detectApp, parseApp, type AppName } from './apps';
export { parseOriginal } from './original';
export { parseTwoFaPlain, parseTwoFaEncrypted } from './twofa';
export { parseSteamSecret } from './steam';

// UTF-8 이 아닌 글자는 깨진 글자로 바꿔 읽는다(전처럼 File.text() 와 같게). 파일 전체를 버리지 않는다.
const lenient = new TextDecoder('utf-8');

// 파일 그대로(이진 포함). FreeOTP 2 백업은 이진 Java 직렬화라 글자로 바꾸기 전에 본다.
export async function importFile(bytes: Uint8Array, fileName?: string, password?: string): Promise<ImportOutcome> {
  if (isFreeOtpBackup(bytes)) return parseFreeOtpBackup(bytes, password);
  return importText(lenient.decode(bytes), password, fileName);
}

export async function importText(text: string, password?: string, fileName?: string): Promise<ImportOutcome> {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (isEncryptedMaFile(trimmed, fileName)) throw new ImportRejectedError('encrypted', SDA);

  let json: unknown;
  let isJson = false;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      json = JSON.parse(trimmed);
      isJson = true;
    } catch {
      // JSON 이 아니면 링크 줄로 본다.
    }
  }

  if (isJson) {
    if (isOwnBackup(trimmed)) {
      if (isObject(json) && json.encrypted === true && !password) throw new NeedsPasswordError();
      const accounts = await readOwnBackup(trimmed, password);
      return {
        drafts: accounts.map(({ type, issuer, label, secret, algorithm, digits, period, counter }) => ({
          type, issuer, label, secret, algorithm, digits, period,
          ...(counter !== undefined ? { counter } : {}),
        })),
        failed: [],
        meta: accounts.map(({ pinned, group, note, matchHosts, iconId, iconImage }) => ({
          pinned, note, matchHosts, ...(group !== undefined ? { group } : {}),
          ...(iconId !== undefined ? { iconId } : {}),
          ...(iconImage !== undefined ? { iconImage } : {}),
        })),
        format: 'own',
      };
    }
    if (isCxf(trimmed)) return { ...readCxfWithFailures(trimmed), format: 'cxf' };
    if (isTwoFaEncrypted(json)) return parseTwoFaEncrypted(json, password);
    if (isTwoFaPlain(json)) return parseTwoFaPlain(json as Record<string, unknown>);
    if (isOriginalBackup(json)) return parseOriginal(json, password);
    if (isObject(json)) {
      if (isMaFile(json)) return parseMaFile(json);
      if (isProtonAuthenticator(json)) return parseProton(json);
      // Bitwarden 도 boolean encrypted 를 보므로 그보다 먼저.
      if (isSteamManifest(json)) rejectSteamManifest(json);
    }
    const app = detectApp(json);
    if (app === 'aegis' && isSealedAegis(json as Record<string, unknown>)) {
      return parseApp(app, await openAegis(json as Record<string, unknown>, password));
    }
    if (app === '2fas' && isSealed2fas(json as Record<string, unknown>)) {
      return parseApp(app, await open2fas(json as Record<string, unknown>, password));
    }
    if (app) return parseApp(app, json);
    if (isObject(json) || Array.isArray(json)) throw new ImportRejectedError('unknown');
  }

  const prefs = parseFreeOtpPreferences(trimmed);
  if (prefs) return prefs;

  const links = parseLinks(trimmed, Number.MAX_SAFE_INTEGER);
  if (links.drafts.length === 0 && links.failed.length === 0) throw new ImportRejectedError('unknown');
  return { drafts: links.drafts, failed: links.failed, format: 'links' };
}
