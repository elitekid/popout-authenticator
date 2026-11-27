# Parduotuvės aprašas — lietuvių

## Pavadinimas (manifest appName, 1.0.1)
Popout Authenticator — 2FA ir OTP kodai

## Santrauka (manifest appDesc, ne daugiau kaip 132 simboliai)
Atvirojo kodo 2FA autentifikatorius. Vienkartiniai kodai iššokančiajame lange ar šoniniame skydelyje, su užraktu ir kopijų importu.

## Aprašas
(Įklijuokite kaip paprastą tekstą: pašalinkite ** ženklus. Pagal Chrome šlamšto DUK minimi ne daugiau kaip penki prekių ženklai.)

Popout Authenticator rodo jūsų dviejų veiksnių autentifikavimo (2FA) vienkartinius kodus tiesiai naršyklėje: įrankių juostos iššokančiajame lange, atskirame lange arba šoniniame skydelyje. Jis generuoja standartinius TOTP ir HOTP kodus, yra atvirojo kodo (MIT), neriboja paskyrų skaičiaus ir nereikalauja nei registracijos, nei serverio.

**Perėjimas iš kito autentifikatoriaus**
- Importuokite Authenticator plėtinio (authenticator.cc) atsarginės kopijos failą, įskaitant slaptažodžiu apsaugotas atsargines kopijas.
- Suderinama su Google Authenticator™ eksporto QR kodais.
- Importuokite kitų autentifikatoriaus programų nešifruotas atsargines kopijas, taip pat standartinius prisijungimo duomenų mainų (CXF) failus. Palaikomos programos (anglų k.): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Kai kurių programų slaptažodžiu apsaugotas atsargines kopijas atidarykite su jų slaptažodžiu. Jei programos šifruotų atsarginių kopijų čia atidaryti negalima, pirmiausia toje programoje eksportuokite nešifruotą atsarginę kopiją.

**Atidarykite ten, kur reikia**
- Naudokite įrankių juostos iššokantįjį langą, atskirą langą arba šoninį skydelį (Firefox – šoninę juostą).
- Ieškokite pagal lauką ar keliais žodžiais, rikiuokite A–Z ir naudokite grupes, svarbias paskyras, piktogramas bei kompaktišką vaizdą, kad ilgi sąrašai būtų tvarkingi.
- Matykite, kuri paskyra priklauso atidarytai svetainei, ir įrašykite jos kodą vienu spustelėjimu, dešiniuoju pelės klavišu ar sparčiuoju klavišu. Spustelėkite dešiniuoju pelės klavišu bet kurioje puslapio vietoje, kad nukopijuotumėte tos svetainės kodą.
- Visuotiniai spartieji klavišai kopijuoja pirmųjų trijų svarbių paskyrų kodus, net kai naršyklė veikia fone (Chrome, Edge, Whale).
- Pasirinktinai – mygtukai šalia kodo laukų jūsų pasirinktose svetainėse.
- Pasirinkite kelias paskyras ir kartu perkelkite jas į kitą grupę ar į šiukšliadėžę, o prireikus iškart anuliuokite. Pervardykite ar išgrupuokite visą grupę iš karto ir kopijuokite paskyros pavadinimą.
- Naudokite savo vaizdą kaip paskyros piktogramą. Jis lieka šiame įrenginyje.

**Pridėkite paskyras savaip**
- Nuskaitykite QR kodą iš dabartinio skirtuko, kitos programos lango, kameros, vaizdo ar iškarpinės.
- Įklijuokite otpauth:// nuorodas arba įveskite slaptąjį raktą rankiniu būdu.
- Palaikomi TOTP ir HOTP su SHA-1, SHA-256 ar SHA-512 ir nuo 6 iki 10 skaitmenų, taip pat Steam (5 simboliai) ir Battle.net (8 skaitmenys).

**Privatu ir apsaugota**
- Paskyros saugomos jūsų įrenginyje, saugykloje, užšifruotoje AES-256-GCM. Nustatykite slaptažodį, kad apsaugotumėte jos raktą: be jo raktas laikomas įrenginyje šalia duomenų.
- Užrakinkite slaptažodžiu (Argon2id), atkūrimo kodu ir pasirinktiniu atrakinimu slaptarakčiu (Firefox nepalaikoma). Pasirinkite, kada užrakinti automatiškai.
- Pasirinktinai reikalaukite patvirtinimo įrenginiu prieš naudojant kodą (Firefox nepalaikoma) ir slėpkite kodus savo priskirtu sparčiuoju klavišu.
- Gaukite įspėjimą prieš naudojant kodą svetainėje, kurios adresas tik panašus į paskyros svetainės adresą.
- Nukopijuotus kodus galima išvalyti iš iškarpinės po 30 sekundžių, 1, 2 ar 5 minučių (Safari nepalaikoma).
- Jokios analitikos, jokių reklamų, jokio kūrėjo serverio. Programinis kodas viešas.

**Niekada nepraraskite prieigos**
- Šifruotos atsarginės kopijos, taip pat eksportas į otpauth tekstą, CXF ir QR kodus.
- Sinchronizavimas tarp jūsų įrenginių per pačios naršyklės sinchronizavimą (Chrome, Edge, Firefox), šifruotas, kai įjungtas slaptažodžio užraktas.
- Atkūrimo momentinės kopijos, 30 dienų šiukšliadėžė ir paskyrų pakeitimų istorija.
- Laikrodžio tikrinimas įspėja, kai dėl kompiuterio laiko kodai neveiktų.

**Bendrinkite kodą, o ne slaptąjį raktą**
- Siųskite nuorodą, kuri rodo tik artimiausių 5–60 minučių kodus, su pasirinktiniu slaptažodžiu. Nuorodoje niekada nėra slaptojo rakto.

**Naudinga žinoti**
- Kūrėjo valdomos debesies atsarginės kopijos nėra. Atsarginės kopijos yra jūsų laikomi failai; sinchronizuojama per pačios naršyklės sinchronizavimą.
- Atrakinimas slaptarakčiu ir patvirtinimas įrenginiu Firefox negalimi. Safari versija skirta tik macOS.

Prieinama 43 kalbomis. Palaikomos organizacijų valdomos strategijos.

Popout Authenticator kuria nepriklausomas kūrėjas. Jis remiasi MIT licencijos Authenticator plėtinio (authenticator.cc) kodu ir vertimais ir nėra susijęs su jo autoriais.

Google Authenticator yra Google LLC prekių ženklas.

Privatumo politika: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Programinis kodas: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `šoninį skydelį (Firefox – šoninę juostą)` → `šoninį skydelį`
- `atrakinimu slaptarakčiu (Firefox nepalaikoma)` → `atrakinimu slaptarakčiu`
- `prieš naudojant kodą (Firefox nepalaikoma)` → `prieš naudojant kodą`
- `per pačios naršyklės sinchronizavimą (Chrome, Edge, Firefox)` → `per Microsoft Edge sinchronizavimą`
- `veikia fone (Chrome, Edge, Whale).` → `veikia fone.`
- `5 minučių (Safari nepalaikoma).` → `5 minučių.`
- 이 줄을 뺀다: `- Atrakinimas slaptarakčiu ir patvirtinimas įrenginiu Firefox negalimi. Safari versija skirta tik macOS.`
