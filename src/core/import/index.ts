// 가져오기 해석 진입점: 텍스트의 모양으로 형식을 판별한다.
import { isCxf, readCxf } from '../export/cxf';
import { isOwnBackup, readOwnBackup } from '../export/own';
import { parseLinks } from '../uri';
import { detectApp, parseApp } from './apps';
import { isOriginalBackup, parseOriginal } from './original';
import { isTwoFaEncrypted, isTwoFaPlain, parseTwoFaEncrypted, parseTwoFaPlain } from './twofa';
import { ImportRejectedError, NeedsPasswordError, isObject, type ImportOutcome } from './types';

export * from './types';
export { detectApp, parseApp, type AppName } from './apps';
export { parseOriginal } from './original';
export { parseTwoFaPlain, parseTwoFaEncrypted } from './twofa';

export async function importText(text: string, password?: string): Promise<ImportOutcome> {
  const trimmed = text.replace(/^﻿/, '').trim();

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
        meta: accounts.map(({ pinned, group, note, matchHosts }) => ({
          pinned, note, matchHosts, ...(group !== undefined ? { group } : {}),
        })),
        format: 'own',
      };
    }
    if (isCxf(trimmed)) return { drafts: readCxf(trimmed), failed: [], format: 'cxf' };
    if (isTwoFaEncrypted(json)) return parseTwoFaEncrypted(json, password);
    if (isTwoFaPlain(json)) return parseTwoFaPlain(json as Record<string, unknown>);
    if (isOriginalBackup(json)) return parseOriginal(json, password);
    const app = detectApp(json);
    if (app) return parseApp(app, json);
    if (isObject(json) || Array.isArray(json)) throw new ImportRejectedError('unknown');
  }

  const links = parseLinks(trimmed, Number.MAX_SAFE_INTEGER);
  if (links.drafts.length === 0 && links.failed.length === 0) throw new ImportRejectedError('unknown');
  return { drafts: links.drafts, failed: links.failed, format: 'links' };
}
