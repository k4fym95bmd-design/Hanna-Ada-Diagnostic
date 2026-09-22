# Hanna & Ada — Android bez komputera: WebUSB / OTG

Status 22.09.2026: **kod odkrywania i testu dostępu USB w gałęzi GitHub, NIE w Floot produkcja**. Bez danych z prawdziwego kabla nie wiadomo, czy dany adapter jest obsługiwany. Nie podłączać samochodu do wstępnego testu portu.

## Sprawdzony mechanizm platformowy

Google Chrome Help potwierdza podłączanie stron WWW do USB na Androidzie: https://support.google.com/chrome/answer/12576972 . Chrome Web Serial opisuje możliwość wykorzystania WebUSB i polyfill portu szeregowego na Androidzie, wyłącznie dla układów dostępnych przez WebUSB: https://developer.chrome.com/docs/capabilities/serial . Na Androidzie potrzebny jest prawdziwy tryb USB Host i zgodna przejściówka OTG. Chrome może dodatkowo wymagać uprawnienia USB od systemu. iOS Safari/Chrome nie daje zwykłym stronom równoważnego bezpośredniego USB.

**Odrębność środowisk:** WebUSB w Chrome na Androidzie nie oznacza, że identyczny dostęp będzie dostępny w natywnym Capacitor Android WebView. Próba jest przeznaczona do otwartej w Chrome wersji web, nie stanowi automatycznie natywnego pluginu Floot.

## Ścieżka w jednym projekcie

1. Android Chrome otwiera tę samą stronę Hanna & Ada w HTTPS, zakładka `VCI / Connection` → `Android USB`.
2. `WYBIERZ USB / OTG` uruchamia bezpośrednio okno zgody `navigator.usb.requestDevice({filters:[]})`, wyłącznie po kliknięciu.
3. UI odczytuje tylko VID:PID i liczbę konfiguracji; pomija numer seryjny i ścieżki USB.
4. `SPRAWDŹ DOSTĘP USB`: `device.open()` → `device.close()` w `finally`, bez claimInterface, transferOut, transferIn ani konfiguracji portu. Wynik to **USB access verified**, NIGDY `serial port open` lub `ECU online`.
5. Dalszy sterownik USB-serial musi być dobrany dopiero po uzyskaniu prawdziwego VID:PID i sprawdzeniu odpowiedniej obsługi FTDI/PL2303/CP210x/CH340 lub innej rodziny. Biblioteka/polyfill wymaga przeglądu i testów zgodności dla konkretnego układu. Nie oznaczać BMW K-Line/DS2/KWP jako obsługiwanych przed osobno zweryfikowanym protokołem i realnymi odpowiedziami ECU.

## Realne blokady

- Odmowa wyświetlenia urządzenia przez Chrome oznacza niedostępność WebUSB / USB Host / chronioną klasę lub zajęcie urządzenia przez system; samo `navigator.usb` nie wystarcza.
- Gdy WebUSB nie działa, istniejący `android-usb-probe` nadal może odczytać USB Host, zgodę i spróbować otwarcia portu **poza samochodem**. To część tego samego repozytorium, ale nie jest jeszcze połączona z webowym ekranem Floot.
- Bez prawdziwej informacji o układzie kabla nie implementować na ślepo vendor-specific komend sterownika. Bez zweryfikowanego ECU nie oferować odczytu błędów jako działającego.
- Nie próbować komunikacji z samochodem ani sterowania modułami w ramach testu dostępu USB; kasowanie błędów, kodowanie, aktywacje i flash pozostają zablokowane.

## Zmiany kodu i testy

`public/webusb-cable-discovery.js`, `public/webusb-workbench-extension.js`, jedna dodatkowa referencja skryptu w istniejącym `public/index.html`, `test/webusb-cable-discovery.mjs`, `npm run test:webusb` w `package.json`. No new app, database or separate vehicle session. Testy jednostkowe używają mocków, nie kabla. Zmiany oczekują na merge i synchronizację z aktywnym Floot po usunięciu limitu działań.
