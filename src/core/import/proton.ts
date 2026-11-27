// Proton Authenticator 평문 내보내기: {version, entries: [{id, content: {uri, entry_type, name}, note}]}.
// 비밀번호를 건 파일 {version, salt, content} 는 Argon2id·AES-GCM 인데, 우리가 확인할 수 있는 공개 사양이 없어 거절한다.
// 모양은 기준 확장 2FA Authenticator 1.16.3 import-formats.ts(MIT, Copyright (c) authenticator.sh)를 따랐다.
import { makeDraft } from '../account';
import { parseOtpauth } from '../uri';
import { parseSteamSecret } from './steam';
import { asString, Collector, ImportRejectedError, isObject, type ImportMeta, type ImportOutcome, type Json } from './types';

export const PROTON = 'Proton Authenticator';

export function isProtonAuthenticator(file: Json): boolean {
  if (typeof file.version !== 'number') return false;
  if (typeof file.salt === 'string' && typeof file.content === 'string' && !('entries' in file)) return true;
  return (
    Array.isArray(file.entries) &&
    file.entries.some((e) => isObject(e) && isObject(e.content) && typeof e.content.uri === 'string')
  );
}

export function parseProton(file: Json): ImportOutcome {
  if (!Array.isArray(file.entries)) throw new ImportRejectedError('encrypted', PROTON);
  const out = new Collector();
  for (const raw of file.entries) {
    const content = isObject(raw) && isObject(raw.content) ? raw.content : null;
    if (!content) {
      out.fail('entry', new Error('not an object'));
      continue;
    }
    const name = asString(content.name).trim();
    const uri = asString(content.uri).trim();
    const note = isObject(raw) ? asString(raw.note).trim() : '';
    const meta: ImportMeta = note ? { note } : {};
    try {
      // Steam 은 steam://<비밀키>, 비밀키는 Base32 이거나 패딩 없는 Base64.
      if (content.entry_type === 'Steam' || /^steam:\/\//i.test(uri)) {
        out.add(
          makeDraft({
            type: 'steam',
            issuer: 'Steam',
            label: name === 'Steam' ? '' : name,
            secret: parseSteamSecret(uri.replace(/^steam:\/\//i, '')),
            algorithm: 'SHA-1',
          }),
          meta,
        );
        continue;
      }
      const draft = parseOtpauth(uri);
      // 이름 없는 계정은 otpauth://totp/?secret=… 로 적힌다. Proton 목록이 보여 준 name 을 쓴다.
      if (draft.label === '' && name !== '') {
        if (draft.issuer === '') out.add({ ...draft, issuer: name }, meta);
        else out.add(name.toLowerCase() === draft.issuer.toLowerCase() ? draft : { ...draft, label: name }, meta);
      } else {
        out.add(draft, meta);
      }
    } catch (e) {
      out.fail(name || 'entry', e);
    }
  }
  return out.outcome('proton');
}
