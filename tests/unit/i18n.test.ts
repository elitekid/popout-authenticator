import { describe, expect, it } from 'vitest';
import { LANGS, makeT } from '../../src/i18n';
import { accounts } from '../../src/i18n/ko/accounts';
import { add } from '../../src/i18n/ko/add';
import { backup } from '../../src/i18n/ko/backup';
import { common } from '../../src/i18n/ko/common';
import { lock } from '../../src/i18n/ko/lock';
import { popup } from '../../src/i18n/ko/popup';
import { reset } from '../../src/i18n/ko/reset';
import { settings } from '../../src/i18n/ko/settings';
import { share } from '../../src/i18n/ko/share';

const ko: Record<string, string> = { ...common, ...popup, ...add, ...accounts, ...backup, ...settings, ...share, ...lock, ...reset };
const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

// en·ko 밖 언어 파일(src/i18n/<언어>/messages.ts)
const files = import.meta.glob<{ messages: Record<string, string> }>('../../src/i18n/*/messages.ts', { eager: true });

// 브라우저 확장 _locales(public/_locales/<언어>/messages.json)
const locales = import.meta.glob<Record<string, unknown>>('../../public/_locales/*/messages.json', { import: 'default', eager: true });

describe('다국어', () => {
  it('_locales 20개 폴더가 en 의 키를 모두 가진다', () => {
    const entries = Object.entries(locales);
    expect(entries).toHaveLength(20);
    const enKeys = Object.keys(locales['../../public/_locales/en/messages.json']!);
    for (const [path, messages] of entries) {
      for (const key of enKeys) expect(messages, `${path} ${key}`).toHaveProperty(key);
    }
  });

  it('모든 언어가 ko 와 같은 키·같은 자리 표시를 가진다', () => {
    const en = makeT('en');
    for (const key of Object.keys(ko)) {
      expect(en(key), `en ${key}`).not.toBe(key);
      expect(params(en(key)), `en ${key} 자리 표시`).toBe(params(ko[key]!));
    }
    for (const [lang] of LANGS) {
      if (lang === 'en' || lang === 'ko') continue;
      const file = files[`../../src/i18n/${lang}/messages.ts`];
      expect(file, `${lang} 파일`).toBeDefined();
      const messages = file!.messages;
      expect(Object.keys(messages).sort(), `${lang} 키`).toEqual(Object.keys(ko).sort());
      for (const key of Object.keys(ko)) {
        expect(params(messages[key]!), `${lang} ${key} 자리 표시`).toBe(params(ko[key]!));
      }
    }
  });
});
