package app.hannaada.usbprobe;

import java.util.List;
import java.util.Locale;

/** Pure, offline evidence formatter. Does not accept serial numbers, USB paths or ECU data. */
public final class UsbReport {
    private UsbReport() { }

    public static final class Device {
        public final int vendorId;
        public final int productId;
        public final int interfaceCount;
        public final boolean permissionGranted;

        public Device(int vendorId, int productId, int interfaceCount, boolean permissionGranted) {
            this.vendorId = vendorId;
            this.productId = productId;
            this.interfaceCount = interfaceCount;
            this.permissionGranted = permissionGranted;
        }
    }

    public static String build(int api, boolean hostFeature, boolean enumerationAvailable,
                               List<Device> devices) {
        StringBuilder out = new StringBuilder();
        out.append("HANNA & ADA | RAPORT USB OFFLINE\n");
        out.append("Android API: ").append(api).append('\n');
        out.append("USB Host - deklaracja systemu: ")
                .append(hostFeature ? "TAK" : "NIE").append('\n');
        out.append("Odczyt listy USB: ")
                .append(enumerationAvailable ? "DOSTĘPNY" : "NIEDOSTĘPNY").append('\n');
        int count = enumerationAvailable && devices != null ? devices.size() : 0;
        out.append("Wykryte urządzenia: ").append(count).append('\n');
        if (enumerationAvailable && devices != null) {
            int ordinal = 0;
            for (Device device : devices) {
                if (device == null || device.vendorId < 0 || device.vendorId > 0xffff
                        || device.productId < 0 || device.productId > 0xffff
                        || device.interfaceCount < 0) {
                    continue;
                }
                ++ordinal;
                out.append("Urządzenie ").append(ordinal).append(": VID:PID ")
                        .append(String.format(Locale.US, "%04X:%04X", device.vendorId, device.productId))
                        .append(", interfejsy ").append(device.interfaceCount)
                        .append(", zgoda Androida ")
                        .append(device.permissionGranted ? "TAK" : "NIE").append('\n');
            }
        }
        out.append("Sterownik USB-Serial: NIEPOTWIERDZONY\n");
        out.append("Połączenie z BMW: NIEPOTWIERDZONE\n");
        out.append("Komendy diagnostyczne: WYŁĄCZONE\n");
        out.append("Numer seryjny i ścieżki USB: NIEZBIERANE\n");
        return out.toString();
    }
}
