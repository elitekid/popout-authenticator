import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { SectionId } from '../manage/sections';

// 툴바 팝업에서 포커스를 가져가는 작업만 작은 창으로 이어 간다.
export const ScreenContext = createContext<{
  toolbarPopup: boolean;
  navigate?: (section: SectionId) => void;
}>({ toolbarPopup: false });

export const useScreenContext = () => useContext(ScreenContext);

export async function openTaskWindow(section: SectionId, params: Record<string, string> = {}): Promise<void> {
  const query = new URLSearchParams({ compact: '1', ...params });
  // 창 하나 유지·재사용은 bg 가 맡는다(open-mode.ts).
  const reply = await chrome.runtime.sendMessage({
    type: 'open-task-window',
    url: chrome.runtime.getURL(`manage.html?${query}#${section}`),
  });
  if (!reply?.ok) throw new Error('open-task-window failed');
}
