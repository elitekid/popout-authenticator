// svg 마크업은 core/types.ts 의 상수라 그대로 넣어도 안전하다.
export function AccountIconSvg({ icon }: { icon: { svg: string } }) {
  return <svg viewBox="0 0 24 24" class="ai" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon.svg }} />;
}
