# Áruházi adatlap — magyar

## Név (manifest appName, 1.0.1)
Popout Authenticator — 2FA- és OTP-kódok

## Összefoglaló (manifest appDesc, legfeljebb 132 karakter)
Nyílt forrású 2FA-hitelesítő: egyszeri kódok előugró ablakban, külön ablakban vagy oldalpanelen, jelszavas zárolással, importtal.

## Leírás
(Egyszerű szövegként illessze be: a ** jeleket hagyja el. Márkanév legfeljebb öt, a Chrome spam GYIK szerint.)

A Popout Authenticator közvetlenül a böngészőben mutatja a kétlépcsős azonosítás (2FA) egyszer használatos kódjait: az eszköztár előugró ablakában, külön ablakban vagy az oldalpanelen (Firefoxban az oldalsávon). Szabványos TOTP- és HOTP-kódokat állít elő, nyílt forrású (MIT), nincs fiókkorlát, és nem kell hozzá regisztráció vagy szerver.

**Áttérés másik hitelesítőről**
- Importálja az Authenticator bővítmény (authenticator.cc) mentésfájlját, a jelszóval védett mentéseket is.
- Kompatibilis a Google Authenticator™ exportálási QR-kódjaival.
- Importáljon titkosítatlan mentéseket más hitelesítő alkalmazásokból, valamint szabványos hitelesítőadat-csere (CXF) fájlokat. Támogatott alkalmazások: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Egyes alkalmazások jelszóval védett mentéseit a jelszavukkal nyithatja meg. Ha egy alkalmazás titkosított mentése itt nem nyitható meg, előbb exportáljon titkosítatlan mentést abban az alkalmazásban.

**Ott nyílik meg, ahol szüksége van rá**
- Használja az eszköztár előugró ablakát, egy külön ablakot vagy az oldalpanelen (Firefoxban az oldalsávon) futó nézetet.
- Kereshet mezőnként vagy több szóval, rendezhet A–Z sorrendben, és csoportokkal, fontos fiókokkal, ikonokkal és tömör nézettel tarthatja rendben a hosszú listákat.
- Láthatja, melyik fiók tartozik az éppen megnyitott webhelyhez, és egy kattintással, a jobb gombos menüből vagy billentyűparanccsal kitöltheti a kódját. Az oldalon bárhol jobb gombbal kattintva másolhatja a webhely kódját.
- Globális billentyűparancsok másolják az első három fontos fiók kódját, akkor is, ha a böngésző a háttérben van (Chrome, Edge, Whale).
- Választható gombok a kódmezők mellett az Ön által kiválasztott webhelyeken.
- Jelöljön ki több fiókot, és helyezze át őket egyszerre másik csoportba vagy a kukába, majd azonnal vonja vissza, ha kell. Egy teljes csoportot egyszerre átnevezhet vagy bonthat, és másolhatja egy fiók nevét.
- Saját képet használhat egy fiók ikonjaként. A kép ezen az eszközön marad.

**Fiókok hozzáadása többféleképpen**
- Olvasson be QR-kódot az aktuális lapról, egy másik alkalmazás ablakából, kamerával, képből vagy a vágólapról.
- Illesszen be otpauth:// linkeket, vagy írja be kézzel a titkos kulcsot.
- Támogatja a TOTP-t és a HOTP-t SHA-1, SHA-256 vagy SHA-512 algoritmussal, 6–10 számjeggyel, valamint a Steam (5 karakter) és a Battle.net (8 számjegy) kódokat.

**Adatvédelem és biztonság**
- A fiókok az Ön eszközén, AES-256-GCM titkosítású széfben tárolódnak. Állítson be jelszót a kulcs védelméhez: jelszó nélkül a kulcs az eszközön, az adatok mellett van.
- Zárolja jelszóval (Argon2id), helyreállítási kóddal és opcionális azonosítókulcsos feloldással (Firefoxban nem érhető el). Megadhatja, mikor zárolódjon automatikusan.
- Igény szerint eszközös ellenőrzést kérhet, mielőtt egy kódot használna (Firefoxban nem érhető el), és saját billentyűparanccsal elrejtheti a kódokat.
- Figyelmeztetést kap, mielőtt egy kódot olyan webhelyen használna, amelynek címe csak hasonlít a fiók webhelyéhez.
- A másolt kódok törölhetők a vágólapról 30 másodperc, 1, 2 vagy 5 perc után (Safariban nem).
- Nincs statisztika, nincs reklám, nincs fejlesztői szerver. A forráskód nyilvános.

**Mindig hozzáfér a fiókjaihoz**
- Titkosított biztonsági mentések, valamint exportálás otpauth szövegbe, CXF-be és QR-kódokba.
- Szinkronizálás az eszközei között a böngésző saját szinkronizálásával (Chrome, Edge, Firefox), titkosítva, ha a jelszavas zárolás be van kapcsolva.
- Helyreállítási pillanatképek, 30 napos kuka és fiókelőzmények.
- Az óra ellenőrzése figyelmeztet, ha a számítógép ideje miatt a kódok nem működnének.

**A kódot ossza meg, ne a titkos kulcsot**
- Küldjön egy linket, amely csak a következő 5–60 perc kódjait mutatja, opcionális jelszóval. A link soha nem tartalmazza a titkos kulcsot.

**Jó tudni**
- Nincs a fejlesztő által üzemeltetett felhőmentés. A biztonsági mentések az Ön által őrzött fájlok; a szinkronizálás a böngésző saját szinkronizálásán keresztül történik.
- Az azonosítókulcsos feloldás és az eszközös ellenőrzés Firefoxban nem érhető el. A Safari-verzió csak macOS-re készült.

43 nyelven érhető el. Támogatja a szervezetek által kezelt házirendeket.

A Popout Authenticatort független fejlesztő készíti. Az Authenticator bővítmény (authenticator.cc) MIT-licencű kódjára és fordításaira épül, de nem áll kapcsolatban annak szerzőivel.

A Google Authenticator a Google LLC védjegye.

Adatvédelmi irányelvek: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Forráskód: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `az oldalpanelen (Firefoxban az oldalsávon)` → `az oldalpanelen`
- `opcionális azonosítókulcsos feloldással (Firefoxban nem érhető el)` → `opcionális azonosítókulcsos feloldással`
- `mielőtt egy kódot használna (Firefoxban nem érhető el)` → `mielőtt egy kódot használna`
- `a böngésző saját szinkronizálásával (Chrome, Edge, Firefox)` → `a Microsoft Edge szinkronizálásával`
- `a háttérben van (Chrome, Edge, Whale).` → `a háttérben van.`
- `5 perc után (Safariban nem).` → `5 perc után.`
- 이 줄을 뺀다: `- Az azonosítókulcsos feloldás és az eszközös ellenőrzés Firefoxban nem érhető el. A Safari-verzió csak macOS-re készült.`
