# Changelog

## 1.0.5

- New: open password-protected Aegis and 2FAS backups with their password. A wrong password and a damaged file are reported separately.
- New: import from Proton Authenticator backups, Steam Guard `.maFile` files and Steam shared secrets, FreeOTP 1 settings files and password-protected FreeOTP 2 backups.
- Backups from 2FA Authenticator (authenticator.sh) now keep Steam accounts, pinned accounts and linked sites.
- Microsoft Authenticator work or school QR codes (`phonefactor://`) now show a note that they cannot be added to other apps, and the camera stops scanning the same unusable QR code again and again.
- New: a warning before a code is copied or filled on a site whose address only looks like the account's site (for example a swapped letter or look-alike characters). The check runs only on your device. If you confirm it is the real site, it is remembered for that account; the warning can be turned off in Settings.
- Site matching now prefers the most specific address, and an account linked to other sites is no longer suggested by name for a site it is not linked to.
- New: right-click anywhere on a web page and choose "Copy this site's code". It works only on secure (https or this device) pages; if the tab has moved to another site in the meantime, the popup opens instead of copying.
- New: move selected accounts to another group or out of their group at once, with Undo. Moving accounts to the trash also shows Undo.
- New: use your own image as an account icon. The image is redrawn small, kept only on this device and in Popout backups, and is not synced.
- New: 23 more languages, 43 in total: Traditional Chinese, Bengali, Persian, Filipino, Malay, Urdu, Czech, Romanian, Hungarian, Greek, Hebrew, Danish, Finnish, Norwegian, Bulgarian, Serbian, Croatian, Catalan, Lithuanian, Latvian, Estonian, Slovak and Slovenian. Hebrew, Persian and Urdu are shown right to left. Many translations build on the original Authenticator extension's community translations.
- The backup reminder in the popup can now use two lines, so longer languages are not cut off.
- When you add several backup files at once and cancel the password of an encrypted one, the other files are now still added; the skipped file is listed in the result.

## 1.0.4

- The shortcuts that copy the codes of your first three important accounts no longer come with keys. In 1.0.2 and 1.0.3 they took Ctrl+Shift+1–3 for the whole system, so other apps could not use those keys while the browser was open. After this update those keys are released. To keep using the shortcuts, set the keys again in Settings → "Shortcut settings".
- The screen QR capture tab no longer gets stuck on "Loading…" on large screens without a QR code: the picture is shown first and the QR codes are read in steps.
- Sync no longer resets the counter of a counter-based (HOTP) account that was added separately on two devices: the higher counter is kept.
- When another device removes the lock or the passkey, sync now also turns off "Verify with your device before filling codes" on this device, so codes can be filled again.
- The fill button now appears next to a code field that was hidden when the page loaded and is shown later.
- Filling a code into one-box-per-digit fields no longer writes into the wrong boxes when the page has more such boxes than the code has digits; the code is copied instead.
- Hiding codes while a QR code or its password check is open no longer freezes the countdown in the list.
- Small task windows now fit the window height when the zoom is not 100%.
- The "Manage automatic recognition in Settings" link in the account editor no longer leaves the editor while there are unsaved changes.

## 1.0.3

- New: Settings has an "About" card with the version, a "Check for updates" button (Chrome, Edge and Whale check right away and can update now; Firefox and Safari open the store page) and the update history.
- New: a "Rate" card in Settings with a link to the store and a GitHub star link. It sits at the top until you rate or choose "Don't ask again", then moves down above the About card.
- New: copy an account's name from its "⋯" menu. The name is not cleared from the clipboard automatically because it is not a code.
- New: an "A–Z" button next to "Select" shows the list sorted by service and account name. Your own order is kept and comes back when you turn it off; reordering is paused while it is on.
- New: account icons are redrawn as line icons that look the same on every system, and there are now 18 (added Social, Personal, Payment, Crypto, Server, Security, School, Home, Website and Health). The edit screen shows them as buttons instead of a drop-down.
- Account icons you pick now always show in the popup, even when initial tiles are off.
- The "What's new" note after an update stays until you press OK or Rate, for up to three openings of the popup, and has a Rate button.
- The rating prompt can appear after five openings when you copy a code, is no longer hidden by other notes, comes back at most every 14 days and stops after three times. The Safari version still never shows it automatically.
- "Update now" clears a code waiting on the clipboard before the extension restarts.

## 1.0.2

- Task windows opened from the toolbar popup (QR image, import file, camera, backup) now open only once: opening the same task again brings the existing window to the front, and "Done" closes the window instead of turning it into a separate window.
- The screen QR capture tab closes itself after the accounts are added and returns you to the tab you started from. If something could not be added, the tab keeps the result and offers a "Close" button.
- New: scan a QR code shown in another app. Add → QR → "QR from another app" lets you choose a screen or window to capture.
- New: rename or ungroup a group for all its accounts at once from the group header.
- New: select several accounts and move them to the trash together.
- New: choose a built-in icon for each account. Icons are kept in Popout backups and sync.
- New: search by field (service, account, group or note), and search with several words. Accounts must contain every word. Secrets are never searched.
- New: choose how long copied codes stay on the clipboard (30 seconds, 1, 2 or 5 minutes) when clipboard clearing is on.
- New (Chrome, Edge, Whale): global shortcuts copy the codes of your first three important accounts, even while the browser is in the background. On Windows and Linux they are Ctrl+Shift+1–3; on Mac, set the keys from Settings → "Shortcut settings". Settings shows the keys currently assigned.
- The popup shows a short "What's new" note under the account list once after an update, and Settings has a "What's new" button next to the version.
- The rating prompt stops after it has been shown three times without an answer, and opening the rating link from Settings also ends it. The Safari version no longer shows the prompt.
- Exporting a backup no longer counts as done until you confirm that you saved the file, and the backup before a reset is checked against the file you saved. A reset no longer goes ahead if the vault changed after that backup.
- Restoring from a snapshot made with an older password no longer leaves the vault unreadable, and locking during a restore keeps the vault locked.
- Typing in the manage page or task window now counts as activity for auto-lock.
- The fill button next to a code field appears or disappears when only the field's attributes change.
- The share link now shows the exact time the link stops working.
- Failing to save a new account order now shows an error.
- Administrator policies: "disable backup" now hides backup features and blocks reset, open screens follow policy changes right away, and capture via shortcut respects "require password".
- Messages with a count no longer use a plural form for a single item.
- Store titles in Arabic, Hindi, Indonesian, Italian, Dutch, Polish, Swedish, Thai, Turkish, Ukrainian and Vietnamese now describe the extension in that language.

## 1.0.1

- Fixed the English "Added N accounts" message reading "Added 1 accounts".
- The rating button now opens the extension's page in the store for each browser (Chrome, Edge, Firefox, Whale, Safari).
- The rating prompt now appears only after you copy or fill a code, with a clearer look.
- Fixed the fill button next to a code field sitting slightly below the field's center.
- The backup file picker now also offers .2fas files.
- Removed the word "free" from the extension and store descriptions.
- Store title and summary now describe the extension in English, Korean, Japanese, Chinese (Simplified), German, Spanish, French, Portuguese (Brazil) and Russian; the toolbar tooltip keeps the short name.
- Fixed the code-fill button setting not being saved when site access was granted from the toolbar popup.
- Chrome no longer offers to translate the extension's own screens.
- Accounts in the popup are now shown under group headers that you can fold, and you can set an account's group from its menu.
- Auto-lock now fires on time while a separate window or side panel stays open, and the QR capture page counts as an open screen for "lock when all screens close".
- Turning on the password now also re-encrypts older recovery snapshots, so no account secret is left readable without the password.
- After unlocking with a recovery code, the old code keeps working until you confirm the new one.
- Edits made in the toolbar popup are no longer lost when a site-access prompt closes it, and saving an edit no longer undoes changes made elsewhere meanwhile (such as a HOTP counter).
- Clipboard clearing is scheduled right after copying, also for codes copied when filling fails and for recovery codes.
- Filling no longer picks a phone-number field that has no sign of being a code field.
- Sync: chunks from different uploads are no longer mixed, HOTP counters never go backwards, deleting sync data turns sync off on this device, and accounts removed by a full snapshot restore stay removed.
- Restoring from the trash no longer creates a duplicate account, exports that skip some accounts no longer hide the backup reminder, and registered passkeys stay visible and removable where new ones cannot be created.
- The add screen clears typed secrets and passwords when the vault locks.
- Firefox: filling and screen QR capture work from the separate window, the right-click fill menu appears on password-type code fields, and moving the separate window remembers its position.
- Snapshot cleanup no longer reads every stored snapshot on each save.
- Allowing a site from the popup now finishes the fill even when the permission prompt closes the popup.
- A code that waits for the next period or for device verification goes into the field you started from, not into a field focused meanwhile.
- The button next to a code field follows the field when content above it pushes it down.
- Two QR screen captures started at the same time no longer swap pictures.
- Code protection checks the passkey before turning on, so a passkey removed from the device can no longer be used to enable it.
- The toolbar popup hides "save recovery code to file" (the save dialog closed the popup); copy the code instead.
- Importing a raw copy works when the current vault is damaged.
- Turning off a code-field button no longer gives up site access still needed by another account on an overlapping address, and a declined request no longer turns on that account's button when another account is allowed for the same site.
- CXF imports list unreadable code entries instead of skipping them silently.
- Account and service names containing ":" keep their exact names after export and import.
- Firefox: the sync consent message no longer says accounts are encrypted when no lock is set.
- Faster popup with many accounts, less redrawing in the import check list, and a size limit for per-site fill history.
- The rating prompt can be postponed only once and has a "Don't ask again" button.
- Settings now link to the help guides and the website, and the first popup screen links to the guides.

## 1.0.0

First public release for Chrome, Edge, Firefox, Whale, and Safari.

- Two-factor codes (TOTP, HOTP, Steam, Battle.net) in the toolbar popup, a separate window, or the side panel.
- Add accounts from QR codes (current tab, camera, image, clipboard), otpauth:// links, manual entry, and plain-text backups from other authenticator apps.
- Encrypted vault on the device with password, recovery code, and passkey unlock, plus auto-lock.
- Fill codes into sites you allow from the popup, right-click menu, keyboard shortcut, or a button next to the code field. Codes are filled and submitted automatically only on https sites saved for the account; other sites need confirmation and are never auto-submitted.
- Encrypted backups and exports, optional encrypted browser sync, recovery snapshots, and a 30-day trash.
- Time-limited code share links that never contain the secret.
- Clock check, managed policies for organizations, and 20 languages.
