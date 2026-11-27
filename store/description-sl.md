# Podatki za trgovino — slovenščina

## Ime (manifest appName, 1.0.1)
Popout Authenticator — Kode 2FA in OTP

## Povzetek (manifest appDesc, največ 132 znakov)
Odprtokodni avtentikator 2FA. Enkratne kode v pojavnem oknu, ločenem oknu ali stranski plošči, z zaklepom z geslom in uvozom kopij.

## Opis
(Prilepite kot navadno besedilo: odstranite oznake **. Imenovane blagovne znamke: največ pet, po pogostih vprašanjih Chrome o neželeni vsebini.)

Popout Authenticator prikazuje vaše enkratne kode za dvostopenjsko preverjanje (2FA) kar v brskalniku: v pojavnem oknu orodne vrstice, v ločenem oknu ali v stranski plošči. Ustvarja standardne kode TOTP in HOTP, je odprtokoden (MIT), nima omejitve števila računov ter ne potrebuje registracije ali strežnika.

**Selitev iz drugega avtentikatorja**
- Uvozite datoteko varnostne kopije razširitve Authenticator (authenticator.cc), tudi z geslom zaščitene varnostne kopije.
- Združljivo s kodami QR za izvoz iz Google Authenticator™.
- Uvozite nešifrirane varnostne kopije iz drugih aplikacij za preverjanje pristnosti ter standardne datoteke za izmenjavo poverilnic (CXF). Podprte aplikacije (v angleščini): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Z geslom zaščitene varnostne kopije nekaterih aplikacij odprete z njihovim geslom. Pri aplikacijah, katerih šifriranih varnostnih kopij tu ni mogoče odpreti, najprej v tisti aplikaciji izvozite nešifrirano varnostno kopijo.

**Odprite ga tam, kjer ga potrebujete**
- Uporabite pojavno okno orodne vrstice, ločeno okno ali stransko ploščo (v Firefoxu stransko vrstico).
- Iščite po poljih ali z več besedami, razvrstite od A do Ž ter uporabljajte skupine, pomembne račune, ikone in strnjen pogled, da ostanejo dolgi seznami pregledni.
- Vidite, kateri račun pripada spletnemu mestu, na katerem ste, in vnesite njegovo kodo z enim klikom, desnim klikom ali bližnjico na tipkovnici. Z desnim klikom kjer koli na strani kopirate kodo tega spletnega mesta.
- Globalne bližnjice kopirajo kode prvih treh pomembnih računov, tudi ko je brskalnik v ozadju (Chrome, Edge, Whale).
- Izbirni gumbi ob poljih za kodo na spletnih mestih, ki jih izberete.
- Izberite več računov hkrati in jih skupaj premaknite v drugo skupino ali v koš ter to takoj razveljavite. Celotno skupino naenkrat preimenujte ali razdružite in kopirajte ime računa.
- Kot ikono računa uporabite lastno sliko. Ostane v tej napravi.

**Dodajte račune po svoje**
- Skenirajte kodo QR iz trenutnega zavihka, okna druge aplikacije, kamere, slike ali odložišča.
- Prilepite povezave otpauth:// ali skrivni ključ vnesite ročno.
- Podpira TOTP in HOTP s SHA-1, SHA-256 ali SHA-512 ter 6 do 10 števk, poleg tega Steam (5 znakov) in Battle.net (8 števk).

**Zasebno in zaščiteno**
- Računi so shranjeni v vaši napravi v trezorju, šifriranem z AES-256-GCM. Za zaščito njegovega ključa nastavite geslo: brez gesla je ključ shranjen v napravi poleg podatkov.
- Zaklenite ga z geslom (Argon2id), obnovitveno kodo in izbirnim odklepanjem s ključem za dostop (ni na voljo v Firefoxu). Izberite, kdaj se samodejno zaklene.
- Po želji zahtevajte preverjanje z napravo, preden se koda uporabi (ni na voljo v Firefoxu), in skrijte kode z bližnjico na tipkovnici, ki jo določite sami.
- Prejmite opozorilo, preden se koda uporabi na spletnem mestu, katerega naslov je le podoben spletnemu mestu računa.
- Kopirane kode se lahko iz odložišča počistijo po 30 sekundah, 1, 2 ali 5 minutah (ne v Safariju).
- Brez analitike, brez oglasov, brez strežnika razvijalca. Izvorna koda je javna.

**Nikoli ne izgubite dostopa**
- Šifrirane varnostne kopije ter izvoz v besedilo otpauth, CXF in kode QR.
- Sinhronizacija med napravami prek lastne sinhronizacije brskalnika (Chrome, Edge, Firefox), šifrirana, ko je vklopljen zaklep z geslom.
- Posnetki za obnovitev, koš s 30-dnevnim hranjenjem in zgodovina sprememb računov.
- Preverjanje ure vas opozori, ko bi čas računalnika povzročil, da kode ne delujejo.

**Delite kodo, ne skrivnega ključa**
- Pošljite povezavo, ki prikazuje samo kode za naslednjih 5 do 60 minut, po želji z geslom. Povezava nikoli ne vsebuje skrivnega ključa.

**Dobro je vedeti**
- Ni varnostnega kopiranja v oblak, ki bi ga upravljal razvijalec. Varnostne kopije so datoteke, ki jih hranite sami; sinhronizacija poteka prek lastne sinhronizacije brskalnika.
- Odklepanje s ključem za dostop in preverjanje z napravo nista na voljo v Firefoxu. Različica za Safari je samo za macOS.

Na voljo v 43 jezikih. Podpira upravljane pravilnike za organizacije.

Popout Authenticator izdeluje neodvisni razvijalec. Temelji na kodi in prevodih razširitve Authenticator (authenticator.cc) z licenco MIT in ni povezan z njenimi avtorji.

Google Authenticator je blagovna znamka družbe Google LLC.

Pravilnik o zasebnosti: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Izvorna koda: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `stransko ploščo (v Firefoxu stransko vrstico).` → `stransko ploščo.`
- `odklepanjem s ključem za dostop (ni na voljo v Firefoxu).` → `odklepanjem s ključem za dostop.`
- `preden se koda uporabi (ni na voljo v Firefoxu),` → `preden se koda uporabi,`
- `prek lastne sinhronizacije brskalnika (Chrome, Edge, Firefox),` → `prek sinhronizacije Microsoft Edge,`
- `v ozadju (Chrome, Edge, Whale).` → `v ozadju.`
- `5 minutah (ne v Safariju).` → `5 minutah.`
- 이 줄을 뺀다: `- Odklepanje s ključem za dostop in preverjanje z napravo nista na voljo v Firefoxu. Različica za Safari je samo za macOS.`
