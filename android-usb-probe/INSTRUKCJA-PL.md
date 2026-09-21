# Hanna & Ada — test USB na Lenovo TB3-710F

Ten APK **nie jest programem diagnostycznym BMW**. To odrębny moduł testowy w istniejącym repozytorium, bez Internetu, otwierania portu, odczytu ECU, poleceń do auta i sterowników USB-Serial. Działa od Android API 21. Zaliczenie kompilacji nie oznacza, że został uruchomiony na konkretnym tablecie.

## Instalacja

1. Pobierz **wyłącznie** APK z naszego repozytorium / pliku przekazanego w rozmowie. Rozpakuj ZIP, jeżeli pobierasz artefakt z GitHub Actions.
2. Wersje testowe z różnych uruchomień GitHub Actions mogą mieć **różne podpisy debug**. Jeżeli Android odmawia aktualizacji wcześniej zainstalowanej aplikacji „Hanna & Ada USB Test”, odinstaluj **tylko tę testową aplikację**, a następnie zainstaluj nowy APK. Nie usuwaj właściwej aplikacji Hanna & Ada ani nie resetuj tabletu. Moduł testowy nie przechowuje wyników.
3. Otwórz „Hanna & Ada USB Test” i naciśnij „Odśwież wynik USB”. Zapisz, czy system zgłasza funkcję USB Host.
4. **Poza samochodem**, jeżeli masz już przejściówkę micro-USB OTG i zwykły energooszczędny pendrive, podłącz je do tabletu i ponownie odśwież wynik. Brak wykrycia przy jednym pendrivie nie dowodzi ostatecznie braku OTG.
5. Naciśnij „Kopiuj bezpieczny raport do ChatGPT” i wklej jego treść do rozmowy. Raport jest tworzony lokalnie na żądanie, zawiera tylko poziom API, deklarację hosta, VID:PID, liczbę interfejsów i status pozwolenia. Nie pobiera numerów seryjnych, ścieżek ani danych samochodu.
6. Jeżeli pokaże się „Urządzenie ... VID:PID ...”, można osobno, po weryfikacji konkretnego kabla, rozpatrzyć obsługę USB-Serial w kolejnej wersji. **Samo wykrycie lub przyznanie pozwolenia nie oznacza zgodności z BMW**.

Nie kupuj nowych przejściówek ani kabli wyłącznie na podstawie tego testu. Bez potwierdzonego hosta USB i rzeczywistej identyfikacji posiadanego kabla nie uruchamiać transmisji do pojazdu. Wersja webowa Floot `https://bmw.floot.app` jest osobnym środowiskiem i nie uzyskuje dostępu do kabla USB przez sam hosting.
