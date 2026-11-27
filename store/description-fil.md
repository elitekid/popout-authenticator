# Listing sa store — Filipino

## Pangalan (manifest appName, 1.0.1)
Popout Authenticator — Mga 2FA at OTP Code

## Buod (manifest appDesc, hanggang 132 character)
Open-source na 2FA authenticator. Mga one-time code sa popup, window o side panel, may password lock at pag-import ng backup.

## Paglalarawan
(I-paste bilang plain text: alisin ang mga markang **. Mga brand na binanggit: hanggang lima lang, ayon sa Chrome spam FAQ.)

Ipinapakita ng Popout Authenticator ang iyong mga two-factor (2FA) one-time code mismo sa browser: sa popup ng toolbar, sa hiwalay na window, o sa side panel. Gumagawa ito ng karaniwang TOTP at HOTP code, open source (MIT), walang limitasyon sa dami ng account, at hindi kailangan ng pag-sign up o server.

**Paglipat mula sa ibang authenticator**
- Mag-import ng backup file ng Authenticator extension (authenticator.cc), kasama ang mga backup na may password.
- Compatible sa mga export QR code ng Google Authenticator™.
- Mag-import ng plain-text na backup mula sa ibang authenticator app, pati ng mga karaniwang credential exchange (CXF) file. Mga sinusuportahang app (sa English): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Buksan ang mga backup na may password ng ilang app gamit ang kanilang password. Para sa mga app na hindi mabuksan dito ang naka-encrypt na backup, mag-export muna ng plain-text na backup sa app na iyon.

**Buksan kung saan mo kailangan**
- Gamitin ang popup ng toolbar, hiwalay na window, o ang side panel (sidebar sa Firefox).
- Maghanap ayon sa field o gamit ang ilang salita, ayusin nang A–Z, at gumamit ng mga grupo, mahahalagang account, icon, at compact view para manatiling maayos ang mahahabang listahan.
- Tingnan kung aling account ang para sa site na kinaroroonan mo, at punan ang code nito sa isang click, right-click, o keyboard shortcut. Mag-right-click kahit saan sa page para kopyahin ang code ng site na iyon.
- Kinokopya ng mga global shortcut ang code ng iyong unang tatlong mahahalagang account, kahit nasa background ang browser (Chrome, Edge, Whale).
- Opsyonal na button sa tabi ng mga field ng code sa mga site na pipiliin mo.
- Pumili ng ilang account para ilipat nang sabay-sabay sa ibang grupo o sa trash, at i-undo ito agad. Palitan ang pangalan o i-ungroup ang buong grupo nang sabay, at kopyahin ang pangalan ng account.
- Gamitin ang sarili mong larawan bilang icon ng account. Nananatili ito sa device na ito.

**Magdagdag ng account sa paraang gusto mo**
- Mag-scan ng QR code mula sa kasalukuyang tab, window ng ibang app, iyong camera, isang larawan, o ang clipboard.
- Mag-paste ng mga otpauth:// link, o i-type nang mano-mano ang secret key.
- Sinusuportahan ang TOTP at HOTP na may SHA-1, SHA-256, o SHA-512 at 6 hanggang 10 digit, pati ang Steam (5 character) at Battle.net (8 digit).

**Pribado at protektado**
- Naka-save ang mga account sa iyong device sa isang vault na naka-encrypt gamit ang AES-256-GCM. Magtakda ng password para protektahan ang key nito: kung wala, nakatago ang key sa device katabi ng data.
- I-lock ito gamit ang password (Argon2id), recovery code, at opsyonal na pag-unlock gamit ang passkey (hindi available sa Firefox). Piliin kung kailan ito awtomatikong mala-lock.
- Opsyonal na humingi ng pag-verify ng device bago gamitin ang code (hindi available sa Firefox), at itago ang mga code gamit ang keyboard shortcut na itinakda mo.
- Makatanggap ng babala bago gamitin ang code sa site na ang address ay kamukha lang ng site ng account.
- Maaaring i-clear mula sa clipboard ang mga kinopyang code pagkalipas ng 30 segundo, 1, 2, o 5 minuto (hindi sa Safari).
- Walang analytics, walang ad, walang server ng developer. Pampubliko ang source code.

**Hindi mawawalan ng access**
- Mga naka-encrypt na backup, pati pag-export sa otpauth text, CXF, at QR code.
- Mag-sync sa pagitan ng iyong mga device sa pamamagitan ng sariling sync ng iyong browser (Chrome, Edge, Firefox), naka-encrypt kapag naka-on ang password lock.
- Mga recovery snapshot, 30 araw na trash, at history ng pagbabago ng account.
- Binabalaan ka ng pagsuri ng orasan kapag maaaring pumalya ang mga code dahil sa oras ng iyong computer.

**Ibahagi ang code, hindi ang secret key**
- Magpadala ng link na nagpapakita lang ng mga code para sa susunod na 5 hanggang 60 minuto, may opsyonal na password. Hindi kailanman naglalaman ng secret key ang link.

**Dapat malaman**
- Walang cloud backup na pinapatakbo ng developer. Mga file na ikaw ang nagtatago ang mga backup; dumadaan ang sync sa sariling sync ng iyong browser.
- Hindi available sa Firefox ang pag-unlock gamit ang passkey at ang pag-verify ng device. Para sa macOS lang ang bersyon para sa Safari.

Available sa 43 wika. Sinusuportahan ang mga pinamamahalaang patakaran para sa mga organisasyon.

Gawa ang Popout Authenticator ng isang independiyenteng developer. Nakabatay ito sa code at mga pagsasalin ng Authenticator extension (authenticator.cc) na may lisensyang MIT at hindi ito kaanib ng mga gumawa nito.

Ang Google Authenticator ay trademark ng Google LLC.

Patakaran sa privacy: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Source code: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `ang side panel (sidebar sa Firefox)` → `ang side panel`
- `at opsyonal na pag-unlock gamit ang passkey (hindi available sa Firefox)` → `at opsyonal na pag-unlock gamit ang passkey`
- `bago gamitin ang code (hindi available sa Firefox)` → `bago gamitin ang code`
- `sa pamamagitan ng sariling sync ng iyong browser (Chrome, Edge, Firefox)` → `sa pamamagitan ng Microsoft Edge sync`
- `nasa background ang browser (Chrome, Edge, Whale).` → `nasa background ang browser.`
- `5 minuto (hindi sa Safari).` → `5 minuto.`
- 이 줄을 뺀다: `- Hindi available sa Firefox ang pag-unlock gamit ang passkey at ang pag-verify ng device. Para sa macOS lang ang bersyon para sa Safari.`
