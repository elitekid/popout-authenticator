# Butikkoppføring — norsk (bokmål)

## Navn (manifest appName, 1.0.1)
Popout Authenticator — 2FA- og engangskoder

## Sammendrag (manifest appDesc, høyst 132 tegn)
2FA-autentisering med åpen kildekode. Engangskoder i forgrunnsvindu, eget vindu eller sidepanel, med passordlås og import.

## Beskrivelse
(Lim inn som ren tekst: fjern **-tegnene. Nevnte merkenavn: høyst fem, i tråd med Chromes spam-FAQ.)

Popout Authenticator viser engangskodene dine for tofaktorautentisering (2FA) rett i nettleseren: i forgrunnsvinduet på verktøylinjen, i et eget vindu eller i sidepanelet. Den genererer standard TOTP- og HOTP-koder, har åpen kildekode (MIT), har ingen grense for antall kontoer og krever verken registrering eller server.

**Bytt fra en annen autentiseringsapp**
- Importer sikkerhetskopifilen fra utvidelsen Authenticator (authenticator.cc), også passordbeskyttede sikkerhetskopier.
- Kompatibel med eksport-QR-koder fra Google Authenticator™.
- Importer ukrypterte sikkerhetskopier fra andre autentiseringsapper, samt standardfiler for utveksling av påloggingsinformasjon (CXF). Støttede apper: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Åpne passordbeskyttede sikkerhetskopier fra enkelte apper med passordet deres. Hvis en apps krypterte sikkerhetskopi ikke kan åpnes her, eksporterer du først en ukryptert sikkerhetskopi i den appen.

**Åpne den der du trenger den**
- Bruk forgrunnsvinduet på verktøylinjen, et eget vindu eller sidepanelet (sidefeltet i Firefox).
- Søk etter felt eller med flere ord, sorter A–Å, og bruk grupper, viktige kontoer, ikoner og en kompakt visning for å holde lange lister ryddige.
- Se hvilken konto som hører til nettstedet du er på, og fyll ut koden med ett klikk, et høyreklikk eller en hurtigtast. Høyreklikk hvor som helst på en side for å kopiere koden for nettstedet.
- Globale snarveier kopierer kodene til de tre første viktige kontoene dine, selv mens nettleseren er i bakgrunnen (Chrome, Edge, Whale).
- Valgfrie knapper ved siden av kodefelter på nettstedene du velger.
- Velg flere kontoer for å flytte dem til en annen gruppe eller til papirkurven samtidig, og angre med en gang. Gi en hel gruppe nytt navn eller oppløs den på én gang, og kopier navnet på en konto.
- Bruk ditt eget bilde som ikon for en konto. Det blir værende på denne enheten.

**Legg til kontoer slik du vil**
- Skann en QR-kode fra gjeldende fane, vinduet til en annen app, kameraet, et bilde eller utklippstavlen.
- Lim inn otpauth://-lenker, eller skriv inn den hemmelige nøkkelen manuelt.
- Støtter TOTP og HOTP med SHA-1, SHA-256 eller SHA-512 og 6 til 10 sifre, samt Steam (5 tegn) og Battle.net (8 sifre).

**Privat og beskyttet**
- Kontoer lagres på enheten din i et hvelv som er kryptert med AES-256-GCM. Angi et passord for å beskytte nøkkelen til hvelvet: Uten passord oppbevares nøkkelen på enheten ved siden av dataene.
- Lås det med et passord (Argon2id), en gjenopprettingskode og valgfri opplåsing med tilgangsnøkkel (ikke tilgjengelig i Firefox). Velg når det låses automatisk.
- Krev eventuelt enhetsbekreftelse før en kode brukes (ikke tilgjengelig i Firefox), og skjul koder med en hurtigtast du selv velger.
- Få en advarsel før en kode brukes på et nettsted der adressen bare ligner kontoens nettsted.
- Kopierte koder kan fjernes fra utklippstavlen etter 30 sekunder, 1, 2 eller 5 minutter (ikke i Safari).
- Ingen analyse, ingen reklame, ingen utviklerserver. Kildekoden er offentlig.

**Mist aldri tilgangen**
- Krypterte sikkerhetskopier, samt eksport til otpauth-tekst, CXF og QR-koder.
- Synkronisering mellom enhetene dine via nettleserens egen synkronisering (Chrome, Edge, Firefox), kryptert når passordlåsen er på.
- Øyeblikksbilder for gjenoppretting, en papirkurv med 30 dager og en logg over kontoendringer.
- Klokkesjekken advarer deg når klokkeslettet på datamaskinen ville fått kodene til å feile.

**Del en kode, ikke den hemmelige nøkkelen**
- Send en lenke som bare viser kodene for de neste 5 til 60 minuttene, med valgfritt passord. Lenken inneholder aldri den hemmelige nøkkelen.

**Greit å vite**
- Det finnes ingen skysikkerhetskopi som drives av utvikleren. Sikkerhetskopier er filer du oppbevarer selv; synkronisering går via nettleserens egen synkronisering.
- Opplåsing med tilgangsnøkkel og enhetsbekreftelse er ikke tilgjengelig i Firefox. Safari-versjonen er bare for macOS.

Tilgjengelig på 43 språk. Støtter administrerte retningslinjer for organisasjoner.

Popout Authenticator er laget av en uavhengig utvikler. Den bygger på MIT-lisensiert kode og oversettelser fra utvidelsen Authenticator (authenticator.cc) og er ikke tilknyttet utviklerne av den.

Google Authenticator er et varemerke for Google LLC.

Personvernerklæring: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Kildekode: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `sidepanelet (sidefeltet i Firefox)` → `sidepanelet`
- `og valgfri opplåsing med tilgangsnøkkel (ikke tilgjengelig i Firefox)` → `og valgfri opplåsing med tilgangsnøkkel`
- `før en kode brukes (ikke tilgjengelig i Firefox)` → `før en kode brukes`
- `via nettleserens egen synkronisering (Chrome, Edge, Firefox)` → `via Microsoft Edge-synkronisering`
- `i bakgrunnen (Chrome, Edge, Whale).` → `i bakgrunnen.`
- `5 minutter (ikke i Safari).` → `5 minutter.`
- 이 줄을 뺀다: `- Opplåsing med tilgangsnøkkel og enhetsbekreftelse er ikke tilgjengelig i Firefox. Safari-versjonen er bare for macOS.`
