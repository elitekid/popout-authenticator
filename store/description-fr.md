# Fiche de la boutique — Français

## Nom (manifest appName, 1.0.1)
Popout Authenticator — codes 2FA et OTP

## Résumé (manifest appDesc, 132 caractères au plus)
Authentificateur 2FA open source. Codes à usage unique en pop-up, fenêtre ou panneau latéral, avec verrou par mot de passe.

## Description
(Coller en texte brut, sans les **. Cinq noms d’autres produits au plus, selon la FAQ sur le spam du Chrome Web Store.)

Popout Authenticator affiche vos codes à usage unique d’authentification à deux facteurs (2FA) directement dans le navigateur : dans le pop-up de la barre d’outils, dans une fenêtre séparée ou dans le panneau latéral. Il génère des codes TOTP et HOTP standard, il est open source (MIT), ne limite pas le nombre de comptes et ne demande ni inscription ni serveur.

**Venir d’un autre authentificateur**
- Importe le fichier de sauvegarde de l’extension Authenticator (authenticator.cc), y compris les sauvegardes protégées par mot de passe.
- Compatible avec les codes QR d’exportation de Google Authenticator™.
- Importe les sauvegardes en clair d’autres applications d’authentification, ainsi que les fichiers au format standard d’échange d’identifiants (CXF). Applications prises en charge (en anglais) : https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Les sauvegardes chiffrées de certaines applications ne peuvent pas être ouvertes ici. Dans ce cas, exportez d’abord une sauvegarde en clair depuis cette application.

**Ouvrez-le là où vous en avez besoin**
- Utilisez-le dans le pop-up de la barre d’outils, dans une fenêtre séparée ou dans le panneau latéral (barre latérale dans Firefox).
- Recherche, groupes, comptes épinglés et affichage compact gardent les longues listes en ordre.
- Le compte du site ouvert est proposé en premier ; son code se remplit d’un clic, par clic droit ou avec un raccourci clavier.
- Boutons facultatifs à côté des champs de code sur les sites que vous choisissez.

**Ajoutez des comptes comme vous voulez**
- Scannez un code QR depuis l’onglet actuel, la caméra, une image ou le presse-papiers.
- Collez des liens otpauth:// ou saisissez la clé secrète à la main.
- Prend en charge TOTP et HOTP avec SHA-1, SHA-256 ou SHA-512, de 6 à 10 chiffres, ainsi que Steam (5 caractères) et Battle.net (8 chiffres).

**Privé et protégé**
- Les comptes sont stockés sur votre appareil dans un coffre chiffré avec AES-256-GCM. Définissez un mot de passe pour protéger sa clé : sans mot de passe, la clé est conservée sur l’appareil à côté des données.
- Verrouillez-le avec un mot de passe (Argon2id), un code de récupération et, si vous le souhaitez, un déverrouillage par clé d’accès (indisponible dans Firefox). Choisissez quand il se verrouille automatiquement.
- Vous pouvez exiger une vérification de l’appareil avant l’utilisation d’un code (indisponible dans Firefox) et masquer les codes avec un raccourci que vous définissez.
- Pas d’analyse, pas de publicité, pas de serveur du développeur. Le code source est public.

**Ne perdez pas l’accès**
- Sauvegardes chiffrées et export en texte otpauth, CXF et codes QR.
- Synchronisation entre vos appareils grâce à la synchronisation du navigateur (Chrome, Edge, Firefox), chiffrée quand le verrou par mot de passe est activé.
- Instantanés de récupération, corbeille de 30 jours et historique des modifications de chaque compte.
- La vérification de l’horloge prévient quand l’heure de l’ordinateur ferait échouer les codes.

**Partagez un code, pas le secret**
- Envoyez un lien qui n’affiche que les codes des 5 à 60 prochaines minutes, avec un mot de passe facultatif. Le lien ne contient jamais la clé secrète.

**Bon à savoir**
- Il n’y a pas de sauvegarde dans le cloud gérée par le développeur. Les sauvegardes sont des fichiers que vous conservez ; la synchronisation passe par celle du navigateur.
- Le déverrouillage par clé d’accès et la vérification de l’appareil ne sont pas disponibles dans Firefox. La version Safari est réservée à macOS.

Disponible en 20 langues. Prend en charge les stratégies gérées pour les organisations.

Popout Authenticator est réalisé par un développeur indépendant. Il s’appuie sur le code et les traductions sous licence MIT de l’extension Authenticator (authenticator.cc) et n’a aucun lien avec ses auteurs.

Google Authenticator est une marque de Google LLC.

Politique de confidentialité : https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Code source : https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `dans le panneau latéral (barre latérale dans Firefox)` → `dans le panneau latéral`
- `un déverrouillage par clé d’accès (indisponible dans Firefox)` → `un déverrouillage par clé d’accès`
- `avant l’utilisation d’un code (indisponible dans Firefox)` → `avant l’utilisation d’un code`
- `grâce à la synchronisation du navigateur (Chrome, Edge, Firefox),` → `grâce à la synchronisation de Microsoft Edge,`
- 이 줄을 뺀다: `- Le déverrouillage par clé d’accès et la vérification de l’appareil ne sont pas disponibles dans Firefox. La version Safari est réservée à macOS.`
