# Veikala ieraksts — latviešu

## Nosaukums (manifest appName, 1.0.1)
Popout Authenticator — 2FA un OTP kodi

## Kopsavilkums (manifest appDesc, ne vairāk kā 132 rakstzīmes)
Atvērtā koda 2FA autentifikators. Vienreizēji kodi uznirstošajā logā, logā vai sānu panelī, ar paroles bloķēšanu un kopiju importu.

## Apraksts
(Ielīmējiet kā vienkāršu tekstu: noņemiet ** zīmes. Nosaukti zīmoli: ne vairāk kā pieci, saskaņā ar Chrome surogātpasta BUJ.)

Popout Authenticator rāda jūsu divfaktoru (2FA) vienreizējos kodus tieši pārlūkā: rīkjoslas uznirstošajā logā, atsevišķā logā vai sānu panelī. Tas ģenerē standarta TOTP un HOTP kodus, ir atvērtā koda (MIT), tam nav kontu skaita ierobežojuma, un tam nav nepieciešama reģistrācija vai serveris.

**Pāreja no cita autentifikatora**
- Importējiet paplašinājuma Authenticator (authenticator.cc) rezerves kopijas failu, arī ar paroli aizsargātas kopijas.
- Saderīgs ar Google Authenticator™ eksporta QR kodiem.
- Importējiet citu autentifikatora lietotņu nešifrētas rezerves kopijas, kā arī standarta akreditācijas datu apmaiņas (CXF) failus. Atbalstītās lietotnes: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Dažu lietotņu ar paroli aizsargātas rezerves kopijas var atvērt ar to paroli. Ja lietotnes šifrētās kopijas šeit nevar atvērt, vispirms eksportējiet nešifrētu kopiju šajā lietotnē.

**Atveriet tur, kur vajag**
- Izmantojiet rīkjoslas uznirstošo logu, atsevišķu logu vai sānu paneli (pārlūkā Firefox — sānjoslu).
- Meklējiet pēc laukiem vai ar vairākiem vārdiem, kārtojiet A–Z un izmantojiet grupas, svarīgos kontus, ikonas un kompakto skatu, lai gari saraksti būtu pārskatāmi.
- Redziet, kurš konts pieder atvērtajai vietnei, un aizpildiet tā kodu ar vienu klikšķi, ar labo peles pogu vai ar īsinājumtaustiņu. Noklikšķiniet ar labo peles pogu jebkurā lapas vietā, lai kopētu šīs vietnes kodu.
- Globāli īsinājumtaustiņi kopē pirmo trīs svarīgo kontu kodus, pat ja pārlūks ir fonā (Chrome, Edge, Whale).
- Pēc izvēles pogas blakus koda laukiem jūsu izvēlētās vietnēs.
- Atlasiet vairākus kontus, lai kopā pārvietotu tos uz citu grupu vai atkritni, un uzreiz atsauciet to. Pārdēvējiet vai atgrupējiet visu grupu uzreiz un kopējiet konta nosaukumu.
- Izmantojiet savu attēlu kā konta ikonu. Tas paliek šajā ierīcē.

**Pievienojiet kontus, kā jums ērtāk**
- Skenējiet QR kodu no pašreizējās cilnes, citas lietotnes loga, kameras, attēla vai starpliktuves.
- Ielīmējiet otpauth:// saites vai ievadiet slepeno atslēgu manuāli.
- Atbalsta TOTP un HOTP ar SHA-1, SHA-256 vai SHA-512 un 6–10 cipariem, kā arī Steam (5 rakstzīmes) un Battle.net (8 cipari).

**Privāti un aizsargāti**
- Konti tiek glabāti jūsu ierīcē glabātuvē, kas šifrēta ar AES-256-GCM. Iestatiet paroli, lai aizsargātu tās atslēgu: bez paroles atslēga tiek glabāta ierīcē blakus datiem.
- Bloķējiet ar paroli (Argon2id), atkopšanas kodu un neobligātu atbloķēšanu ar piekļuves atslēgu (nav pieejama pārlūkā Firefox). Izvēlieties, kad glabātuve bloķējas automātiski.
- Pēc izvēles pieprasiet ierīces verifikāciju, pirms kods tiek izmantots (nav pieejama pārlūkā Firefox), un paslēpiet kodus ar paša piešķirtu īsinājumtaustiņu.
- Saņemiet brīdinājumu, pirms kods tiek izmantots vietnē, kuras adrese tikai izskatās pēc konta vietnes.
- Nokopētos kodus var notīrīt no starpliktuves pēc 30 sekundēm, 1, 2 vai 5 minūtēm (izņemot Safari).
- Nav analītikas, nav reklāmu, nav izstrādātāja servera. Pirmkods ir publisks.

**Nekad nezaudējiet piekļuvi**
- Šifrētas rezerves kopijas, kā arī eksports uz otpauth tekstu, CXF un QR kodiem.
- Sinhronizācija starp jūsu ierīcēm, izmantojot paša pārlūka sinhronizāciju (Chrome, Edge, Firefox), šifrēta, ja ieslēgta paroles bloķēšana.
- Atkopšanas momentuzņēmumi, 30 dienu atkritne un kontu izmaiņu vēsture.
- Pulksteņa pārbaude brīdina, ja datora laika dēļ kodi nedarbotos.

**Kopīgojiet kodu, nevis slepeno atslēgu**
- Nosūtiet saiti, kas rāda tikai nākamo 5–60 minūšu kodus, pēc izvēles ar paroli. Saitē nekad nav slepenās atslēgas.

**Der zināt**
- Izstrādātājs neuztur mākoņa rezerves kopijas. Rezerves kopijas ir faili, kurus glabājat paši; sinhronizācija notiek ar paša pārlūka sinhronizāciju.
- Atbloķēšana ar piekļuves atslēgu un ierīces verifikācija nav pieejama pārlūkā Firefox. Safari versija ir tikai macOS.

Pieejams 43 valodās. Atbalsta organizāciju pārvaldītās politikas.

Popout Authenticator veido neatkarīgs izstrādātājs. Tas balstās uz paplašinājuma Authenticator (authenticator.cc) MIT licencēto kodu un tulkojumiem un nav saistīts ar tā autoriem.

Google Authenticator ir uzņēmuma Google LLC preču zīme.

Privātuma politika: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Pirmkods: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `sānu paneli (pārlūkā Firefox — sānjoslu)` → `sānu paneli`
- `atbloķēšanu ar piekļuves atslēgu (nav pieejama pārlūkā Firefox)` → `atbloķēšanu ar piekļuves atslēgu`
- `pirms kods tiek izmantots (nav pieejama pārlūkā Firefox)` → `pirms kods tiek izmantots`
- `izmantojot paša pārlūka sinhronizāciju (Chrome, Edge, Firefox)` → `izmantojot Microsoft Edge sinhronizāciju`
- `ir fonā (Chrome, Edge, Whale).` → `ir fonā.`
- `5 minūtēm (izņemot Safari).` → `5 minūtēm.`
- 이 줄을 뺀다: `- Atbloķēšana ar piekļuves atslēgu un ierīces verifikācija nav pieejama pārlūkā Firefox. Safari versija ir tikai macOS.`
