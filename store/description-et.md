# Poe kirje — eesti keel

## Nimi (manifest appName, 1.0.1)
Popout Authenticator — 2FA- ja OTP-koodid

## Kokkuvõte (manifest appDesc, kuni 132 märki)
Avatud lähtekoodiga 2FA-autentija. Ühekordsed koodid hüpikaknas, aknas või külgpaneelil, salasõnalukk ja varukoopiate import.

## Kirjeldus
(Kleepige lihttekstina: eemaldage ** märgid. Nimetatud kaubamärke: kuni viis, Chrome'i rämpsposti KKK järgi.)

Popout Authenticator näitab teie kaheastmelise kinnitamise (2FA) ühekordseid koode otse brauseris: tööriistariba hüpikaknas, eraldi aknas või külgpaneelil. See loob standardseid TOTP- ja HOTP-koode, on avatud lähtekoodiga (MIT), ei piira kontode arvu ega vaja registreerumist ega serverit.

**Üleminek teiselt autentijalt**
- Importige Authenticator-laienduse (authenticator.cc) varukoopiafail, ka salasõnaga kaitstud varukoopiad.
- Ühildub Google Authenticator™-i ekspordi-QR-koodidega.
- Importige teiste autentimisrakenduste lihttekstvarukoopiaid ning standardseid mandaadivahetuse (CXF) faile. Toetatud rakendused (inglise keeles): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Mõne rakenduse salasõnaga kaitstud varukoopiad saab avada nende salasõnaga. Kui rakenduse krüpteeritud varukoopiat siin avada ei saa, eksportige selles rakenduses esmalt lihttekstvarukoopia.

**Avage see seal, kus vajate**
- Avage see tööriistariba hüpikaknas, eraldi aknas või külgpaneelil (Firefoxis külgriba).
- Otsige välja järgi või mitme sõnaga, sortige A–Z ning kasutage rühmi, olulisi kontosid, ikoone ja kompaktset vaadet, et pikad loendid püsiksid korras.
- Vaadake, milline konto kuulub avatud saidile, ja täitke selle kood ühe klõpsu, paremklõpsu või kiirklahviga. Paremklõpsake lehel ükskõik kus, et kopeerida selle saidi kood.
- Globaalsed otseteed kopeerivad kolme esimese olulise konto koodid ka siis, kui brauser on taustal (Chrome, Edge, Whale).
- Valikulised nupud koodiväljade kõrval teie valitud saitidel.
- Valige mitu kontot, et teisaldada need korraga teise rühma või prügikasti, ja võtke see kohe tagasi. Nimetage terve rühm korraga ümber või tühistage rühmitus ning kopeerige konto nimi.
- Kasutage konto ikoonina oma pilti. See jääb sellesse seadmesse.

**Lisage kontosid omal moel**
- Skannige QR-kood praeguselt vahekaardilt, teise rakenduse aknast, kaameraga, pildilt või lõikelaualt.
- Kleepige otpauth:// lingid või sisestage salajane võti käsitsi.
- Toetab TOTP-d ja HOTP-d algoritmidega SHA-1, SHA-256 või SHA-512 ning 6–10 numbriga, samuti Steami (5 märki) ja Battle.neti (8 numbrit) koode.

**Privaatne ja kaitstud**
- Kontod salvestatakse teie seadmes hoidlasse, mis on krüpteeritud AES-256-GCM-iga. Selle võtme kaitsmiseks määrake salasõna: ilma selleta hoitakse võtit seadmes andmete kõrval.
- Lukustamiseks on salasõna (Argon2id), taastekood ja valikuline lukuavamine pääsuvõtmega (pole Firefoxis saadaval). Valige, millal see automaatselt lukustub.
- Soovi korral nõudke seadmega kinnitamist enne koodi kasutamist (pole Firefoxis saadaval) ning peitke koodid enda määratud kiirklahviga.
- Saate hoiatuse, enne kui koodi kasutatakse saidil, mille aadress ainult meenutab konto saiti.
- Kopeeritud koodid saab lõikelaualt eemaldada 30 sekundi, 1, 2 või 5 minuti pärast (pole Safaris).
- Analüütikat, reklaame ega arendaja serverit pole. Lähtekood on avalik.

**Juurdepääs ei kao**
- Krüpteeritud varukoopiad ning eksport otpauth-tekstina, CXF-ina ja QR-koodidena.
- Sünkroonimine teie seadmete vahel brauseri enda sünkroonimise kaudu (Chrome, Edge, Firefox), salasõnaluku korral krüpteeritult.
- Taastamise hetktõmmised, 30-päevane prügikast ja konto muudatuste ajalugu.
- Kella kontroll hoiatab, kui arvuti kellaaja tõttu koodid ei töötaks.

**Jagage koodi, mitte salajast võtit**
- Saatke link, mis näitab ainult järgmise 5 kuni 60 minuti koode, soovi korral salasõnaga. Link ei sisalda kunagi salajast võtit.

**Hea teada**
- Arendaja hallatavat pilvevarundust pole. Varukoopiad on failid, mida hoiate ise; sünkroonimine käib brauseri enda sünkroonimise kaudu.
- Pääsuvõtmega lukuavamine ja seadmega kinnitamine pole Firefoxis saadaval. Safari versioon on ainult macOS-i jaoks.

Saadaval 43 keeles. Toetab organisatsioonide hallatud poliitikaid.

Popout Authenticatori on teinud sõltumatu arendaja. See põhineb Authenticator-laienduse (authenticator.cc) MIT-litsentsiga koodil ja tõlgetel ega ole seotud selle autoritega.

Google Authenticator on ettevõtte Google LLC kaubamärk.

Privaatsuspoliitika: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Lähtekood: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `külgpaneelil (Firefoxis külgriba)` → `külgpaneelil`
- `ja valikuline lukuavamine pääsuvõtmega (pole Firefoxis saadaval)` → `ja valikuline lukuavamine pääsuvõtmega`
- `enne koodi kasutamist (pole Firefoxis saadaval)` → `enne koodi kasutamist`
- `brauseri enda sünkroonimise kaudu (Chrome, Edge, Firefox)` → `Microsoft Edge'i sünkroonimise kaudu`
- `ka siis, kui brauser on taustal (Chrome, Edge, Whale).` → `ka siis, kui brauser on taustal.`
- `5 minuti pärast (pole Safaris).` → `5 minuti pärast.`
- 이 줄을 뺀다: `- Pääsuvõtmega lukuavamine ja seadmega kinnitamine pole Firefoxis saadaval. Safari versioon on ainult macOS-i jaoks.`
