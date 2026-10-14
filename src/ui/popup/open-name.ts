export type OpenName = 'popup' | 'window' | 'sidepanel';

// 같은 문서가 popup.html·window.html·sidepanel.html 세 이름으로 열린다.
export function openNameFromPath(pathname: string): OpenName {
  const file = pathname.split('/').pop() ?? '';
  if (file === 'window.html') return 'window';
  if (file === 'sidepanel.html') return 'sidepanel';
  return 'popup';
}

export function currentOpenName(): OpenName {
  return openNameFromPath(location.pathname);
}
