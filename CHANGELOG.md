# Changelog

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
