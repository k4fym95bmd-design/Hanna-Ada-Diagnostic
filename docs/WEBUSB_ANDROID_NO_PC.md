# Hanna & Ada — Android bez komputera: WebUSB / OTG

Status 22.09.2026: **kod odkrywania USB i podpowiedzi chipsetu w gałęzi GitHub, NIE w produkcji Floot**. Brak weryfikacji z fizycznym kablem lub BMW. Wstępny test dostępu wykonuje się poza samochodem.

## Platforma

Chrome Android może udostępnić stronę WWW z WebUSB pod HTTPS: https://support.google.com/chrome/answer/12576972 . Chrome opisuje szeregowe urządzenia USB oraz wymagania ich obsługi: https://developer.chrome.com/docs/capabilities/serial . Konkretny telefon/tablet potrzebuje USB Host, kompatybilnego OTG i zgody. WebUSB w Chrome **nie oznacza** dostępności tego samego API w natywnym Android WebView/Capacitor. iPhone Safari/Chrome nie zapewnia zwykłej stronie bezpośredniej obsługi kabla K+DCAN.

## W jednej aplikacji

1. Obecny ekran `VCI / Connection` → `Android USB` → `WYBIERZ USB / OTG` wywołuje `navigator.usb.requestDevice({filters:[]})` bezpośrednio po dotknięciu przycisku.
2. Strona odczytuje tylko VID:PID i liczbę konfiguracji; pomija numer seryjny, ścieżkę USB, VIN i dane pojazdu.
3. `public/usb-chipset-candidates.js` podpowiada rodziny **wyłącznie jako kandydatów**: FTDI `0403:6001`/`0403:6010`, Silicon Labs `10C4:EA60`, Prolific `067B:2303`, WCH `1A86:7523`. Nieznany identyfikator pozostaje nieznany. VID:PID może zostać zmieniony lub podszyty, zatem nie dowodzi autentyczności układu, obecności sterownika ani zgodności z BMW.
4. `SPRAWDŹ DOSTĘP USB` wykonuje jedynie `device.open()` i `device.close()` w `finally`, bez transmisji, inicjalizacji sterownika USB-serial i jakiejkolwiek komunikacji z autem.
5. Dopiero prawdziwa identyfikacja układu pozwala wybrać i testować sterownik USB-serial, potem osobno protokół BMW K-Line/DS2/KWP i zweryfikowany odczyt ECU. Na tym etapie odczyt BMW **nie jest zaimplementowany**.

Podstawy identyfikatorów: FTDI https://www.ftdichip.com/Support/Knowledgebase/changingtheftdibus_inffile.htm ; Silicon Labs https://www.silabs.com/documents/public/application-notes/an220-usb-driver-customization.pdf ; Prolific https://prolificusa.com/product/pl2303gl-8-pin-usb-uart-bridge-controller/ ; Microsoft WCH CH340 https://www.catalog.update.microsoft.com/ScopedViewInline.aspx?updateid=39b2bd63-6509-4feb-879a-135ab1b6d19d . To przykładowe identyfikatory, nie kompletna lista USB.

## Blokady i testy

- Brak WebUSB/USB Host, odmowa uprawnienia, urządzenie zajęte lub obsługiwane wyłącznie przez system = brak potwierdzonej ścieżki WebUSB. Nie zgadywać i nie wykonywać vendor-specific komend na ślepo.
- Istniejący `android-usb-probe` może osobno sprawdzić Host, pozwolenie, sterownik i port poza samochodem. Nie jest jeszcze spięty z webowym ekranem Floot.
- Zapis, aktywacja, DTC erase, kodowanie i flash pozostają zablokowane. USB enumeration i open/close nie oznaczają `ECU ONLINE`.
- Kod: `public/webusb-cable-discovery.js`, `public/webusb-workbench-extension.js`, `public/usb-chipset-candidates.js`; testy: `npm run test:webusb`. Próby lokalne są mockowane, nie stanowią testu hardware.

Wszystkie zmiany dotyczą istniejącego repozytorium i ekranu, nie tworzą nowej aplikacji, bazy ani niezależnej sesji pojazdu. Zmiany pozostają nieopublikowane do integracji ze stanem Floot po wygaśnięciu ograniczenia edycji oraz właściwej walidacji.
