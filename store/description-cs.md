# Informace v obchodě — čeština

## Název (manifest appName, 1.0.1)
Popout Authenticator — kódy 2FA a OTP

## Shrnutí (manifest appDesc, max. 132 znaků)
Open-source ověřovač 2FA. Jednorázové kódy ve vyskakovacím okně, samostatném okně či postranním panelu, se zámkem a importem záloh.

## Popis
(Vložte jako prostý text: odstraňte značky **. Uvedené značky: nejvýše pět, podle FAQ Chrome ke spamu.)

Popout Authenticator zobrazuje jednorázové kódy dvoufázového ověření (2FA) přímo v prohlížeči: ve vyskakovacím okně na liště, v samostatném okně nebo v postranním panelu. Generuje standardní kódy TOTP a HOTP, je open source (MIT), nemá žádné limity počtu účtů a nevyžaduje registraci ani server.

**Přechod z jiného ověřovače**
- Import souboru zálohy rozšíření Authenticator (authenticator.cc), včetně záloh chráněných heslem.
- Kompatibilní s exportními QR kódy aplikace Google Authenticator™.
- Import záloh v prostém textu z jiných ověřovacích aplikací a také standardních souborů pro výměnu přihlašovacích údajů (CXF). Podporované aplikace: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Zálohy některých aplikací chráněné heslem otevřete jejich heslem. U aplikací, jejichž šifrované zálohy zde otevřít nelze, nejprve v dané aplikaci exportujte zálohu v prostém textu.

**Otevřete ho tam, kde ho potřebujete**
- Používejte vyskakovací okno na liště, samostatné okno nebo postranní panel (ve Firefoxu boční lištu).
- Hledejte podle pole nebo více slovy, řaďte A–Z a používejte skupiny, připnuté účty, ikony a kompaktní zobrazení, aby i dlouhé seznamy zůstaly přehledné.
- Uvidíte, který účet patří k webu, na kterém jste, a jeho kód vyplníte jedním kliknutím, z místní nabídky nebo klávesovou zkratkou. Kliknutím pravým tlačítkem kdekoli na stránce zkopírujete kód daného webu.
- Globální zkratky kopírují kódy prvních tří důležitých účtů, i když je prohlížeč na pozadí (Chrome, Edge, Whale).
- Volitelná tlačítka vedle polí pro kód na webech, které si zvolíte.
- Vyberte více účtů a přesuňte je najednou do jiné skupiny nebo do koše a hned to vraťte zpět. Přejmenujte nebo zrušte celou skupinu najednou a zkopírujte název účtu.
- Použijte jako ikonu účtu vlastní obrázek. Zůstane v tomto zařízení.

**Přidávejte účty po svém**
- Naskenujte QR kód z aktuální karty, okna jiné aplikace, kamery, obrázku nebo schránky.
- Vložte odkazy otpauth:// nebo zadejte tajný klíč ručně.
- Podporuje TOTP a HOTP se SHA-1, SHA-256 nebo SHA-512 a 6 až 10 číslicemi, a také Steam (5 znaků) a Battle.net (8 číslic).

**Soukromé a chráněné**
- Účty se ukládají ve vašem zařízení v trezoru šifrovaném pomocí AES-256-GCM. Nastavte heslo, které ochrání jeho klíč: bez něj je klíč uložen v zařízení vedle dat.
- Zamkněte ho heslem (Argon2id), obnovovacím kódem a volitelným odemykáním přístupovým klíčem (není dostupné ve Firefoxu). Zvolte, kdy se má automaticky zamknout.
- Volitelně vyžadujte ověření zařízením před použitím kódu (není dostupné ve Firefoxu) a skrývejte kódy klávesovou zkratkou, kterou si přiřadíte.
- Před použitím kódu na webu, jehož adresa se jen podobá webu účtu, se zobrazí varování.
- Zkopírované kódy lze ze schránky vymazat po 30 sekundách, 1, 2 nebo 5 minutách (ne v Safari).
- Žádná analytika, žádné reklamy, žádný server vývojáře. Zdrojový kód je veřejný.

**Přístup nikdy neztratíte**
- Šifrované zálohy a také export do textu otpauth, CXF a QR kódů.
- Synchronizace mezi zařízeními přes vlastní synchronizaci prohlížeče (Chrome, Edge, Firefox), šifrovaná při zapnutém zámku heslem.
- Snímky pro obnovení, koš na 30 dní a historie změn účtu.
- Kontrola hodin vás upozorní, když by kvůli času v počítači kódy nefungovaly.

**Sdílejte kód, ne tajný klíč**
- Pošlete odkaz, který zobrazuje jen kódy na příštích 5 až 60 minut, volitelně s heslem. Odkaz nikdy neobsahuje tajný klíč.

**Dobré vědět**
- Neexistuje žádná cloudová záloha provozovaná vývojářem. Zálohy jsou soubory, které si uchováváte sami; synchronizace probíhá přes vlastní synchronizaci prohlížeče.
- Odemykání přístupovým klíčem a ověření zařízením nejsou ve Firefoxu dostupné. Verze pro Safari je jen pro macOS.

K dispozici ve 43 jazycích. Podporuje spravované zásady pro organizace.

Popout Authenticator vytváří nezávislý vývojář. Vychází z kódu a překladů rozšíření Authenticator (authenticator.cc) pod licencí MIT a není spojen s jeho autory.

Google Authenticator je ochranná známka společnosti Google LLC.

Zásady ochrany soukromí: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Zdrojový kód: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `postranní panel (ve Firefoxu boční lištu).` → `postranní panel.`
- `přístupovým klíčem (není dostupné ve Firefoxu).` → `přístupovým klíčem.`
- `před použitím kódu (není dostupné ve Firefoxu)` → `před použitím kódu`
- `přes vlastní synchronizaci prohlížeče (Chrome, Edge, Firefox),` → `přes synchronizaci Microsoft Edge,`
- `na pozadí (Chrome, Edge, Whale).` → `na pozadí.`
- `5 minutách (ne v Safari).` → `5 minutách.`
- 이 줄을 뺀다: `- Odemykání přístupovým klíčem a ověření zařízením nejsou ve Firefoxu dostupné. Verze pro Safari je jen pro macOS.`
