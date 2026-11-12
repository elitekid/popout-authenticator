# Store-Eintrag — Deutsch

## Name (manifest appName, 1.0.1)
Popout Authenticator — 2FA- & OTP-Codes

## Zusammenfassung (manifest appDesc, höchstens 132 Zeichen)
Open-Source-2FA-Authenticator. Einmalcodes in Popup, Fenster oder Seitenleiste, mit Passwortsperre und Backup-Import.

## Beschreibung
(Als reinen Text einfügen, ** weglassen. Höchstens fünf fremde Produktnamen, laut Spam-FAQ des Chrome Web Store.)

Popout Authenticator zeigt Ihre Einmalcodes für die Zwei-Faktor-Authentifizierung (2FA) direkt im Browser: im Popup der Symbolleiste, in einem eigenen Fenster oder in der Seitenleiste. Es erzeugt Standard-TOTP- und -HOTP-Codes, ist Open Source (MIT), hat keine Kontobegrenzung und braucht weder Anmeldung noch Server.

**Umstieg von einer anderen Authenticator-App**
- Importiert die Sicherungsdatei der Erweiterung Authenticator (authenticator.cc), auch passwortgeschützte Sicherungen.
- Kompatibel mit Export-QR-Codes von Google Authenticator™.
- Importiert unverschlüsselte Sicherungen anderer Authenticator-Apps sowie Dateien im Standardformat Credential Exchange (CXF). Unterstützte Apps (Englisch): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Verschlüsselte Sicherungen mancher Apps lassen sich hier nicht öffnen. Exportieren Sie in diesem Fall zuerst eine unverschlüsselte Sicherung aus der App.

**Dort öffnen, wo Sie es brauchen**
- Öffnen im Popup der Symbolleiste, in einem eigenen Fenster oder in der Seitenleiste (Sidebar in Firefox).
- Suche nach Feld oder mit mehreren Wörtern, Sortierung von A bis Z, Gruppen, angeheftete Konten, Symbole und eine kompakte Ansicht halten auch lange Listen übersichtlich.
- Zeigt zuerst das Konto zur geöffneten Website und fügt dessen Code per Klick, Rechtsklick oder Tastenkürzel ein.
- Globale Tastenkürzel kopieren die Codes Ihrer ersten drei wichtigen Konten, auch wenn der Browser im Hintergrund ist (Chrome, Edge, Whale).
- Optional Schaltflächen neben Codefeldern auf den Websites, die Sie auswählen.
- Mehrere Konten auswählen und gemeinsam in den Papierkorb verschieben, eine ganze Gruppe auf einmal umbenennen oder auflösen und den Namen eines Kontos kopieren.

**Konten hinzufügen, wie es Ihnen passt**
- QR-Code aus dem aktuellen Tab, aus dem Fenster einer anderen App, mit der Kamera, aus einem Bild oder aus der Zwischenablage scannen.
- otpauth://-Links einfügen oder den geheimen Schlüssel von Hand eingeben.
- Unterstützt TOTP und HOTP mit SHA-1, SHA-256 oder SHA-512 und 6 bis 10 Stellen sowie Steam (5 Zeichen) und Battle.net (8 Stellen).

**Privat und geschützt**
- Konten werden auf Ihrem Gerät in einem mit AES-256-GCM verschlüsselten Tresor gespeichert. Legen Sie ein Passwort fest, um dessen Schlüssel zu schützen: Ohne Passwort liegt der Schlüssel neben den Daten auf dem Gerät.
- Sperren mit Passwort (Argon2id), Wiederherstellungscode und optionaler Entsperrung per Passkey (nicht in Firefox). Sie wählen, wann automatisch gesperrt wird.
- Optional eine Geräteprüfung verlangen, bevor ein Code verwendet wird (nicht in Firefox), und Codes mit einem eigenen Tastenkürzel ausblenden.
- Kopierte Codes können nach 30 Sekunden, 1, 2 oder 5 Minuten aus der Zwischenablage gelöscht werden (nicht in Safari).
- Keine Analyse, keine Werbung, kein Server des Entwicklers. Der Quellcode ist öffentlich.

**Zugang nicht verlieren**
- Verschlüsselte Sicherungen sowie Export als otpauth-Text, CXF und QR-Codes.
- Synchronisierung zwischen Ihren Geräten über die Synchronisierung des Browsers (Chrome, Edge, Firefox), verschlüsselt bei aktiver Passwortsperre.
- Schnappschüsse zur Wiederherstellung, ein Papierkorb für 30 Tage und ein Änderungsverlauf je Konto.
- Die Uhrzeitprüfung warnt, wenn die Uhr Ihres Computers falsch geht und Codes deshalb nicht funktionieren.

**Einen Code teilen, nicht den Schlüssel**
- Senden Sie einen Link, der nur die Codes der nächsten 5 bis 60 Minuten zeigt, optional mit Passwort. Der Link enthält nie den geheimen Schlüssel.

**Gut zu wissen**
- Es gibt keine Cloud-Sicherung des Entwicklers. Sicherungen sind Dateien, die Sie selbst aufbewahren; synchronisiert wird über den Browser.
- Entsperrung per Passkey und Geräteprüfung sind in Firefox nicht verfügbar. Die Safari-Version gibt es nur für macOS.

In 20 Sprachen verfügbar. Unterstützt verwaltete Richtlinien für Organisationen.

Popout Authenticator wird von einem unabhängigen Entwickler erstellt. Es baut auf dem MIT-lizenzierten Code und den Übersetzungen der Erweiterung Authenticator (authenticator.cc) auf und steht in keiner Verbindung zu deren Autoren.

Google Authenticator ist eine Marke von Google LLC.

Datenschutzerklärung: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Quellcode: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `in der Seitenleiste (Sidebar in Firefox)` → `in der Seitenleiste`
- `optionaler Entsperrung per Passkey (nicht in Firefox)` → `optionaler Entsperrung per Passkey`
- `bevor ein Code verwendet wird (nicht in Firefox)` → `bevor ein Code verwendet wird`
- `über die Synchronisierung des Browsers (Chrome, Edge, Firefox),` → `über die Microsoft Edge-Synchronisierung,`
- `im Hintergrund ist (Chrome, Edge, Whale).` → `im Hintergrund ist.`
- `gelöscht werden (nicht in Safari).` → `gelöscht werden.`
- 이 줄을 뺀다: `- Entsperrung per Passkey und Geräteprüfung sind in Firefox nicht verfügbar. Die Safari-Version gibt es nur für macOS.`
