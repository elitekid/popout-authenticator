# Popout Authenticator

An open-source 2FA / OTP authenticator browser extension. Accounts live in an AES-256-GCM vault on your device, protected by an optional password lock, and open in the toolbar popup, a separate window, or the side panel. No account, no server, no analytics, no account limits.

Website: [elitekid.github.io/popout-authenticator](https://elitekid.github.io/popout-authenticator/?utm_source=github&utm_medium=readme&utm_campaign=pa-readme)

## Install

| Browser | Store |
| --- | --- |
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/nakgmloofpboegibcjhainbpjjokmbgj?utm_source=github&utm_medium=readme&utm_campaign=pa-readme) |
| Edge | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/edipphpgdmfabonchodjfnejlbjoknhh?utm_source=github&utm_medium=readme&utm_campaign=pa-readme) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/popout-authenticator/?utm_source=github&utm_medium=readme&utm_campaign=pa-readme) |
| Whale | [Naver Whale Store](https://store.whale.naver.com/detail/bcfobdldplagmohdgaiocjddlokiolgc) |
| Safari (macOS) | Mac App Store (in review) |

Moving from another authenticator: [from the Authenticator extension](https://elitekid.github.io/popout-authenticator/guides/from-authenticator-extension/?utm_source=github&utm_medium=readme&utm_campaign=pa-readme) · [from Authy and other apps](https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/?utm_source=github&utm_medium=readme&utm_campaign=pa-readme)

Ratings and reviews in your browser's store help other people find the extension.

Privacy policy: [PRIVACY.md](PRIVACY.md) · Changes: [CHANGELOG.md](CHANGELOG.md)

## Supported builds

Browser-specific builds share the same local vault and OTP implementation, with separate manifests and browser API handling.

| Build | Minimum desktop browser | Background | Browser-specific behavior |
| --- | --- | --- | --- |
| Chrome | 127 | Service worker | Popup, separate window, side panel |
| Edge | 127 | Service worker | Popup, separate window, side panel |
| Firefox | 153 | Module event page | Popup, separate window, Firefox sidebar; password/recovery unlock, no extension-origin passkeys |
| Safari | 18.4 | Module event page | Popup and separate window; no browser sync or automatic clipboard clearing |

Whale uses the Chrome build.

Firefox currently rejects WebAuthn for an extension’s own origin. Its build explains this limitation and keeps password/recovery unlock available. An existing code-fill authentication setting is never silently disabled; the user can explicitly turn it off after entering the vault password. See [Mozilla’s WebAuthn guidance](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Use_the_web_authn_api).

These are build targets, not claims that every operating system or hardware authenticator has been tested. Firefox for Android and Safari on iOS are not release targets for this desktop package.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Keeps the encrypted vault and settings on the device; `storage.sync` for browser sync, which runs only after a password lock is set (accounts are then encrypted) unless you choose "Allow syncing without a lock", and can be turned off; managed policies for organizations. |
| `unlimitedStorage` | Keeps recovery snapshots of earlier vault versions without hitting the default storage quota. |
| `activeTab` | Fills a code into the current tab and captures it for QR scanning, only after the user clicks, right-clicks, or presses a shortcut. |
| `scripting` | Inserts the code into the page's code field, and shows field buttons on sites the user allowed. |
| `alarms` | Auto-lock, periodic sync, clipboard clearing, and cleanup timers. |
| `contextMenus` | "Fill 2FA code" on input fields and "Open in a separate window" on the toolbar icon. |
| `clipboardWrite` | Copies codes, share links, and recovery codes. |
| `offscreen` (Chrome, Edge) | Clears a copied code from the clipboard 30 seconds later, only when the user turns this on. |
| `sidePanel` (Chrome, Edge) | Opens the authenticator in the browser side panel. |
| `tabs` (optional) | Lets the separate window and side panel suggest the account for the site in the active tab. |
| `clipboardRead` (optional) | Requested only when the user turns on clipboard clearing, to check that the clipboard still holds the copied code before clearing it. Not in the Safari build. |
| `https://*/*`, `*://localhost/*`, `*://127.0.0.1/*` (optional) | Requested only for the sites involved: the current site when filling from the separate window or side panel, the sites entered for an account's field button, or a fixed list of known services when automatic recognition is turned on. Never all sites at once. |

The only network requests are the optional clock check (`time.akamai.com`, `timeapi.io`, `cloudflare.com`), which sends no account data. See [PRIVACY.md](PRIVACY.md).

The Firefox manifest declares authentication information, identifying account labels, and site addresses as optional data collection (`required: ["none"]`) because browser sync can transmit them. The extension asks for this permission when the user turns sync on and does not sync in Firefox without it. There is no product analytics or developer-operated account server. This declaration follows Mozilla's [data transmission categories](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Build

Release packages were built with **Node.js 26.4.0** and **npm 11.17.0** on macOS. The build needs no network access after `npm ci`.

```
npm ci
npm run build:chrome    # dist-chrome/ (also used for Whale)
npm run build:edge      # dist-edge/
npm run build:firefox   # dist-firefox/
npm run build:safari    # dist-safari/
npm run build:browsers  # all four, plus the share page in dist-share/
npm run build           # dist/ (Chrome build used by the e2e tests) and dist-share/
```

For Firefox add-on reviewers: from the source package, run `npm ci && npm run build:firefox`. The result in `dist-firefox/` matches the submitted package (the package additionally contains `LICENSE`).

## Test

```
npm test                # unit tests (vitest)
npm run e2e             # loads dist/ in headless Chrome for Testing
npm run e2e:firefox     # loads dist-firefox/ in headless Firefox (FIREFOX_PATH required)
```

`npm run e2e` needs `CHROME_PATH` pointing at a Chrome for Testing executable:

```
CHROME_PATH="/path/to/Google Chrome for Testing" npm run e2e
```

To try a build by hand, load `dist-chrome/` in `chrome://extensions` or `dist-edge/` in `edge://extensions` (developer mode → Load unpacked). In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, then select `dist-firefox/manifest.json`. Temporary Firefox installs are removed when Firefox exits.

Recent macOS Safari versions provide **Settings → Developer → Add Temporary Extension**. Select `dist-safari/` there after allowing unsigned extensions. Safari removes temporary extensions after 24 hours or when it exits; see Apple's [temporary installation instructions](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

## Store packages

```
npm run pack:browsers   # builds all four targets and writes versioned ZIPs
npm run pack            # builds dist/ and writes popout-authenticator.zip
```

Packaging needs the `zip` command (on Windows, use WSL). The resulting files are:

- `popout-authenticator-<version>-chrome.zip` (Chrome Web Store and Whale Store)
- `popout-authenticator-<version>-edge.zip`
- `popout-authenticator-<version>-firefox.zip`
- `popout-authenticator-<version>-safari-web-extension.zip` (web-extension resources, **not an installable Safari app**)

Use the Safari resources with Apple's [App Store Connect web-extension packager](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect) or the Xcode Safari web-extension converter.

Store screenshots and promotional images are regenerated with `CHROME_PATH=... node store/make-assets.mjs` after `npm run build:chrome`. They use fictional accounts only.

## Code share page

`share-page/` is the static page that opens code share links. It decodes the link in the browser and makes no network requests. `.github/workflows/pages.yml` builds it with `npm run build:share` and publishes it to `https://elitekid.github.io/popout-authenticator/share/`, the address built into the extension.

## Contributing

Bug reports and import or code-fill problems: [open an issue](https://github.com/elitekid/popout-authenticator/issues). Never post real secret keys, QR codes, backup files, or one-time codes.

## License

MIT, see [LICENSE](LICENSE). Includes code from [Authenticator Extension](https://github.com/Authenticator-Extension/Authenticator) and [Authenticator.sh](https://github.com/authenticator-sh/2fa), both MIT.
