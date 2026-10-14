import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { pickLanguage } from '../../src/i18n';
import { createChromeMock } from './chrome-mock';

describe('DEFAULT_SETTINGS', () => {
  it('has the agreed defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      openMode: 'popup',
      view: 'normal',
      popupSize: 'medium',
      theme: 'system',
      avatars: false,
      listOnly: false,
      zoom: 100,
      language: 'auto',
      syncEnabled: true,
      clipboardClearAfterCopy: false,
      autofillOnCopy: false,
      autoSubmit: true,
      suggestionsEnabled: true,
      clockCheck: true,
      lockTiming: 15,
    });
  });
});

describe('chrome mock', () => {
  it('round-trips storage.local and fires onChanged', async () => {
    const seen: string[] = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      seen.push(`${area}:${Object.keys(changes).join(',')}`);
    });
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    const got = await chrome.storage.local.get('settings');
    expect(got.settings).toEqual(DEFAULT_SETTINGS);
    expect(seen).toContain('local:settings');
  });
});

describe('i18n', () => {
  it('picks ko or en', () => {
    expect(pickLanguage('auto', 'ko-KR')).toBe('ko');
    expect(pickLanguage('auto', 'fr-CA')).toBe('fr');
    expect(pickLanguage('auto', 'xx')).toBe('en');
    expect(pickLanguage('auto', undefined)).toBe('en');
  });
});

describe('browser capabilities', () => {
  it('keeps Safari sync and clipboard clearing off even when saved settings or policy enable them', async () => {
    const previous = chrome;
    vi.stubEnv('VITE_BROWSER_TARGET', 'safari');
    vi.resetModules();
    (globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();
    try {
      await chrome.storage.managed.set({ storageArea: 'sync' });
      const { loadSettings, saveSettings } = await import('../../src/store/settings');
      const saved = await saveSettings({ syncEnabled: true, clipboardClearAfterCopy: true, openMode: 'sidepanel' });
      expect(saved).toMatchObject({ syncEnabled: false, clipboardClearAfterCopy: false, openMode: 'popup' });
      expect(await loadSettings()).toMatchObject({ syncEnabled: false, clipboardClearAfterCopy: false });
      // 다른 브라우저로 가져갈 때 쓸 사용자 선택 자체는 파괴하지 않는다.
      expect((await chrome.storage.local.get('settings')).settings).toMatchObject({ syncEnabled: true });
    } finally {
      (globalThis as unknown as { chrome: unknown }).chrome = previous;
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
