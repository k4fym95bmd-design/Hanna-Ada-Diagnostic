# Hanna & Ada: kabel, most i jeden ekran VCI

Stan prac: **implementacja na gałęzi GitHuba / szkic integracyjny, nieopublikowane w Floot**. Nie ma potwierdzonej sesji z fizycznym BMW. Nie tworzyć drugiego projektu, drugiej bazy ani niezależnej sesji pojazdu.

## Architektura jednej aplikacji

```
BMW E39 1999 · złącze właściwe dla danego egzemplarza
    → zgodny, fizyczny interfejs diagnostyczny / ewentualny adapter złączy
    → USB K+DCAN / USB-serial
       ├── Windows Chrome/Edge → Web Serial → VCI / Connection (enumeracja i open/close)
       ├── Windows Node agent → bezpieczny HTTPS LAN → iPhone/Android web UI (enumeracja i open/close)
       └── Android USB Host → istniejący USB Probe (osobne natywne potwierdzenie, bez złączenia z web UI)
    → PRZYSZŁY, zweryfikowany sterownik fizyczny BMW K-Line/DS2/KWP
    → PRZYSZŁE zweryfikowane ECU → odczyty DTC/PID, raport
```

Carista BLE jest osobną ścieżką generic OBD-II. Otwarcie USB lub zidentyfikowanie VID/PID **nie** dowodzi BMW VCI, protokołu, stanu ECU ani pełnego dostępu do modułów. `gateway/port.mjs` jest kontraktem VCI, a nie implementacją K-Line/DS2. Nie łączyć obu przez fałszywy stan online.

## Co zawiera ta zmiana

- `public/cable-connection-model.js`: wspólny, fail-closed status portu, weryfikacji sesji i blokady zapisów; sprawdzanie adresu mostu.
- `public/cable-workbench.js` + `.css`: responsywny panel dokładany do **obecnej strony VCI**, wybór trybu, wybór portu, etapowy status, token bez trwałego zapisu, przyciski open/close.
- `gateway/windows-cable-bridge.mjs`: lokalny agent serialport (lista, otwarcie, zamknięcie) z Bearer token, ograniczeniem Origin i wymogiem TLS poza localhost. Nie oferuje surowej transmisji, kasowania DTC, kodowania, aktywacji modułów ani flashowania. Nigdy nie wdrażać go na publiczny hosting.
- `test/cable-connection.mjs`: regresja stanów, URL i podstawowego bezpieczeństwa/lifecycle przy sterowniku symulowanym w procesie testowym (bez samochodu).

## Windows: przygotowanie agenta bez połączenia z autem

W katalogu **istniejącego repozytorium**, na komputerze z Windows, z Node.js obsługującym ten projekt:

```powershell
npm install
$env:HAA_BRIDGE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:HAA_BRIDGE_ORIGIN = "https://bmw.floot.app"
npm run start:cable-bridge
```

Domyślnie agent działa tylko pod `http://127.0.0.1:8765` na tym samym komputerze. Nie przesyła poleceń do samochodu. W kodzie uruchomienia sterownika port otwierany jest na 9600 baud wyłącznie w próbie dostępu do USB, **to nie jest dobrany baud BMW**. Jeśli system nie widzi kabla, trzeba zweryfikować identyfikator USB, uprawnienia i właściwy sterownik; nie udawać połączenia.

**iPhone / Android przez lokalną sieć:** trzeba ustawić adres LAN w `HAA_BRIDGE_HOST`, dokładnie dopasowany adres przeglądarki w `HAA_BRIDGE_ORIGIN`, a także `HAA_BRIDGE_TLS_CERT` i `HAA_BRIDGE_TLS_KEY` na poprawny certyfikat HTTPS z nazwą zgodną z hostem i zaufaną przez telefon. Własny niezweryfikowany certyfikat albo samo wystawienie HTTP na LAN nie wystarczy. Agent odmówi startu na nielokalnym adresie bez TLS. Firewall powinien ograniczać dostęp do własnej sieci. **Nie umieszczać tokenu w URL, kodzie frontendu, GitHubie ani serwisach cloud.** Przeglądarka i polityka dostępu do sieci lokalnej mogą dodatkowo wymagać autoryzacji; tej integracji nie potwierdzono na urządzeniu.

iPhone Safari / Chrome nie udostępnia stronom Web Serial/USB: bezpośredni zwykły kabel K+DCAN do strony iPhone'a nie zadziała. Dla tego przypadku potrzebny jest komputer-brama lub osobna, kompatybilna akcesoryjna ścieżka natywna; nie deklarować uniwersalnego wsparcia kabla USB na iOS. Android USB Host wymaga potwierdzenia na konkretnym tablecie oraz chipsetu kabla.

## Macierz gotowości (22.09.2026)

| Element | Kod | Potwierdzenie sprzętowe |
| --- | --- | --- |
| Obecna aplikacja / ekran VCI | Nowy panel w gałęzi GitHub; nie w produkcji Floot | Nie |
| Desktop Web Serial wybór i open/close | Tak, brak transmisji | Nie |
| Windows serialport agent + auth/HTTPS | Tak, API tylko lista/open/close | Testy z fałszywym portem, nie realnym |
| iOS/Android klient HTTPS do mostu | Kod klienta na stronie GitHub | Brak sprawdzenia TLS/telefonu |
| Android USB Probe | Istniejący osobny program | Brak potwierdzonego sprzętu użytkownika |
| Android natywny ↔ Floot web | Nie | Nie |
| K-Line / DS2 / KWP2000 właściwy sterownik ECU | Nie | Nie |
| Rzeczywista odpowiedź ECU, DTC z kabla, live | Nie | Nie |
| Kodowanie, kasowanie, aktywne testy, flash | Wyłączone | Nie |

## Bramka integracyjna bez duplikowania

1. Po odblokowaniu Floot odczytać bieżącą wersję projektu i źródła `pages/_index.tsx`, `helpers/obdSession.tsx` oraz `helpers/diagnosticCore.tsx`.
2. Przenieść **ten sam** ekran wyboru kabla i model stanów do istniejącego `VCI / Connection` w Floot. Stan kabla musi korzystać z jednej sesji i jednego `epoch`, z osobnym transportem `USB_DIRECT` / `WINDOWS_BRIDGE` / `ANDROID_NATIVE` / `BLE`, bez równoczesnego przejęcia pojazdu.
3. Udostępniać lokalny most tylko przez jawne podłączenie użytkownika. Zamknięcie/zmiana kabla unieważnia wszystkie poprzednie dowody ECU.
4. Dodać zweryfikowany protokół i fizyczny sterownik BMW jako **oddzielny, testowany etap**, dopiero później spiąć go z `gateway/port.mjs` i `workshop-fusion.js`. Nie podstawiać fikcyjnych PID, VIN, DTC, tożsamości ECU ani K-line.
5. Przed publikacją: testy jednostkowe, obsługa rozłączenia, realny certyfikat HTTPS, audyt odmowy komunikacji bez danych, zgodność platform i test urządzenia poza autem. Samo `npm test` nie potwierdza pojazdu.

Źródła techniczne: Google Chrome Web Serial (`https://developer.chrome.com/docs/capabilities/serial`), ograniczenia Chrome iOS (`https://support.google.com/chrome/answer/12576972`), Apple External Accessory (`https://developer.apple.com/documentation/externalaccessory`), serialport (`https://serialport.io/`).
