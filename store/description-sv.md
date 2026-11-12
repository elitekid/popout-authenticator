# Butiksinformation — Svenska

## Namn (manifest appName, 1.0.1)
Popout Authenticator

## Sammanfattning (manifest appDesc, högst 132 tecken)
2FA-autentiserare för din webbläsare. Skapar engångskoder och öppnas som popup eller separat fönster.

## Beskrivning
(Klistra in som vanlig text, utan **. Högst fem andra produktnamn, enligt Chrome Web Stores spam-FAQ.)

Popout Authenticator visar dina engångskoder för tvåfaktorsautentisering (2FA) direkt i webbläsaren: i verktygsfältets popup, i ett separat fönster eller i sidopanelen. Det skapar vanliga TOTP- och HOTP-koder, har öppen källkod (MIT), har ingen gräns för antalet konton och kräver varken registrering eller server.

**Byt från en annan autentiserare**
- Importera säkerhetskopian från tillägget Authenticator (authenticator.cc), även lösenordsskyddade säkerhetskopior.
- Kompatibel med export-QR-koder från Google Authenticator™.
- Importera okrypterade säkerhetskopior från andra autentiseringsappar samt filer i standardformatet Credential Exchange (CXF). Appar som stöds (på engelska): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Krypterade säkerhetskopior från vissa appar går inte att öppna här. Exportera då först en okrypterad säkerhetskopia i den appen.

**Öppna det där du behöver det**
- Använd verktygsfältets popup, ett separat fönster eller sidopanelen (sidofältet i Firefox).
- Sökning per fält eller med flera ord, sortering A–Ö, grupper, fästa konton, ikoner och en kompakt vy håller långa listor överskådliga.
- Se vilket konto som hör till webbplatsen du är på och fyll i koden med ett klick, ett högerklick eller ett kortkommando.
- Globala kortkommandon kopierar koderna för dina tre första viktiga konton, även när webbläsaren ligger i bakgrunden (Chrome, Edge, Whale).
- Valfria knappar bredvid kodfält på webbplatser du väljer.
- Markera flera konton och flytta dem till papperskorgen tillsammans, byt namn på eller dela upp en hel grupp på en gång och kopiera ett kontos namn.

**Lägg till konton som du vill**
- Skanna en QR-kod från aktuell flik, från en annan apps fönster, med kameran, från en bild eller från urklipp.
- Klistra in otpauth://-länkar eller skriv in den hemliga nyckeln för hand.
- Stöder TOTP och HOTP med SHA-1, SHA-256 eller SHA-512 och 6 till 10 siffror, samt Steam (5 tecken) och Battle.net (8 siffror).

**Privat och skyddat**
- Konton lagras på din enhet i ett valv som krypteras med AES-256-GCM. Ange ett lösenord för att skydda dess nyckel: utan lösenord ligger nyckeln på enheten bredvid data.
- Lås med lösenord (Argon2id), återställningskod och valfri upplåsning med passkey (inte i Firefox). Välj när det låses automatiskt.
- Kräv vid behov enhetsverifiering innan en kod används (inte i Firefox), och dölj koder med ett kortkommando du väljer.
- Kopierade koder kan rensas från urklipp efter 30 sekunder, 1, 2 eller 5 minuter (inte i Safari).
- Ingen analys, ingen reklam, ingen server hos utvecklaren. Källkoden är öppen.

**Behåll åtkomsten**
- Krypterade säkerhetskopior samt export till otpauth-text, CXF och QR-koder.
- Synkronisera mellan dina enheter via webbläsarens egen synkronisering (Chrome, Edge, Firefox), krypterad när lösenordslåset är på.
- Ögonblicksbilder för återställning, en papperskorg i 30 dagar och en ändringshistorik per konto.
- Klockkontrollen varnar när datorns tid skulle få koderna att misslyckas.

**Dela en kod, inte hemligheten**
- Skicka en länk som bara visar koderna för de kommande 5 till 60 minuterna, med valfritt lösenord. Länken innehåller aldrig den hemliga nyckeln.

**Bra att veta**
- Det finns ingen molnsäkerhetskopia som drivs av utvecklaren. Säkerhetskopior är filer som du själv sparar; synkronisering sker via webbläsaren.
- Upplåsning med passkey och enhetsverifiering finns inte i Firefox. Safari-versionen är endast för macOS.

Finns på 20 språk. Stöder hanterade policyer för organisationer.

Popout Authenticator är gjort av en oberoende utvecklare. Det bygger på MIT-licensierad kod och översättningar från tillägget Authenticator (authenticator.cc) och har ingen koppling till dess upphovspersoner.

Google Authenticator är ett varumärke som tillhör Google LLC.

Integritetspolicy: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Källkod: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `sidopanelen (sidofältet i Firefox)` → `sidopanelen`
- `valfri upplåsning med passkey (inte i Firefox)` → `valfri upplåsning med passkey`
- `innan en kod används (inte i Firefox)` → `innan en kod används`
- `via webbläsarens egen synkronisering (Chrome, Edge, Firefox)` → `via Microsoft Edge-synkronisering`
- `i bakgrunden (Chrome, Edge, Whale).` → `i bakgrunden.`
- `5 minuter (inte i Safari).` → `5 minuter.`
- 이 줄을 뺀다: `- Upplåsning med passkey och enhetsverifiering finns inte i Firefox. Safari-versionen är endast för macOS.`
