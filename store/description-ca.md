# Fitxa de la botiga — Català

## Nom (manifest appName, 1.0.1)
Popout Authenticator — Codis 2FA i OTP

## Resum (manifest appDesc, 132 caràcters com a màxim)
Autenticador 2FA de codi obert. Codis d'un sol ús en finestra emergent, finestra o tauler lateral, amb bloqueig i importació.

## Descripció
(Enganxeu-ho com a text pla: traieu les marques **. Marques esmentades: cinc com a màxim, segons les PMF de correu brossa de Chrome.)

Popout Authenticator mostra els codis d'un sol ús de l'autenticació en dos factors (2FA) directament al navegador: a la finestra emergent de la barra d'eines, en una finestra a part o al tauler lateral. Genera codis TOTP i HOTP estàndard, és de codi obert (MIT), no té límit de comptes i no necessita registre ni servidor.

**Si veniu d'un altre autenticador**
- Importeu el fitxer de còpia de seguretat de l'extensió Authenticator (authenticator.cc), incloses les còpies protegides amb contrasenya.
- Compatible amb els codis QR d'exportació de Google Authenticator™.
- Importeu còpies de seguretat en text pla d'altres aplicacions d'autenticació, i també fitxers estàndard d'intercanvi de credencials (CXF). Aplicacions compatibles: https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Obriu amb la seva contrasenya les còpies de seguretat protegides d'algunes aplicacions. Per a les aplicacions amb còpies xifrades que no es poden obrir aquí, primer exporteu una còpia en text pla des d'aquella aplicació.

**Obriu-lo on el necessiteu**
- Feu servir la finestra emergent de la barra d'eines, una finestra a part o el tauler lateral (barra lateral a Firefox).
- Cerqueu per camp o amb diverses paraules, ordeneu de l'A a la Z i feu servir grups, comptes importants, icones i una vista compacta per mantenir endreçades les llistes llargues.
- Vegeu quin compte correspon al lloc web on sou i empleneu-ne el codi amb un clic, amb el botó dret o amb una drecera de teclat. Feu clic amb el botó dret a qualsevol lloc d'una pàgina per copiar el codi d'aquell lloc web.
- Les dreceres globals copien els codis dels tres primers comptes importants, fins i tot amb el navegador en segon pla (Chrome, Edge, Whale).
- Botons opcionals al costat dels camps de codi als llocs web que trieu.
- Seleccioneu diversos comptes per moure'ls alhora a un altre grup o a la paperera, i desfeu-ho a l'instant. Canvieu el nom d'un grup sencer o desagrupeu-lo d'un cop, i copieu el nom d'un compte.
- Feu servir una imatge pròpia com a icona d'un compte. Es queda en aquest dispositiu.

**Afegiu comptes com vulgueu**
- Escanegeu un codi QR de la pestanya actual, de la finestra d'una altra aplicació, de la càmera, d'una imatge o del porta-retalls.
- Enganxeu enllaços otpauth:// o escriviu la clau secreta a mà.
- Admet TOTP i HOTP amb SHA-1, SHA-256 o SHA-512 i de 6 a 10 dígits, a més de Steam (5 caràcters) i Battle.net (8 dígits).

**Privat i protegit**
- Els comptes es desen al dispositiu en una caixa forta xifrada amb AES-256-GCM. Establiu una contrasenya per protegir-ne la clau: sense contrasenya, la clau es guarda al dispositiu al costat de les dades.
- Bloquegeu-lo amb una contrasenya (Argon2id), un codi de recuperació i, opcionalment, desbloqueig amb clau d'accés (no disponible a Firefox). Trieu quan es bloqueja automàticament.
- Opcionalment, demaneu la verificació del dispositiu abans de fer servir un codi (no disponible a Firefox), i amagueu els codis amb una drecera de teclat que assigneu.
- Rebeu un avís abans de fer servir un codi en un lloc web l'adreça del qual només s'assembla a la del lloc web del compte.
- Els codis copiats es poden esborrar del porta-retalls al cap de 30 segons, 1, 2 o 5 minuts (no disponible a Safari).
- Sense analítica, sense anuncis, sense servidor del desenvolupador. El codi font és públic.

**No perdeu mai l'accés**
- Còpies de seguretat xifrades, i exportació a text otpauth, CXF i codis QR.
- Sincronització entre els vostres dispositius mitjançant la sincronització del navegador (Chrome, Edge, Firefox), xifrada quan el bloqueig amb contrasenya està activat.
- Instantànies de recuperació, una paperera de 30 dies i un historial de canvis dels comptes.
- La comprovació del rellotge us avisa quan l'hora de l'ordinador faria fallar els codis.

**Compartiu un codi, no la clau secreta**
- Envieu un enllaç que només mostra els codis dels propers 5 a 60 minuts, amb una contrasenya opcional. L'enllaç mai no conté la clau secreta.

**Bo de saber**
- El desenvolupador no ofereix cap còpia de seguretat al núvol. Les còpies són fitxers que guardeu vosaltres; la sincronització passa per la sincronització del navegador.
- El desbloqueig amb clau d'accés i la verificació del dispositiu no estan disponibles a Firefox. La versió de Safari només és per a macOS.

Disponible en 43 idiomes. Admet polítiques gestionades per a organitzacions.

Popout Authenticator és obra d'un desenvolupador independent. Es basa en el codi i les traduccions amb llicència MIT de l'extensió Authenticator (authenticator.cc) i no té cap vincle amb els seus autors.

Google Authenticator és una marca comercial de Google LLC.

Política de privadesa: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Codi font: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `el tauler lateral (barra lateral a Firefox)` → `el tauler lateral`
- `desbloqueig amb clau d'accés (no disponible a Firefox)` → `desbloqueig amb clau d'accés`
- `abans de fer servir un codi (no disponible a Firefox)` → `abans de fer servir un codi`
- `mitjançant la sincronització del navegador (Chrome, Edge, Firefox)` → `mitjançant la sincronització de Microsoft Edge`
- `en segon pla (Chrome, Edge, Whale).` → `en segon pla.`
- `5 minuts (no disponible a Safari).` → `5 minuts.`
- 이 줄을 뺀다: `- El desbloqueig amb clau d'accés i la verificació del dispositiu no estan disponibles a Firefox. La versió de Safari només és per a macOS.`
