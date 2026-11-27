/// <reference types="vite/client" />
import { accounts as enAccounts } from './en/accounts';
import { accounts as koAccounts } from './ko/accounts';
import { backup as enBackup } from './en/backup';
import { backup as koBackup } from './ko/backup';
import { add as enAdd } from './en/add';
import { add as koAdd } from './ko/add';
import { lock as enLock } from './en/lock';
import { lock as koLock } from './ko/lock';
import { common as enCommon } from './en/common';
import { common as koCommon } from './ko/common';
import { popup as enPopup } from './en/popup';
import { popup as koPopup } from './ko/popup';
import { settings as enSettings } from './en/settings';
import { settings as koSettings } from './ko/settings';
import { reset as enReset } from './en/reset';
import { reset as koReset } from './ko/reset';
import { share as enShare } from './en/share';
import { share as koShare } from './ko/share';

// 기준 확장의 20개 언어 + 1.0.5 의 23개(총 43개). 화면 이름은 그 언어로 적는다.
export const LANGS = [
  ['en', 'English'],
  ['ko', '한국어'],
  ['zh', '中文'],
  ['es', 'Español'],
  ['hi', 'हिन्दी'],
  ['ar', 'العربية'],
  ['pt', 'Português'],
  ['ru', 'Русский'],
  ['ja', '日本語'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['it', 'Italiano'],
  ['tr', 'Türkçe'],
  ['vi', 'Tiếng Việt'],
  ['pl', 'Polski'],
  ['nl', 'Nederlands'],
  ['id', 'Bahasa Indonesia'],
  ['th', 'ไทย'],
  ['uk', 'Українська'],
  ['sv', 'Svenska'],
  // 1.0.5 에 더한 23개 언어
  ['zh-TW', '繁體中文'],
  ['bn', 'বাংলা'],
  ['fa', 'فارسی'],
  ['fil', 'Filipino'],
  ['ms', 'Bahasa Melayu'],
  ['ur', 'اردو'],
  ['cs', 'Čeština'],
  ['ro', 'Română'],
  ['hu', 'Magyar'],
  ['el', 'Ελληνικά'],
  ['he', 'עברית'],
  ['da', 'Dansk'],
  ['fi', 'Suomi'],
  ['no', 'Norsk'],
  ['bg', 'Български'],
  ['sr', 'Српски'],
  ['hr', 'Hrvatski'],
  ['ca', 'Català'],
  ['lt', 'Lietuvių'],
  ['lv', 'Latviešu'],
  ['et', 'Eesti'],
  ['sk', 'Slovenčina'],
  ['sl', 'Slovenščina'],
] as const;

export type Lang = (typeof LANGS)[number][0];
export type Messages = Record<string, string>;

const CODES = new Set<string>(LANGS.map(([code]) => code));

// 영역 문구 파일을 더할 때는 아래 두 객체에 한 줄씩만 등록한다.
const messages: Partial<Record<Lang, Messages>> = {
  en: { ...enCommon, ...enPopup, ...enAdd, ...enAccounts, ...enBackup, ...enSettings, ...enShare, ...enLock, ...enReset },
  ko: { ...koCommon, ...koPopup, ...koAdd, ...koAccounts, ...koBackup, ...koSettings, ...koShare, ...koLock, ...koReset },
};

// en·ko 밖의 언어는 src/i18n/<언어>/messages.ts 한 파일씩이고, 고른 언어만 따로 불러온다(팝업 묶음을 키우지 않게).
const loaders = import.meta.glob<{ messages: Messages }>('./*/messages.ts');

export function isLoaded(lang: Lang): boolean {
  return messages[lang] !== undefined;
}

export async function loadLang(lang: Lang): Promise<void> {
  if (isLoaded(lang)) return;
  const load = loaders[`./${lang}/messages.ts`];
  if (!load) return;
  messages[lang] = (await load()).messages;
}

// 오른쪽에서 왼쪽으로 쓰는 언어
const RTL = new Set<string>(['ar', 'fa', 'he', 'ur']);
export function isRtl(lang: Lang): boolean {
  return RTL.has(lang);
}

// 브라우저가 주는 다른 이름(옛 코드·지역 변형)을 우리 코드로 옮긴다.
const ALIASES: Record<string, Lang> = { iw: 'he', nb: 'no', nn: 'no', tl: 'fil' };
// 번체를 쓰는 지역·문자 표시
const TRADITIONAL = new Set(['tw', 'hk', 'mo', 'hant']);

export function pickLanguage(setting: string, navigatorLanguage?: string): Lang {
  const wanted = setting === 'auto' ? navigatorLanguage : setting;
  const parts = (wanted ?? '').toLowerCase().replace(/_/g, '-').split('-');
  const base = parts[0] ?? '';
  if (base === 'zh') {
    // zh-Hans-HK 처럼 간체가 적혀 있으면 간체를 쓴다.
    if (parts.includes('hans')) return 'zh';
    return parts.slice(1).some((p) => TRADITIONAL.has(p)) ? 'zh-TW' : 'zh';
  }
  const code = ALIASES[base] ?? base;
  return CODES.has(code) ? (code as Lang) : 'en';
}

// 아직 불러오지 않은 언어는 영어로 보인다(useT 가 불러온 뒤 다시 그린다).
export function makeT(lang: Lang) {
  return (key: string, params?: Record<string, string | number>): string => {
    const text = messages[lang]?.[key] ?? messages.en![key] ?? key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in params ? String(params[name]) : whole,
    );
  };
}

export function currentLang(setting = 'auto'): Lang {
  const nav = typeof navigator === 'undefined' ? undefined : navigator.language;
  return pickLanguage(setting, nav);
}

export const t = (key: string, params?: Record<string, string | number>): string =>
  makeT(currentLang())(key, params);
