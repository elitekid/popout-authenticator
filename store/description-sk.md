# Informácie v obchode — slovenčina

## Názov (manifest appName, 1.0.1)
Popout Authenticator — kódy 2FA a OTP

## Súhrn (manifest appDesc, najviac 132 znakov)
Open-source overovač 2FA. Jednorazové kódy vo vyskakovacom okne, samostatnom okne či bočnom paneli, zámok heslom a import záloh.

## Popis
(Vložte ako obyčajný text: odstráňte znaky **. Najviac päť názvov značiek podľa FAQ o spame v Chrome.)

Popout Authenticator zobrazuje jednorazové kódy dvojfaktorového overenia (2FA) priamo v prehliadači: vo vyskakovacom okne na paneli s nástrojmi, v samostatnom okne alebo v bočnom paneli. Generuje štandardné kódy TOTP a HOTP, má otvorený zdrojový kód (MIT), neobmedzuje počet účtov a nevyžaduje registráciu ani server.

**Prechod z inej overovacej aplikácie**
- Importujte záložný súbor rozšírenia Authenticator (authenticator.cc) vrátane záloh chránených heslom.
- Kompatibilné s QR kódmi exportu z Google Authenticator™.
- Importujte nešifrované zálohy z iných overovacích aplikácií aj štandardné súbory na výmenu prihlasovacích údajov (CXF). Podporované aplikácie (v angličtine): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Zálohy niektorých aplikácií chránené heslom otvoríte ich heslom. Ak sa šifrovaná záloha aplikácie nedá otvoriť tu, najprv v tej aplikácii exportujte nešifrovanú zálohu.

**Otvorte ho tam, kde ho potrebujete**
- Používajte vyskakovacie okno na paneli s nástrojmi, samostatné okno alebo bočný panel (vo Firefoxe bočná lišta).
- Hľadajte podľa poľa alebo viacerými slovami, zoraďte od A po Z a používajte skupiny, dôležité účty, ikony a kompaktné zobrazenie, aby aj dlhé zoznamy zostali prehľadné.
- Uvidíte, ktorý účet patrí k webu, na ktorom ste, a jeho kód vyplníte jedným kliknutím, kliknutím pravým tlačidlom alebo klávesovou skratkou. Kliknutím pravým tlačidlom kdekoľvek na stránke skopírujete kód tohto webu.
- Globálne skratky kopírujú kódy prvých troch dôležitých účtov, aj keď je prehliadač na pozadí (Chrome, Edge, Whale).
- Voliteľné tlačidlá vedľa polí pre kódy na weboch, ktoré si zvolíte.
- Vyberte viac účtov a presuňte ich naraz do inej skupiny alebo do koša a hneď to vráťte späť. Premenujte alebo zrušte celú skupinu naraz a kopírujte názov účtu.
- Použite vlastný obrázok ako ikonu účtu. Zostane len v tomto zariadení.

**Pridávajte účty po svojom**
- Naskenujte QR kód z aktuálnej karty, okna inej aplikácie, kamery, obrázka alebo schránky.
- Vložte odkazy otpauth:// alebo zadajte tajný kľúč ručne.
- Podporuje TOTP a HOTP so SHA-1, SHA-256 alebo SHA-512 a 6 až 10 číslicami, ako aj Steam (5 znakov) a Battle.net (8 číslic).

**Súkromné a chránené**
- Účty sa ukladajú vo vašom zariadení v trezore šifrovanom pomocou AES-256-GCM. Nastavte heslo na ochranu jeho kľúča: bez hesla sa kľúč uchováva v zariadení vedľa údajov.
- Zamknite ho heslom (Argon2id), kódom na obnovenie a voliteľne odomykaním prístupovým kľúčom (nedostupné vo Firefoxe). Zvoľte, kedy sa má automaticky zamknúť.
- Voliteľne vyžadujte overenie zariadením pred použitím kódu (nedostupné vo Firefoxe) a skrývajte kódy klávesovou skratkou, ktorú si nastavíte.
- Dostanete upozornenie skôr, než sa kód použije na webe, ktorého adresa sa len podobá na web účtu.
- Skopírované kódy sa môžu vymazať zo schránky po 30 sekundách alebo po 1, 2 či 5 minútach (nie v Safari).
- Žiadna analytika, žiadne reklamy, žiadny server vývojára. Zdrojový kód je verejný.

**Nikdy nestratíte prístup**
- Šifrované zálohy a export do textu otpauth, CXF a QR kódov.
- Synchronizácia medzi vašimi zariadeniami cez vlastnú synchronizáciu prehliadača (Chrome, Edge, Firefox), šifrovaná, keď je zapnutý zámok heslom.
- Snímky na obnovenie, kôš na 30 dní a história zmien účtu.
- Kontrola hodín vás upozorní, keď by čas počítača spôsobil, že kódy nebudú fungovať.

**Zdieľajte kód, nie tajný kľúč**
- Pošlite odkaz, ktorý zobrazuje len kódy na najbližších 5 až 60 minút, voliteľne s heslom. Odkaz nikdy neobsahuje tajný kľúč.

**Dobré vedieť**
- Neexistuje žiadna cloudová záloha prevádzkovaná vývojárom. Zálohy sú súbory, ktoré si uchovávate sami; synchronizácia prebieha cez vlastnú synchronizáciu prehliadača.
- Odomykanie prístupovým kľúčom a overenie zariadením nie sú vo Firefoxe k dispozícii. Verzia pre Safari je len pre macOS.

K dispozícii v 43 jazykoch. Podporuje spravované pravidlá pre organizácie.

Popout Authenticator vytvára nezávislý vývojár. Vychádza z kódu a prekladov rozšírenia Authenticator (authenticator.cc) s licenciou MIT a nie je spojený s jeho autormi.

Google Authenticator je ochranná známka spoločnosti Google LLC.

Zásady ochrany súkromia: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Zdrojový kód: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `bočný panel (vo Firefoxe bočná lišta)` → `bočný panel`
- `prístupovým kľúčom (nedostupné vo Firefoxe)` → `prístupovým kľúčom`
- `pred použitím kódu (nedostupné vo Firefoxe)` → `pred použitím kódu`
- `cez vlastnú synchronizáciu prehliadača (Chrome, Edge, Firefox)` → `cez synchronizáciu Microsoft Edge`
- `na pozadí (Chrome, Edge, Whale).` → `na pozadí.`
- `5 minútach (nie v Safari).` → `5 minútach.`
- 이 줄을 뺀다: `- Odomykanie prístupovým kľúčom a overenie zariadením nie sú vo Firefoxe k dispozícii. Verzia pre Safari je len pre macOS.`
