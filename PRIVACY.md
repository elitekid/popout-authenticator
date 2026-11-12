# Privacy Policy — Popout Authenticator

Effective date: 2026-10-14 · [한국어](#개인정보처리방침--popout-authenticator)

Popout Authenticator is an open-source browser extension that generates two-factor (2FA) one-time codes. The developer runs no server for it. The extension contains no analytics, advertising, crash reporting, or tracking code, and the developer never receives your accounts, secrets, codes, or browsing data.

## What stays on your device

- **Accounts and secrets** are kept in the browser's extension storage as an encrypted vault (AES-256-GCM).
  - If you set a password, the vault key is protected by your password (Argon2id). A recovery code and a passkey can also unlock it.
  - Without a password, the vault is still encrypted, but its key is stored next to it. Anyone with access to your browser profile could read it. Set a password to protect your accounts.
- **Recovery snapshots** of earlier vault versions are kept in the extension's local database (the latest 30, plus the most recent one for each of the last 30 days) so you can undo mistakes.
- **Settings, site buttons, and site usage hints** (which account you used on which site) are stored locally and are not synced.
- **Backup and export files** are saved only where you choose. Plain-text exports are not protected; keep them safe or use the encrypted backup format.

## When data leaves your device

Data leaves your device only in the cases below, and never to the developer.

1. **Browser sync (on by default, runs only with a password lock).** On Chrome, Edge, and Firefox, accounts can sync between your devices through the browser's own sync service (`storage.sync`), operated by your browser vendor under its privacy policy.
   - Sync is on by default but runs only after you set a password lock. Each account (secret, issuer, name, notes, group, and site addresses) is then encrypted with your vault key before upload.
   - Without a lock, nothing is synced unless you explicitly allow unencrypted sync after a warning. In that case the key is uploaded too, so the synced data is effectively unprotected.
   - So that devices can merge changes and unlock, these are stored unencrypted: random account IDs, timestamps, deletion records, the lock type, a key fingerprint, and the vault key wrapped by your password, recovery code, and passkeys (with passkey credential IDs).
   - You can turn sync off and delete the synced data in Settings → Sync. Safari builds do not offer sync. An organization's administrator can turn sync on or off by policy.
2. **Clock check (on by default, can be turned off).** Codes depend on an accurate clock. The extension asks `time.akamai.com`, `timeapi.io`, and `cloudflare.com` for the current time with a plain request that contains no account data. The result is cached (normally for 6 hours). Like any web request, these services can see your IP address. Turn it off in Settings → Clock check.
3. **Code share links (only when you create one).** A share link contains the service and account name and the codes for the period you choose (5 to 60 minutes), never the secret.
   - The data is encrypted inside the part of the link after `#`, which browsers do not send to the server. The page at `elitekid.github.io/popout-authenticator/share/` decodes it in the recipient's browser and makes no further requests. GitHub Pages serves that page and can see the visitor's IP address, as with any website.
   - Anyone who has the link (and the password, if you set one) can see the codes until they expire. A link cannot be revoked early, so share it only with people you trust.
4. **Filling codes into websites (only on sites you allow).** Site access is optional and requested only for the sites involved: the current site when you fill from the separate window or side panel, the sites you enter for an account's field button (including subdomains), or a fixed list of known services when you turn on automatic recognition. The extension never asks for all sites, and you can remove access in the browser's extension settings. Site addresses you link to accounts are kept inside the encrypted vault; for accounts with field buttons, they are also stored unencrypted in local extension storage so the buttons work while the vault is locked.
5. **Feedback link.** "Send feedback" opens the GitHub issues page (or an address set by your administrator). GitHub's privacy policy applies there.

## Permissions and device features

- **Clipboard:** copying a code writes it to the clipboard. If you turn on "clear clipboard after copy", the extension asks for clipboard read access and only checks whether the clipboard still holds the code it copied (compared by hash) before clearing it.
- **Camera and screen capture for QR codes:** used only when you start a scan. Images are decoded locally and are not stored or sent anywhere.
- **Tabs (optional):** lets the separate window and side panel suggest the account for the current site. The address is used only on your device.

The Firefox build declares *authentication information*, *personally identifying information* (account names, often email addresses), and *browsing activity* (site addresses linked to accounts) as **optional** data collection, because browser sync can transmit them. Firefox asks for your permission when you turn sync on, and sync does not run in Firefox without it. Nothing is required to install the extension.

## Changes and contact

Changes to this policy are published in this file with a new effective date. Questions: <https://github.com/elitekid/popout-authenticator/issues>

---

# 개인정보처리방침 — Popout Authenticator

시행일: 2026-10-14 · [English](#privacy-policy--popout-authenticator)

Popout Authenticator는 2단계 인증(2FA) 일회용 코드를 만드는 무료 오픈소스 브라우저 확장입니다. 개발자는 이 확장을 위한 서버를 운영하지 않습니다. 확장에는 통계·광고·오류 보고·추적 코드가 없고, 개발자는 계정·비밀키·코드·방문 기록을 받지 않습니다.

## 기기 안에 두는 정보

- **계정과 비밀키**는 브라우저의 확장 저장소에 암호화된 금고(AES-256-GCM)로 보관합니다.
  - 비밀번호를 정하면 금고 키를 비밀번호(Argon2id)로 보호합니다. 복구 코드와 패스키로도 열 수 있습니다.
  - 비밀번호가 없어도 금고는 암호화되지만, 키가 같은 곳에 함께 저장됩니다. 브라우저 프로필에 접근할 수 있는 사람은 내용을 읽을 수 있습니다. 계정을 지키려면 비밀번호를 정해 주세요.
- **복구용 스냅샷**(금고의 이전 판)은 실수를 되돌릴 수 있도록 확장의 로컬 데이터베이스에 보관합니다. 최신 30개와, 최근 30일 동안 하루에 1개씩 남깁니다.
- **설정, 사이트 단추, 사이트 사용 기록**(어느 사이트에서 어느 계정을 썼는지)은 기기에만 저장하고 동기화하지 않습니다.
- **백업·내보내기 파일**은 사용자가 고른 곳에만 저장됩니다. 평문 내보내기 파일은 보호되지 않으니 안전하게 보관하거나 암호화 백업을 사용해 주세요.

## 기기 밖으로 나가는 경우

정보는 아래 경우에만 기기 밖으로 나가며, 개발자에게는 가지 않습니다.

1. **브라우저 동기화(기본 켜짐, 비밀번호 잠금이 있을 때만 동작).** 크롬·엣지·파이어폭스에서는 브라우저 자체 동기화(`storage.sync`)로 내 기기끼리 계정을 맞출 수 있습니다. 이 서비스는 브라우저 회사가 자사 개인정보처리방침에 따라 운영합니다.
   - 동기화는 기본으로 켜져 있지만 비밀번호 잠금을 정한 뒤에만 동작합니다. 이때 계정마다 비밀키·발급자·이름·메모·그룹·사이트 주소를 금고 키로 암호화한 뒤 올립니다.
   - 잠금이 없으면, 경고를 확인하고 평문 동기화를 직접 허용하지 않는 한 아무것도 동기화하지 않습니다. 허용하면 키도 함께 올라가므로 동기화된 정보는 사실상 보호되지 않습니다.
   - 기기 사이에서 변경을 합치고 잠금을 풀 수 있도록 다음은 암호화하지 않고 저장합니다: 무작위 계정 ID, 시각, 삭제 기록, 잠금 종류, 키 식별값, 비밀번호·복구 코드·패스키로 감싼 금고 키(패스키 자격 증명 ID 포함).
   - 설정 → 동기화에서 동기화를 끄고 동기화된 정보를 지울 수 있습니다. 사파리판은 동기화를 제공하지 않습니다. 조직 관리자는 정책으로 동기화를 켜거나 끌 수 있습니다.
2. **시계 확인(기본 켜짐, 끌 수 있음).** 코드는 정확한 시계가 필요합니다. 확장은 `time.akamai.com`, `timeapi.io`, `cloudflare.com` 세 곳에 현재 시각만 묻습니다. 요청에는 계정 정보가 들어가지 않습니다. 결과는 보통 6시간 동안 다시 쓰고, 여느 웹 요청처럼 해당 서비스는 IP 주소를 볼 수 있습니다. 설정 → 시계 확인에서 끌 수 있습니다.
3. **코드 공유 링크(만들 때만).** 공유 링크에는 서비스 이름, 계정 이름, 고른 시간(5~60분) 동안의 코드가 담기며 비밀키는 담기지 않습니다.
   - 내용은 링크의 `#` 뒤에 암호화되어 들어가고, 브라우저는 이 부분을 서버로 보내지 않습니다. `elitekid.github.io/popout-authenticator/share/` 페이지가 받는 사람의 브라우저 안에서 풀며, 다른 요청은 하지 않습니다. 이 페이지는 GitHub Pages가 제공하므로, 여느 웹사이트처럼 GitHub는 방문자의 IP 주소를 볼 수 있습니다.
   - 링크(비밀번호를 정했다면 비밀번호까지)를 가진 사람은 누구나 만료 때까지 코드를 볼 수 있습니다. 링크는 미리 취소할 수 없으니 믿을 수 있는 사람에게만 보내 주세요.
4. **웹사이트에 코드 넣기(허용한 사이트에만).** 사이트 접근 권한은 선택 사항이며, 필요한 사이트에만 요청합니다. 분리 창·사이드 패널에서 넣을 때는 지금 사이트, 계정의 칸 옆 단추에는 입력한 사이트(하위 도메인 포함), 알려진 서비스 자동 인식을 켜면 정해진 서비스 목록입니다. 모든 사이트 권한을 한꺼번에 요청하지 않으며, 브라우저의 확장 설정에서 권한을 거둘 수 있습니다. 계정에 연결한 사이트 주소는 암호화된 금고 안에 둡니다. 다만 칸 옆 단추를 켠 계정의 사이트 주소는 금고가 잠겨 있어도 단추가 동작하도록 확장의 로컬 저장소에 암호화하지 않고도 저장합니다.
5. **의견 보내기.** "의견 보내기"는 GitHub 이슈 페이지(또는 관리자가 정한 주소)를 엽니다. 그곳에서는 GitHub의 개인정보처리방침이 적용됩니다.

## 권한과 기기 기능

- **클립보드:** 코드를 복사하면 클립보드에 씁니다. "복사한 뒤 클립보드 지우기"를 켜면 클립보드 읽기 권한을 요청하고, 지우기 전에 클립보드에 복사한 코드가 그대로 있는지만 해시로 비교합니다.
- **QR 코드용 카메라·화면 캡처:** 사용자가 스캔을 시작할 때만 씁니다. 이미지는 기기 안에서 풀고, 저장하거나 보내지 않습니다.
- **탭(선택):** 분리 창과 사이드 패널이 지금 사이트에 맞는 계정을 추천할 때 씁니다. 주소는 기기 안에서만 씁니다.

파이어폭스판은 브라우저 동기화로 전송될 수 있는 *인증 정보*, *개인 식별 정보*(흔히 이메일인 계정 이름), *방문 기록*(계정에 연결한 사이트 주소)을 **선택** 항목으로 선언합니다. 동기화를 켤 때 Firefox가 허용을 묻고, 허용하지 않으면 Firefox에서는 동기화하지 않습니다. 설치할 때 동의해야 하는 항목은 없습니다.

## 변경과 문의

이 방침을 바꾸면 이 파일에 새 시행일과 함께 올립니다. 문의: <https://github.com/elitekid/popout-authenticator/issues>
