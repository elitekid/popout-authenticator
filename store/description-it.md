# Scheda dello store — Italiano

## Nome (manifest appName, 1.0.1)
Popout Authenticator

## Riepilogo (manifest appDesc, massimo 132 caratteri)
Autenticatore 2FA per il tuo browser. Genera codici monouso e si apre come popup o finestra separata.

## Descrizione
(Incollare come testo semplice, senza **. Al massimo cinque nomi di prodotti di terzi, secondo le FAQ sullo spam del Chrome Web Store.)

Popout Authenticator mostra i codici monouso per l'autenticazione a due fattori (2FA) direttamente nel browser: nel popup della barra degli strumenti, in una finestra separata o nel pannello laterale. Genera codici TOTP e HOTP standard, è open source (MIT), non ha limiti al numero di account e non richiede registrazione né server.

**Passare da un altro autenticatore**
- Importa il file di backup dell'estensione Authenticator (authenticator.cc), anche i backup protetti da password.
- Compatibile con i codici QR di esportazione di Google Authenticator™.
- Importa i backup in chiaro di altre app di autenticazione e i file nel formato standard Credential Exchange (CXF). App supportate (in inglese): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- I backup crittografati di alcune app non si possono aprire qui. In questi casi esporta prima un backup in chiaro da quell'app.

**Aprilo dove ti serve**
- Usalo nel popup della barra degli strumenti, in una finestra separata o nel pannello laterale (barra laterale in Firefox).
- Ricerca, gruppi, account fissati e vista compatta mantengono in ordine anche gli elenchi lunghi.
- Mostra l'account del sito che stai visitando e ne inserisce il codice con un clic, con il tasto destro o con una scorciatoia da tastiera.
- Pulsanti facoltativi accanto ai campi del codice sui siti che scegli.

**Aggiungi gli account come preferisci**
- Scansiona un codice QR dalla scheda corrente, dalla fotocamera, da un'immagine o dagli appunti.
- Incolla link otpauth:// oppure digita la chiave segreta a mano.
- Supporta TOTP e HOTP con SHA-1, SHA-256 o SHA-512 e da 6 a 10 cifre, oltre a Steam (5 caratteri) e Battle.net (8 cifre).

**Privato e protetto**
- Gli account sono salvati sul tuo dispositivo in una cassaforte crittografata con AES-256-GCM. Imposta una password per proteggerne la chiave: senza password, la chiave resta sul dispositivo accanto ai dati.
- Blocca con password (Argon2id), codice di ripristino e sblocco facoltativo con passkey (non disponibile in Firefox). Scegli quando bloccarlo automaticamente.
- Puoi richiedere la verifica del dispositivo prima di usare un codice (non disponibile in Firefox) e nascondere i codici con una scorciatoia da tastiera a tua scelta.
- Niente analisi, niente pubblicità, nessun server dello sviluppatore. Il codice sorgente è pubblico.

**Non perdere l'accesso**
- Backup crittografati ed esportazione in testo otpauth, CXF e codici QR.
- Sincronizzazione tra i tuoi dispositivi tramite la sincronizzazione del browser (Chrome, Edge, Firefox), crittografata quando il blocco con password è attivo.
- Istantanee di ripristino, un cestino di 30 giorni e la cronologia delle modifiche di ogni account.
- Il controllo dell'orologio ti avvisa quando l'ora del computer farebbe fallire i codici.

**Condividi un codice, non il segreto**
- Invia un link che mostra solo i codici dei prossimi 5-60 minuti, con password facoltativa. Il link non contiene mai la chiave segreta.

**Buono a sapersi**
- Non esiste un backup cloud gestito dallo sviluppatore. I backup sono file che conservi tu; la sincronizzazione passa per quella del browser.
- Lo sblocco con passkey e la verifica del dispositivo non sono disponibili in Firefox. La versione per Safari è solo per macOS.

Disponibile in 20 lingue. Supporta i criteri gestiti per le organizzazioni.

Popout Authenticator è realizzato da uno sviluppatore indipendente. Si basa sul codice e sulle traduzioni con licenza MIT dell'estensione Authenticator (authenticator.cc) e non è affiliato ai suoi autori.

Google Authenticator è un marchio di Google LLC.

Informativa sulla privacy: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Codice sorgente: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `nel pannello laterale (barra laterale in Firefox)` → `nel pannello laterale`
- `sblocco facoltativo con passkey (non disponibile in Firefox)` → `sblocco facoltativo con passkey`
- `prima di usare un codice (non disponibile in Firefox)` → `prima di usare un codice`
- `tramite la sincronizzazione del browser (Chrome, Edge, Firefox)` → `tramite la sincronizzazione di Microsoft Edge`
- 이 줄을 뺀다: `- Lo sblocco con passkey e la verifica del dispositivo non sono disponibili in Firefox. La versione per Safari è solo per macOS.`
