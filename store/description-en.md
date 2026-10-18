# Store listing — English

## Name (manifest appName, 1.0.1)
Popout Authenticator — 2FA & OTP Codes

## Summary (manifest appDesc, 132 characters max)
Open-source 2FA authenticator. One-time codes in a popup, window or side panel, with password lock and backup import.

## Description
(Paste as plain text: drop the ** marks. Brands named: at most five, per the Chrome spam FAQ.)

Popout Authenticator shows your two-factor (2FA) one-time codes right in your browser: in the toolbar popup, a separate window, or the side panel. It generates standard TOTP and HOTP codes, is open source (MIT), has no account limits, and needs no sign-up or server.

**Moving from another authenticator**
- Import the backup file of the Authenticator extension (authenticator.cc), including password-protected backups.
- Compatible with Google Authenticator™ export QR codes.
- Import plain-text backups from other authenticator apps, plus standard credential exchange (CXF) files. Supported apps: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Some apps' encrypted backups cannot be opened here. For those, export a plain-text backup in that app first.

**Open it where you need it**
- Use the toolbar popup, a separate window, or the side panel (sidebar in Firefox).
- Search, groups, pinned accounts, and a compact view keep long lists tidy.
- See which account belongs to the site you are on, and fill its code with one click, a right-click, or a keyboard shortcut.
- Optional buttons next to code fields on the sites you choose.

**Add accounts your way**
- Scan a QR code from the current tab, your camera, an image, or the clipboard.
- Paste otpauth:// links, or type the secret by hand.
- Supports TOTP and HOTP with SHA-1, SHA-256, or SHA-512 and 6 to 10 digits, plus Steam (5 characters) and Battle.net (8 digits).

**Private and protected**
- Accounts are stored on your device in a vault encrypted with AES-256-GCM. Set a password to protect its key: without one, the key is kept on the device next to the data.
- Lock it with a password (Argon2id), a recovery code, and optional passkey unlock (not available in Firefox). Choose when it locks automatically.
- Optionally require device verification before a code is used (not available in Firefox), and hide codes with a keyboard shortcut you assign.
- No analytics, no ads, no developer server. The source code is public.

**Never lose access**
- Encrypted backups, plus exports to otpauth text, CXF, and QR codes.
- Sync between your devices through your browser's own sync (Chrome, Edge, Firefox), encrypted when the password lock is on.
- Recovery snapshots, a 30-day trash, and an account change history.
- Clock check warns you when your computer's time would make codes fail.

**Share a code, not the secret**
- Send a link that shows only the codes for the next 5 to 60 minutes, with an optional password. The link never contains the secret.

**Good to know**
- There is no cloud backup run by the developer. Backups are files you keep; sync goes through your browser's own sync.
- Passkey unlock and device verification are not available in Firefox. The Safari version is for macOS only.

Available in 20 languages. Supports managed policies for organizations.

Popout Authenticator is made by an independent developer. It builds on the MIT-licensed code and translations of the Authenticator extension (authenticator.cc) and is not affiliated with its authors.

Google Authenticator is a trademark of Google LLC.

Privacy policy: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Source code: https://github.com/elitekid/popout-authenticator

## Edge search terms (7)
authenticator, 2FA, OTP, TOTP, two-factor authentication, one-time password, security codes

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `the side panel (sidebar in Firefox)` → `the side panel`
- `and optional passkey unlock (not available in Firefox)` → `and optional passkey unlock`
- `before a code is used (not available in Firefox)` → `before a code is used`
- `through your browser's own sync (Chrome, Edge, Firefox)` → `through Microsoft Edge sync`
- 이 줄을 뺀다: `- Passkey unlock and device verification are not available in Firefox. The Safari version is for macOS only.`
