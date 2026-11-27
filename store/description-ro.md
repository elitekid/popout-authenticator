# Informații pentru magazin — română

## Nume (manifest appName, 1.0.1)
Popout Authenticator — Coduri 2FA și OTP

## Rezumat (manifest appDesc, maximum 132 de caractere)
Autentificator 2FA open source: coduri unice în pop-up, fereastră sau panou lateral, blocare cu parolă, import de copii de rezervă.

## Descriere
(Lipește ca text simplu: elimină marcajele **. Mărci menționate: cel mult cinci, conform întrebărilor frecvente Chrome despre spam.)

Popout Authenticator îți afișează codurile unice pentru autentificarea în doi pași (2FA) direct în browser: în fereastra pop-up din bara de instrumente, într-o fereastră separată sau în panoul lateral. Generează coduri TOTP și HOTP standard, este open source (MIT), nu are limită de conturi și nu necesită înregistrare sau server.

**Treci de la alt autentificator**
- Importă fișierul de rezervă al extensiei Authenticator (authenticator.cc), inclusiv copiile de rezervă protejate cu parolă.
- Compatibil cu codurile QR de export din Google Authenticator™.
- Importă copii de rezervă în text simplu din alte aplicații de autentificare, precum și fișiere standard de schimb de date de autentificare (CXF). Aplicații acceptate: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Deschide copiile de rezervă protejate cu parolă ale unor aplicații folosind parola lor. Pentru aplicațiile ale căror copii de rezervă criptate nu pot fi deschise aici, exportă mai întâi o copie de rezervă în text simplu din aplicația respectivă.

**Deschide-l unde ai nevoie**
- Folosește fereastra pop-up din bara de instrumente, o fereastră separată sau panoul lateral (bara laterală în Firefox).
- Caută după câmp sau cu mai multe cuvinte, sortează A–Z și folosește grupuri, conturi importante, pictograme și o vizualizare compactă pentru a păstra ordinea în listele lungi.
- Vezi ce cont aparține site-ului pe care te afli și completează-i codul cu un clic, cu clic dreapta sau cu o comandă rapidă de la tastatură. Dă clic dreapta oriunde pe o pagină pentru a copia codul site-ului respectiv.
- Comenzile rapide globale copiază codurile primelor trei conturi importante, chiar și cât timp browserul este în fundal (Chrome, Edge, Whale).
- Butoane opționale lângă câmpurile pentru coduri, pe site-urile pe care le alegi.
- Selectează mai multe conturi pentru a le muta împreună în alt grup sau în coșul de gunoi și anulează imediat, dacă vrei. Redenumește sau desfă un grup întreg dintr-odată și copiază numele unui cont.
- Folosește propria imagine ca pictogramă a unui cont. Ea rămâne pe acest dispozitiv.

**Adaugă conturi cum vrei**
- Scanează un cod QR din fila curentă, din fereastra altei aplicații, cu camera, dintr-o imagine sau din clipboard.
- Lipește linkuri otpauth:// sau introdu manual cheia secretă.
- Acceptă TOTP și HOTP cu SHA-1, SHA-256 sau SHA-512 și 6–10 cifre, plus Steam (5 caractere) și Battle.net (8 cifre).

**Privat și protejat**
- Conturile sunt stocate pe dispozitiv într-un seif criptat cu AES-256-GCM. Setează o parolă pentru a-i proteja cheia: fără parolă, cheia este păstrată pe dispozitiv lângă date.
- Blochează-l cu o parolă (Argon2id), un cod de recuperare și, opțional, deblocare cu cheie de acces (indisponibilă în Firefox). Alege când se blochează automat.
- Opțional, cere verificarea pe dispozitiv înainte de folosirea unui cod (indisponibilă în Firefox) și ascunde codurile cu o comandă rapidă de la tastatură aleasă de tine.
- Primești un avertisment înainte ca un cod să fie folosit pe un site a cărui adresă doar seamănă cu site-ul contului.
- Codurile copiate pot fi golite din clipboard după 30 de secunde, 1, 2 sau 5 minute (nu în Safari).
- Fără analize, fără reclame, fără server al dezvoltatorului. Codul sursă este public.

**Nu pierzi niciodată accesul**
- Copii de rezervă criptate, plus export ca text otpauth, CXF și coduri QR.
- Sincronizare între dispozitive prin sincronizarea proprie a browserului (Chrome, Edge, Firefox), criptată când blocarea cu parolă este activă.
- Instantanee de recuperare, coș de gunoi pentru 30 de zile și istoric al modificărilor contului.
- Verificarea ceasului te avertizează când ora computerului ar face codurile să nu funcționeze.

**Partajează un cod, nu cheia secretă**
- Trimite un link care afișează doar codurile pentru următoarele 5–60 de minute, cu parolă opțională. Linkul nu conține niciodată cheia secretă.

**Bine de știut**
- Nu există copie de rezervă în cloud administrată de dezvoltator. Copiile de rezervă sunt fișiere pe care le păstrezi tu; sincronizarea se face prin sincronizarea proprie a browserului.
- Deblocarea cu cheie de acces și verificarea pe dispozitiv nu sunt disponibile în Firefox. Versiunea pentru Safari este doar pentru macOS.

Disponibil în 43 de limbi. Acceptă politici gestionate pentru organizații.

Popout Authenticator este creat de un dezvoltator independent. Se bazează pe codul și traducerile cu licență MIT ale extensiei Authenticator (authenticator.cc) și nu este afiliat cu autorii acesteia.

Google Authenticator este o marcă comercială a Google LLC.

Politica de confidențialitate: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Cod sursă: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `panoul lateral (bara laterală în Firefox)` → `panoul lateral`
- `și, opțional, deblocare cu cheie de acces (indisponibilă în Firefox)` → `și, opțional, deblocare cu cheie de acces`
- `înainte de folosirea unui cod (indisponibilă în Firefox)` → `înainte de folosirea unui cod`
- `prin sincronizarea proprie a browserului (Chrome, Edge, Firefox)` → `prin sincronizarea Microsoft Edge`
- `în fundal (Chrome, Edge, Whale).` → `în fundal.`
- `5 minute (nu în Safari).` → `5 minute.`
- 이 줄을 뺀다: `- Deblocarea cu cheie de acces și verificarea pe dispozitiv nu sunt disponibile în Firefox. Versiunea pentru Safari este doar pentru macOS.`
