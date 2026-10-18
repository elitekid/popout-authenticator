# Ficha de la tienda — Español

## Nombre (manifest appName, 1.0.1)
Popout Authenticator — autenticador 2FA

## Resumen (manifest appDesc, 132 caracteres como máximo)
Autenticador 2FA de código abierto. Códigos de un solo uso en ventana emergente, aparte o panel lateral, con bloqueo por contraseña.

## Descripción
(Pegar como texto sin formato, sin los **. Como máximo cinco nombres de otros productos, según las preguntas frecuentes sobre spam de Chrome Web Store.)

Popout Authenticator muestra sus códigos de un solo uso de autenticación en dos pasos (2FA) directamente en el navegador: en la ventana emergente de la barra de herramientas, en una ventana aparte o en el panel lateral. Genera códigos TOTP y HOTP estándar, es de código abierto (MIT), no limita el número de cuentas y no necesita registro ni servidor.

**Cambiar desde otro autenticador**
- Importa el archivo de copia de seguridad de la extensión Authenticator (authenticator.cc), también las copias protegidas con contraseña.
- Compatible con los códigos QR de exportación de Google Authenticator™.
- Importa copias de seguridad sin cifrar de otras aplicaciones de autenticación, además de archivos del formato estándar de intercambio de credenciales (CXF). Aplicaciones compatibles (en inglés): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Las copias cifradas de algunas aplicaciones no se pueden abrir aquí. En ese caso, exporte primero una copia sin cifrar desde esa aplicación.

**Ábralo donde lo necesite**
- Úselo en la ventana emergente de la barra de herramientas, en una ventana aparte o en el panel lateral (barra lateral en Firefox).
- La búsqueda, los grupos, las cuentas fijadas y la vista compacta mantienen ordenadas las listas largas.
- Muestra primero la cuenta del sitio en el que está y rellena su código con un clic, con el menú contextual o con un atajo de teclado.
- Botones opcionales junto a los campos de código en los sitios que usted elija.

**Añada cuentas como prefiera**
- Escanee un código QR de la pestaña actual, de la cámara, de una imagen o del portapapeles.
- Pegue enlaces otpauth:// o escriba la clave secreta a mano.
- Admite TOTP y HOTP con SHA-1, SHA-256 o SHA-512 y de 6 a 10 dígitos, además de Steam (5 caracteres) y Battle.net (8 dígitos).

**Privado y protegido**
- Las cuentas se guardan en su equipo en una bóveda cifrada con AES-256-GCM. Defina una contraseña para proteger su clave: sin contraseña, la clave se guarda en el equipo junto a los datos.
- Bloquéela con una contraseña (Argon2id), un código de recuperación y, si quiere, desbloqueo con clave de acceso (no disponible en Firefox). Elija cuándo se bloquea automáticamente.
- Si quiere, pida una verificación del dispositivo antes de usar un código (no disponible en Firefox) y oculte los códigos con un atajo que usted asigne.
- Sin analítica, sin anuncios, sin servidor del desarrollador. El código fuente es público.

**No pierda el acceso**
- Copias de seguridad cifradas y exportación a texto otpauth, CXF y códigos QR.
- Sincronización entre sus dispositivos mediante la sincronización del propio navegador (Chrome, Edge, Firefox), cifrada cuando el bloqueo por contraseña está activado.
- Instantáneas de recuperación, una papelera de 30 días y un historial de cambios de cada cuenta.
- La comprobación del reloj avisa cuando la hora del equipo haría fallar los códigos.

**Comparta un código, no la clave**
- Envíe un enlace que muestra solo los códigos de los próximos 5 a 60 minutos, con contraseña opcional. El enlace nunca contiene la clave secreta.

**Conviene saber**
- No hay copia de seguridad en la nube gestionada por el desarrollador. Las copias son archivos que usted guarda; la sincronización usa la del propio navegador.
- El desbloqueo con clave de acceso y la verificación del dispositivo no están disponibles en Firefox. La versión para Safari es solo para macOS.

Disponible en 20 idiomas. Admite directivas administradas para organizaciones.

Popout Authenticator lo crea un desarrollador independiente. Se basa en el código y las traducciones con licencia MIT de la extensión Authenticator (authenticator.cc) y no tiene relación con sus autores.

Google Authenticator es una marca de Google LLC.

Política de privacidad: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Código fuente: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `en el panel lateral (barra lateral en Firefox)` → `en el panel lateral`
- `desbloqueo con clave de acceso (no disponible en Firefox)` → `desbloqueo con clave de acceso`
- `antes de usar un código (no disponible en Firefox)` → `antes de usar un código`
- `mediante la sincronización del propio navegador (Chrome, Edge, Firefox),` → `mediante la sincronización de Microsoft Edge,`
- 이 줄을 뺀다: `- El desbloqueo con clave de acceso y la verificación del dispositivo no están disponibles en Firefox. La versión para Safari es solo para macOS.`
