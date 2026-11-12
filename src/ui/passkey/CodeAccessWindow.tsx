import { useT } from '../shared/use-t';

// 오래된 직접 URL에는 승인 권한을 주지 않는다. 새 요청은 기본 UI의 호스트로만 배달한다.
export function CodeAccessWindow() {
  const t = useT();
  return <p role="alert">{t('lock.codeAccess.expired')}</p>;
}
