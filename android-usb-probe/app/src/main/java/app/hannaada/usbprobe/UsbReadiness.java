package app.hannaada.usbprobe;

import java.util.List;

/**
 * Fail-closed decision support for an OFF-VEHICLE USB capability test.
 * This code makes no driver, BMW, protocol or vehicle connection claims.
 */
public final class UsbReadiness {
    private UsbReadiness() { }

    public static String nextStep(boolean systemHostFeature, boolean enumerationAvailable,
                                  List<UsbReport.Device> devices) {
        if (!enumerationAvailable) {
            return "KROK: Lista USB jest niedostępna. Sprawdź działanie aplikacji i ustawienia Androida; OTG NIEPOTWIERDZONE.";
        }
        int valid = 0;
        int granted = 0;
        if (devices != null) {
            for (UsbReport.Device d : devices) {
                if (!valid(d)) continue;
                valid++;
                if (d.permissionGranted) granted++;
            }
        }
        if (valid == 0) {
            return systemHostFeature
                    ? "KROK: Android deklaruje USB Host, lecz nie wykryto sprzętu. Poza samochodem sprawdź posiadaną przejściówkę OTG i pendrive."
                    : "KROK: Brak deklaracji USB Host i wykrytych urządzeń. Tablet nie potwierdził OTG; nie kupuj kabla na podstawie tego wyniku.";
        }
        if (!systemHostFeature) {
            return "KROK: System wykrył USB mimo braku deklaracji Host. Wynik jest niespójny; przetestuj ponownie poza samochodem.";
        }
        if (granted == 0) {
            return "KROK: USB wykryte, ale brak zgody na dostęp. Nadaj zgodę wybranemu urządzeniu w aplikacji i odśwież wynik.";
        }
        return "KROK: Urządzenie USB wykryte i zgoda udzielona. Zapisz VID:PID; dopiero potem sprawdzimy zgodność sterownika oraz konkretnego kabla. BMW NIEPOŁĄCZONE.";
    }

    public static boolean valid(UsbReport.Device d) {
        return d != null && d.vendorId >= 0 && d.vendorId <= 0xFFFF
                && d.productId >= 0 && d.productId <= 0xFFFF
                && d.interfaceCount >= 0;
    }
}
