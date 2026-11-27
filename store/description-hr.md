# Podaci za trgovinu — hrvatski

## Naziv (manifest appName, 1.0.1)
Popout Authenticator — 2FA i OTP kodovi

## Sažetak (manifest appDesc, najviše 132 znaka)
2FA autentifikator otvorenog koda. Jednokratni kodovi u skočnom prozoru ili bočnoj ploči, uz lozinku i uvoz kopija.

## Opis
(Zalijepite kao običan tekst: uklonite oznake **. Navedeni brendovi: najviše pet, prema Chromeovim čestim pitanjima o neželjenom sadržaju.)

Popout Authenticator prikazuje vaše jednokratne kodove za dvofaktorsku autentifikaciju (2FA) izravno u pregledniku: u skočnom prozoru alatne trake, zasebnom prozoru ili bočnoj ploči. Generira standardne TOTP i HOTP kodove, otvorenog je koda (MIT), nema ograničenja broja računa i ne traži registraciju ni poslužitelj.

**Prelazak s drugog autentifikatora**
- Uvezite datoteku sigurnosne kopije proširenja Authenticator (authenticator.cc), uključujući kopije zaštićene lozinkom.
- Kompatibilno s QR kodovima za izvoz iz aplikacije Google Authenticator™.
- Uvezite nešifrirane sigurnosne kopije iz drugih aplikacija za autentifikaciju te standardne datoteke za razmjenu vjerodajnica (CXF). Podržane aplikacije: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Lozinkom zaštićene sigurnosne kopije nekih aplikacija otvorite njihovom lozinkom. Za aplikacije čije se šifrirane kopije ovdje ne mogu otvoriti najprije u toj aplikaciji izvezite nešifriranu sigurnosnu kopiju.

**Otvorite ga gdje vam treba**
- Koristite skočni prozor alatne trake, zaseban prozor ili bočnu ploču (bočnu traku u Firefoxu).
- Pretražujte po polju ili s više riječi, poredajte A–Ž te koristite grupe, važne račune, ikone i kompaktni prikaz kako bi dugi popisi ostali pregledni.
- Pogledajte koji račun pripada web-lokaciji na kojoj ste i unesite njegov kôd jednim klikom, desnim klikom ili tipkovnim prečacem. Desnom tipkom kliknite bilo gdje na stranici kako biste kopirali kôd te web-lokacije.
- Globalni prečaci kopiraju kodove prva tri važna računa, čak i dok je preglednik u pozadini (Chrome, Edge, Whale).
- Neobavezni gumbi pokraj polja za kôd na web-lokacijama koje odaberete.
- Odaberite više računa kako biste ih zajedno premjestili u drugu grupu ili u otpad i to odmah poništili. Preimenujte ili razgrupirajte cijelu grupu odjednom i kopirajte naziv računa.
- Koristite vlastitu sliku kao ikonu računa. Ostaje na ovom uređaju.

**Dodajte račune na svoj način**
- Skenirajte QR kôd s trenutačne kartice, iz prozora druge aplikacije, kamerom, sa slike ili iz međuspremnika.
- Zalijepite otpauth:// veze ili ručno upišite tajni ključ.
- Podržava TOTP i HOTP sa SHA-1, SHA-256 ili SHA-512 i od 6 do 10 znamenki, uz Steam (5 znakova) i Battle.net (8 znamenki).

**Privatno i zaštićeno**
- Računi se spremaju na vaš uređaj u trezor šifriran algoritmom AES-256-GCM. Postavite lozinku za zaštitu njegova ključa: bez nje se ključ čuva na uređaju uz podatke.
- Zaključajte ga lozinkom (Argon2id), kodom za oporavak i neobaveznim otključavanjem pristupnim ključem (nije dostupno u Firefoxu). Odaberite kada se automatski zaključava.
- Po želji zatražite provjeru uređajem prije upotrebe koda (nije dostupno u Firefoxu) i sakrijte kodove tipkovnim prečacem koji sami dodijelite.
- Dobijte upozorenje prije upotrebe koda na web-lokaciji čija adresa samo nalikuje web-lokaciji računa.
- Kopirani kodovi mogu se izbrisati iz međuspremnika nakon 30 sekundi, 1, 2 ili 5 minuta (ne u Safariju).
- Bez analitike, bez oglasa, bez poslužitelja razvojnog programera. Izvorni kôd je javan.

**Nikad ne izgubite pristup**
- Šifrirane sigurnosne kopije te izvoz u otpauth tekst, CXF i QR kodove.
- Sinkronizacija između vaših uređaja putem vlastite sinkronizacije preglednika (Chrome, Edge, Firefox), šifrirana kad je uključeno zaključavanje lozinkom.
- Snimke za oporavak, otpad na 30 dana i povijest promjena računa.
- Provjera sata upozorava vas kad bi vrijeme na računalu uzrokovalo neispravne kodove.

**Dijelite kôd, a ne tajni ključ**
- Pošaljite vezu koja prikazuje samo kodove za sljedećih 5 do 60 minuta, uz neobaveznu lozinku. Veza nikad ne sadrži tajni ključ.

**Dobro je znati**
- Ne postoji sigurnosna kopija u oblaku koju vodi razvojni programer. Sigurnosne kopije su datoteke koje sami čuvate; sinkronizacija ide putem vlastite sinkronizacije preglednika.
- Otključavanje pristupnim ključem i provjera uređajem nisu dostupni u Firefoxu. Verzija za Safari dostupna je samo za macOS.

Dostupno na 43 jezika. Podržava upravljana pravila za organizacije.

Popout Authenticator izradio je neovisni razvojni programer. Temelji se na kodu i prijevodima proširenja Authenticator (authenticator.cc) objavljenima pod licencom MIT i nije povezan s njegovim autorima.

Google Authenticator zaštitni je znak tvrtke Google LLC.

Pravila o privatnosti: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Izvorni kôd: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `bočnu ploču (bočnu traku u Firefoxu)` → `bočnu ploču`
- `otključavanjem pristupnim ključem (nije dostupno u Firefoxu)` → `otključavanjem pristupnim ključem`
- `prije upotrebe koda (nije dostupno u Firefoxu)` → `prije upotrebe koda`
- `putem vlastite sinkronizacije preglednika (Chrome, Edge, Firefox)` → `putem sinkronizacije preglednika Microsoft Edge`
- `u pozadini (Chrome, Edge, Whale).` → `u pozadini.`
- `5 minuta (ne u Safariju).` → `5 minuta.`
- 이 줄을 뺀다: `- Otključavanje pristupnim ključem i provjera uređajem nisu dostupni u Firefoxu. Verzija za Safari dostupna je samo za macOS.`
