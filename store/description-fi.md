# Kaupan tiedot — suomi

## Nimi (manifest appName, 1.0.1)
Popout Authenticator — 2FA- ja OTP-koodit

## Yhteenveto (manifest appDesc, enintään 132 merkkiä)
Avoimen lähdekoodin 2FA-todennussovellus. Kertakoodit ponnahdusikkunassa, ikkunassa tai sivupaneelissa, salasanalukitus ja tuonti.

## Kuvaus
(Liitä pelkkänä tekstinä: poista **-merkit. Tuotemerkkejä enintään viisi Chromen roskapostia koskevien usein kysyttyjen kysymysten mukaisesti.)

Popout Authenticator näyttää kaksivaiheisen todennuksen (2FA) kertakoodisi suoraan selaimessa: työkalupalkin ponnahdusikkunassa, erillisessä ikkunassa tai sivupaneelissa. Se luo standardinmukaisia TOTP- ja HOTP-koodeja, on avointa lähdekoodia (MIT), ei rajoita tilien määrää eikä vaadi rekisteröitymistä tai palvelinta.

**Siirtyminen toisesta todennussovelluksesta**
- Tuo Authenticator-laajennuksen (authenticator.cc) varmuuskopiotiedosto, myös salasanalla suojattu.
- Yhteensopiva Google Authenticator™ -sovelluksen vienti-QR-koodien kanssa.
- Tuo muiden todennussovellusten tekstimuotoisia varmuuskopioita sekä standardinmukaisia tunnistetietojen vaihtotiedostoja (CXF). Tuetut sovellukset (englanniksi): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Avaa joidenkin sovellusten salasanalla suojatut varmuuskopiot niiden salasanalla. Jos sovelluksen salattua varmuuskopiota ei voi avata täällä, vie ensin tekstimuotoinen varmuuskopio kyseisessä sovelluksessa.

**Avaa siellä, missä tarvitset**
- Käytä työkalupalkin ponnahdusikkunaa, erillistä ikkunaa tai sivupaneelia (Firefoxissa sivupalkki).
- Hae kentän mukaan tai usealla sanalla, lajittele A–Ö ja pidä pitkät luettelot siisteinä ryhmillä, tärkeillä tileillä, kuvakkeilla ja tiiviillä näkymällä.
- Näe, mikä tili kuuluu avoinna olevaan sivustoon, ja täytä sen koodi yhdellä napsautuksella, hiiren oikealla painikkeella tai pikanäppäimellä. Napsauta mitä tahansa sivun kohtaa hiiren oikealla painikkeella, niin voit kopioida sivuston koodin.
- Yleiset pikanäppäimet kopioivat kolmen ensimmäisen tärkeän tilisi koodit myös selaimen ollessa taustalla (Chrome, Edge, Whale).
- Valinnaiset painikkeet koodikenttien vieressä valitsemillasi sivustoilla.
- Valitse useita tilejä ja siirrä ne yhdessä toiseen ryhmään tai roskakoriin, ja kumoa siirto heti. Nimeä koko ryhmä uudelleen tai pura se kerralla ja kopioi tilin nimi.
- Käytä omaa kuvaa tilin kuvakkeena. Se pysyy tässä laitteessa.

**Lisää tilejä haluamallasi tavalla**
- Skannaa QR-koodi nykyiseltä välilehdeltä, toisen sovelluksen ikkunasta, kameralla, kuvasta tai leikepöydältä.
- Liitä otpauth://-linkkejä tai kirjoita salainen avain käsin.
- Tukee TOTP- ja HOTP-koodeja algoritmeilla SHA-1, SHA-256 ja SHA-512 sekä 6–10 numeron pituisina, lisäksi Steam (5 merkkiä) ja Battle.net (8 numeroa).

**Yksityinen ja suojattu**
- Tilit tallennetaan laitteellesi holviin, joka on salattu AES-256-GCM-salauksella. Aseta salasana suojaamaan holvin avainta: ilman salasanaa avain säilytetään laitteessa tietojen vieressä.
- Lukitse salasanalla (Argon2id), palautuskoodilla ja valinnaisella pääsyavainavauksella (ei Firefoxissa). Valitse, milloin holvi lukittuu automaattisesti.
- Vaadi halutessasi laitevahvistus ennen koodin käyttöä (ei Firefoxissa) ja piilota koodit itse määrittämälläsi pikanäppäimellä.
- Saat varoituksen, ennen kuin koodia käytetään sivustolla, jonka osoite vain näyttää tilin sivustolta.
- Kopioidut koodit voidaan tyhjentää leikepöydältä 30 sekunnin tai 1, 2 tai 5 minuutin kuluttua (ei Safarissa).
- Ei analytiikkaa, ei mainoksia, ei kehittäjän palvelinta. Lähdekoodi on julkinen.

**Älä koskaan menetä pääsyä**
- Salatut varmuuskopiot sekä vienti otpauth-tekstiksi, CXF-muotoon ja QR-koodeiksi.
- Synkronointi laitteidesi välillä selaimen omalla synkronoinnilla (Chrome, Edge, Firefox), salattuna, kun salasanalukitus on käytössä.
- Palautuksen tilannevedokset, 30 päivän roskakori ja tilien muutoshistoria.
- Kellon tarkistus varoittaa, jos tietokoneesi aika saisi koodit epäonnistumaan.

**Jaa koodi, älä salaista avainta**
- Lähetä linkki, joka näyttää vain seuraavien 5–60 minuutin koodit, halutessasi salasanalla suojattuna. Linkki ei koskaan sisällä salaista avainta.

**Hyvä tietää**
- Kehittäjä ei ylläpidä pilvivarmuuskopiota. Varmuuskopiot ovat itse säilyttämiäsi tiedostoja, ja synkronointi kulkee selaimen oman synkronoinnin kautta.
- Pääsyavainavaus ja laitevahvistus eivät ole käytettävissä Firefoxissa. Safari-versio on vain macOS:lle.

Saatavilla 43 kielellä. Tukee organisaatioiden hallinnoituja käytäntöjä.

Popout Authenticator on itsenäisen kehittäjän tekemä. Se perustuu Authenticator-laajennuksen (authenticator.cc) MIT-lisensoituun koodiin ja käännöksiin, eikä se ole sidoksissa sen tekijöihin.

Google Authenticator on Google LLC:n tavaramerkki.

Tietosuojakäytäntö: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Lähdekoodi: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `sivupaneelia (Firefoxissa sivupalkki)` → `sivupaneelia`
- `ja valinnaisella pääsyavainavauksella (ei Firefoxissa)` → `ja valinnaisella pääsyavainavauksella`
- `ennen koodin käyttöä (ei Firefoxissa)` → `ennen koodin käyttöä`
- `selaimen omalla synkronoinnilla (Chrome, Edge, Firefox)` → `Microsoft Edge -synkronoinnilla`
- `taustalla (Chrome, Edge, Whale).` → `taustalla.`
- `5 minuutin kuluttua (ei Safarissa).` → `5 minuutin kuluttua.`
- 이 줄을 뺀다: `- Pääsyavainavaus ja laitevahvistus eivät ole käytettävissä Firefoxissa. Safari-versio on vain macOS:lle.`
