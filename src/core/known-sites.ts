// 자동 인식은 명확한 서비스 이름과 로그인 호스트만 연결한다.
// 계정 이름·부분 문자열·하위 도메인으로 범위를 넓히지 않는다.
export const KNOWN_FIELD_SITES = [
  { name: 'GitHub', issuers: ['GitHub', 'github.com'], hosts: ['github.com'] },
  { name: 'GitLab', issuers: ['GitLab', 'gitlab.com'], hosts: ['gitlab.com'] },
  { name: 'Google', issuers: ['Google', 'Google Account'], hosts: ['accounts.google.com'] },
  { name: 'Cloudflare', issuers: ['Cloudflare'], hosts: ['dash.cloudflare.com'] },
  { name: 'Dropbox', issuers: ['Dropbox'], hosts: ['www.dropbox.com', 'dropbox.com'] },
  { name: 'JetBrains', issuers: ['JetBrains', 'JetBrains Account'], hosts: ['account.jetbrains.com'] },
] as const;

function normalizedIssuer(issuer: string): string {
  return issuer.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function knownSiteHosts(issuer: string): string[] {
  const normalized = normalizedIssuer(issuer);
  const site = KNOWN_FIELD_SITES.find((entry) =>
    entry.issuers.some((alias) => normalizedIssuer(alias) === normalized),
  );
  return site ? [...site.hosts] : [];
}

export const KNOWN_FIELD_ORIGINS: string[] = KNOWN_FIELD_SITES.flatMap((site) =>
  site.hosts.map((host) => `https://${host}/*`),
);
