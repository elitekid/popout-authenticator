# Wpis w sklepie — Polski

## Nazwa (manifest appName, 1.0.1)
Popout Authenticator

## Podsumowanie (manifest appDesc, maksymalnie 132 znaki)
Uwierzytelniacz 2FA w przeglądarce. Generuje kody jednorazowe, otwiera się jako okienko lub osobne okno.

## Opis
(Wklej jako zwykły tekst, bez **. Najwyżej pięć nazw cudzych produktów, zgodnie z FAQ o spamie w Chrome Web Store.)

Popout Authenticator wyświetla jednorazowe kody uwierzytelniania dwuskładnikowego (2FA) bezpośrednio w przeglądarce: w okienku na pasku narzędzi, w osobnym oknie lub w panelu bocznym. Generuje standardowe kody TOTP i HOTP, ma otwarty kod źródłowy (MIT), nie ma limitu kont i nie wymaga rejestracji ani serwera.

**Przejście z innego uwierzytelniacza**
- Importuj plik kopii zapasowej rozszerzenia Authenticator (authenticator.cc), także kopie chronione hasłem.
- Zgodny z kodami QR eksportu z Google Authenticator™.
- Importuj niezaszyfrowane kopie zapasowe z innych aplikacji uwierzytelniających oraz pliki w standardowym formacie Credential Exchange (CXF). Obsługiwane aplikacje (po angielsku): https://elitekid.github.io/popout-authenticator/guides/from-authy-and-other-apps/
- Zaszyfrowanych kopii niektórych aplikacji nie da się tu otworzyć. W takim przypadku najpierw wyeksportuj z tej aplikacji niezaszyfrowaną kopię.

**Otwieraj tam, gdzie potrzebujesz**
- Korzystaj z okienka na pasku narzędzi, osobnego okna lub panelu bocznego (pasek boczny w Firefoksie).
- Wyszukiwanie, grupy, przypięte konta i widok kompaktowy porządkują nawet długie listy.
- Widać, które konto pasuje do otwartej strony, a jego kod wpiszesz jednym kliknięciem, prawym przyciskiem myszy lub skrótem klawiszowym.
- Opcjonalne przyciski obok pól na kod na wybranych przez Ciebie stronach.

**Dodawaj konta po swojemu**
- Skanuj kod QR z bieżącej karty, aparatem, z obrazu lub ze schowka.
- Wklej linki otpauth:// albo wpisz klucz tajny ręcznie.
- Obsługuje TOTP i HOTP z SHA-1, SHA-256 lub SHA-512 i od 6 do 10 cyfr, a także Steam (5 znaków) i Battle.net (8 cyfr).

**Prywatnie i bezpiecznie**
- Konta są przechowywane na Twoim urządzeniu w sejfie szyfrowanym AES-256-GCM. Ustaw hasło, aby chronić jego klucz: bez hasła klucz leży na urządzeniu obok danych.
- Blokada hasłem (Argon2id), kod odzyskiwania i opcjonalne odblokowanie kluczem dostępu (niedostępne w Firefoksie). Wybierz, kiedy ma się blokować automatycznie.
- Opcjonalnie wymagaj weryfikacji urządzenia przed użyciem kodu (niedostępne w Firefoksie) i ukrywaj kody wybranym skrótem klawiszowym.
- Bez analityki, bez reklam, bez serwera dewelopera. Kod źródłowy jest publiczny.

**Nie trać dostępu**
- Zaszyfrowane kopie zapasowe oraz eksport do tekstu otpauth, CXF i kodów QR.
- Synchronizacja między urządzeniami przez synchronizację przeglądarki (Chrome, Edge, Firefox), szyfrowana przy włączonej blokadzie hasłem.
- Migawki do odzyskiwania, kosz na 30 dni i historia zmian każdego konta.
- Sprawdzanie zegara ostrzega, gdy czas komputera sprawiłby, że kody nie zadziałają.

**Udostępnij kod, nie sekret**
- Wyślij link, który pokazuje tylko kody na najbliższe 5–60 minut, opcjonalnie z hasłem. Link nigdy nie zawiera klucza tajnego.

**Warto wiedzieć**
- Deweloper nie prowadzi kopii zapasowej w chmurze. Kopie zapasowe to pliki, które przechowujesz samodzielnie; synchronizacja odbywa się przez przeglądarkę.
- Odblokowanie kluczem dostępu i weryfikacja urządzenia nie są dostępne w Firefoksie. Wersja dla Safari jest tylko na macOS.

Dostępny w 20 językach. Obsługuje zasady zarządzane dla organizacji.

Popout Authenticator tworzy niezależny deweloper. Bazuje na kodzie i tłumaczeniach rozszerzenia Authenticator (authenticator.cc) na licencji MIT i nie jest powiązany z jego autorami.

Google Authenticator jest znakiem towarowym Google LLC.

Polityka prywatności: https://github.com/elitekid/popout-authenticator/blob/main/PRIVACY.md
Kod źródłowy: https://github.com/elitekid/popout-authenticator

## 엣지판 차이 (엣지 정책 1.1.2: 다른 브라우저를 언급하지 않는다. https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
엣지에는 위 설명을 아래처럼 바꿔 붙인다. 따옴표 대신 백틱 안의 글자를 그대로 쓴다.
- `panelu bocznego (pasek boczny w Firefoksie)` → `panelu bocznego`
- `opcjonalne odblokowanie kluczem dostępu (niedostępne w Firefoksie)` → `opcjonalne odblokowanie kluczem dostępu`
- `przed użyciem kodu (niedostępne w Firefoksie)` → `przed użyciem kodu`
- `przez synchronizację przeglądarki (Chrome, Edge, Firefox)` → `przez synchronizację Microsoft Edge`
- 이 줄을 뺀다: `- Odblokowanie kluczem dostępu i weryfikacja urządzenia nie są dostępne w Firefoksie. Wersja dla Safari jest tylko na macOS.`
