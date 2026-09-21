package app.hannaada.usbprobe;

import java.util.Arrays;
import java.util.Collections;

/** Run with plain javac/java in CI; no Android emulator or third-party dependency. */
public final class UsbReportTest {
    private static void check(boolean condition, String description) {
        if (!condition) throw new AssertionError(description);
    }

    public static void main(String[] args) {
        String unknown = UsbReport.build(21, false, false, null);
        check(unknown.contains("Android API: 21"), "Android API is reported");
        check(unknown.contains("Odczyt listy USB: NIEDOSTĘPNY"), "unknown enumeration distinct from zero");
        check(unknown.contains("Połączenie z BMW: NIEPOTWIERDZONE"), "no false BMW claim");
        check(unknown.contains("Komendy diagnostyczne: WYŁĄCZONE"), "no diagnostic commands");

        String empty = UsbReport.build(21, true, true, Collections.<UsbReport.Device>emptyList());
        check(empty.contains("Odczyt listy USB: DOSTĘPNY"), "available enumeration reported");
        check(empty.contains("Wykryte urządzenia: 0"), "empty list is not unavailable");

        String observed = UsbReport.build(21, true, true,
                Arrays.asList(new UsbReport.Device(0x0403, 0x6001, 1, true),
                        new UsbReport.Device(0x1a86, 0x7523, 2, false)));
        check(observed.contains("0403:6001, interfejsy 1, zgoda Androida TAK"), "first VID:PID");
        check(observed.contains("1A86:7523, interfejsy 2, zgoda Androida NIE"), "second VID:PID");
        check(observed.contains("Sterownik USB-Serial: NIEPOTWIERDZONY"), "no driver assumption");
        check(!observed.contains("OTG potwierdzone"), "no hardware claim from enumeration alone");
        check(!observed.contains("POŁĄCZONO"), "no vehicle session claim");

        String invalid = UsbReport.build(21, true, true,
                Arrays.asList(new UsbReport.Device(-1, 1, 1, true),
                        new UsbReport.Device(1, 65536, 1, true),
                        new UsbReport.Device(1, 2, -1, true)));
        check(!invalid.contains("VID:PID"), "invalid identifiers cannot enter report");
        check(!invalid.contains("serial="), "no serial or path in report");
        System.out.println("PASS: Android 5 USB report privacy and fail-closed tests");
    }
}
