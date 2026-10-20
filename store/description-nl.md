# Winkelvermelding — Nederlands

## Naam (manifest appName, 1.0.1)
Popout Authenticator

## Samenvatting (manifest appDesc, maximaal 132 tekens)
2FA-authenticator voor je browser. Genereert eenmalige codes en opent als pop-up of apart venster.

## Beschrijving
(Plakken als platte tekst, zonder **. Maximaal vijf productnamen van anderen, volgens de spam-FAQ van de Chrome Web Store.)

Popout Authenticator toont je eenmalige codes voor tweestapsverificatie (2FA) direct in je browser: in de pop-up van de werkbalk, in een apart venster of in het zijpaneel. Het maakt standaard TOTP- en HOTP-codes, is open source (MIT), heeft geen limiet op het aantal accounts en heeft geen aanmelding of server nodig.

**Overstappen van een andere authenticator**
- Importeer het back-upbestand van de extensie Authenticator (authenticator.cc), ook back-ups met een wachtwoord.
- Compatibel met export-QR-codes van Google Authenticator™.
- Importeer onversleutelde back-ups van andere authenticator-apps en bestanden in het standaardformaat Credential Exchange (CXF). Ondersteunde apps (Engels): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Versleutelde back-ups van sommige apps kunnen hier niet worden geopend. Exporteer in dat geval eerst een onversleutelde back-up uit die app.

**Open het waar je het nodig hebt**
- Gebruik de pop-up van de werkbalk, een apart venster of het zijpaneel (zijbalk in Firefox).
- Zoeken, groepen, vastgezette accounts en een compacte weergave houden lange lijsten overzichtelijk.
- Zie welk account bij de geopende website hoort en vul de code in met één klik, een rechtermuisklik of een sneltoets.
- Optionele knoppen naast codevelden op websites die je kiest.

**Accounts toevoegen zoals jij wilt**
- Scan een QR-code uit het huidige tabblad, met je camera, uit een afbeelding of van het klembord.
- Plak otpauth://-links of typ de geheime sleutel zelf in.
- Ondersteunt TOTP en HOTP met SHA-1, SHA-256 of SHA-512 en 6 tot 10 cijfers, plus Steam (5 tekens) en Battle.net (8 cijfers).

**Privé en beschermd**
- Accounts worden op je apparaat bewaard in een kluis die is versleuteld met AES-256-GCM. Stel een wachtwoord in om de sleutel te beschermen: zonder wachtwoord staat de sleutel op het apparaat naast de gegevens.
- Gebruik wachtwoordvergrendeling (Argon2id), een herstelcode en optionele ontgrendeling met een passkey (niet in Firefox). Kies wanneer het automatisch vergrendelt.
- Vraag optioneel om apparaatverificatie voordat een code wordt gebruikt (niet in Firefox), en verberg codes met een sneltoets naar keuze.
- Geen analytics, geen advertenties, geen server van de ontwikkelaar. De broncode is openbaar.

**Verlies de toegang niet**
- Versleutelde back-ups en export naar otpauth-tekst, CXF en QR-codes.
- Synchroniseer tussen je apparaten via de synchronisatie van je browser (Chrome, Edge, Firefox), versleuteld als de wachtwoordvergrendeling aan staat.
- Herstelmomentopnamen, een prullenbak voor 30 dagen en een wijzigingsgeschiedenis per account.
- De klokcontrole waarschuwt je als de tijd van je computer ervoor zou zorgen dat codes niet werken.

**Deel een code, niet het geheim**
- Stuur een link die alleen de codes van de komende 5 tot 60 minuten toont, optioneel met wachtwoord. De link bevat nooit de geheime sleutel.

**Goed om te weten**
- Er is geen cloudback-up van de ontwikkelaar. Back-ups zijn bestanden die je zelf bewaart; synchronisatie loopt via je browser.
- Ontgrendelen met een passkey en apparaatverificatie zijn niet beschikbaar in Firefox. De Safari-versie is alleen voor macOS.

Beschikbaar in 20 talen. Ondersteunt beheerde beleidsregels voor organisaties.

Popout Authenticator is gemaakt door een onafhankelijke ontwikkelaar. Het bouwt voort op de MIT-gelicentieerde code en vertalingen van de extensie Authenticator (authenticator.cc) en is niet verbonden aan de makers daarvan.

Google Authenticator is een handelsmerk van Google LLC.

Privacybeleid: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Broncode: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `het zijpaneel (zijbalk in Firefox)` → `het zijpaneel`
- `optionele ontgrendeling met een passkey (niet in Firefox)` → `optionele ontgrendeling met een passkey`
- `voordat een code wordt gebruikt (niet in Firefox)` → `voordat een code wordt gebruikt`
- `via de synchronisatie van je browser (Chrome, Edge, Firefox)` → `via Microsoft Edge-synchronisatie`
- 이 줄을 뺀다: `- Ontgrendelen met een passkey en apparaatverificatie zijn niet beschikbaar in Firefox. De Safari-versie is alleen voor macOS.`
