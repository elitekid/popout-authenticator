# Butiksbeskrivelse — dansk

## Navn (manifest appName, 1.0.1)
Popout Authenticator — 2FA- og engangskoder

## Resumé (manifest appDesc, højst 132 tegn)
2FA-godkender med åben kildekode. Engangskoder i pop op, vindue eller sidepanel med adgangskodelås og import af sikkerhedskopier.

## Beskrivelse
(Indsæt som ren tekst: fjern **-tegnene. Nævnte mærker: højst fem, jf. Chromes spam-FAQ.)

Popout Authenticator viser dine engangskoder til totrinsbekræftelse (2FA) direkte i browseren: i pop op-vinduet på værktøjslinjen, i et separat vindue eller i sidepanelet. Den genererer standardkoder af typen TOTP og HOTP, har åben kildekode (MIT), har ingen grænse for antallet af konti og kræver hverken tilmelding eller server.

**Skift fra en anden godkendelsesapp**
- Importér sikkerhedskopifilen fra udvidelsen Authenticator (authenticator.cc), også adgangskodebeskyttede sikkerhedskopier.
- Kompatibel med eksport-QR-koder fra Google Authenticator™.
- Importér ukrypterede sikkerhedskopier fra andre godkendelsesapps samt standardfiler til udveksling af loginoplysninger (CXF). Understøttede apps: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Åbn adgangskodebeskyttede sikkerhedskopier fra nogle apps med deres adgangskode. Hvis en apps krypterede sikkerhedskopi ikke kan åbnes her, skal du først eksportere en ukrypteret sikkerhedskopi i den app.

**Åbn den, hvor du har brug for den**
- Brug pop op-vinduet på værktøjslinjen, et separat vindue eller sidepanelet (sidebjælken i Firefox).
- Søg efter felt eller med flere ord, sortér A–Å, og brug grupper, vigtige konti, ikoner og en kompakt visning til at holde lange lister overskuelige.
- Se, hvilken konto der hører til det websted, du er på, og udfyld dens kode med ét klik, et højreklik eller en tastaturgenvej. Højreklik hvor som helst på en side for at kopiere webstedets kode.
- Globale genveje kopierer koderne til dine første tre vigtige konti, selv mens browseren er i baggrunden (Chrome, Edge, Whale).
- Valgfrie knapper ved siden af kodefelter på de websteder, du vælger.
- Vælg flere konti for at flytte dem til en anden gruppe eller til papirkurven på én gang, og fortryd det med det samme. Omdøb eller opløs en hel gruppe på én gang, og kopiér en kontos navn.
- Brug dit eget billede som ikon for en konto. Det bliver på denne enhed.

**Tilføj konti, som du vil**
- Scan en QR-kode fra den aktuelle fane, en anden apps vindue, dit kamera, et billede eller udklipsholderen.
- Indsæt otpauth://-links, eller skriv den hemmelige nøgle manuelt.
- Understøtter TOTP og HOTP med SHA-1, SHA-256 eller SHA-512 og 6 til 10 cifre samt Steam (5 tegn) og Battle.net (8 cifre).

**Privat og beskyttet**
- Konti gemmes på din enhed i en boks, der er krypteret med AES-256-GCM. Angiv en adgangskode for at beskytte dens nøgle: Uden adgangskode opbevares nøglen på enheden sammen med dataene.
- Lås den med en adgangskode (Argon2id), en gendannelseskode og valgfri oplåsning med adgangsnøgle (ikke tilgængelig i Firefox). Vælg, hvornår den låses automatisk.
- Kræv eventuelt enhedsbekræftelse, før en kode bruges (ikke tilgængelig i Firefox), og skjul koder med en tastaturgenvej, du selv vælger.
- Få en advarsel, før en kode bruges på et websted, hvis adresse kun ligner kontoens websted.
- Kopierede koder kan ryddes fra udklipsholderen efter 30 sekunder, 1, 2 eller 5 minutter (ikke i Safari).
- Ingen statistik, ingen reklamer, ingen udviklerserver. Kildekoden er offentlig.

**Mist aldrig adgangen**
- Krypterede sikkerhedskopier samt eksport til otpauth-tekst, CXF og QR-koder.
- Synkronisering mellem dine enheder via browserens egen synkronisering (Chrome, Edge, Firefox), krypteret når adgangskodelåsen er slået til.
- Gendannelsesøjebliksbilleder, en papirkurv med 30 dage og en historik over kontoændringer.
- Urkontrollen advarer dig, når computerens tid ville få koderne til at fejle.

**Del en kode, ikke den hemmelige nøgle**
- Send et link, der kun viser koderne for de næste 5 til 60 minutter, med en valgfri adgangskode. Linket indeholder aldrig den hemmelige nøgle.

**Godt at vide**
- Der er ingen skybackup, som drives af udvikleren. Sikkerhedskopier er filer, du selv opbevarer; synkronisering går via browserens egen synkronisering.
- Oplåsning med adgangsnøgle og enhedsbekræftelse er ikke tilgængelige i Firefox. Safari-versionen er kun til macOS.

Tilgængelig på 43 sprog. Understøtter administrerede politikker for organisationer.

Popout Authenticator er lavet af en uafhængig udvikler. Den bygger på MIT-licenseret kode og oversættelser fra udvidelsen Authenticator (authenticator.cc) og er ikke tilknyttet dens udviklere.

Google Authenticator er et varemærke tilhørende Google LLC.

Privatlivspolitik: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Kildekode: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `sidepanelet (sidebjælken i Firefox)` → `sidepanelet`
- `og valgfri oplåsning med adgangsnøgle (ikke tilgængelig i Firefox)` → `og valgfri oplåsning med adgangsnøgle`
- `før en kode bruges (ikke tilgængelig i Firefox)` → `før en kode bruges`
- `via browserens egen synkronisering (Chrome, Edge, Firefox)` → `via Microsoft Edge-synkronisering`
- `i baggrunden (Chrome, Edge, Whale).` → `i baggrunden.`
- `5 minutter (ikke i Safari).` → `5 minutter.`
- 이 줄을 뺀다: `- Oplåsning med adgangsnøgle og enhedsbekræftelse er ikke tilgængelige i Firefox. Safari-versionen er kun til macOS.`
