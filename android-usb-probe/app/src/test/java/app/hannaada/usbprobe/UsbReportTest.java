package app.hannaada.usbprobe;

import java.util.Arrays;
import java.util.Collections;

/** Offline JVM tests: no Android, USB device, car or Internet needed. */
public final class UsbReportTest {
    private static void check(boolean condition, String description) {
        if (!condition) throw new AssertionError(description);
    }

    public static void main(String[] args) {
        String unknown = UsbReport.build(21, false, false, null);
        check(unknown.contains("Android API: 21"), "Android API is reported");
        check(unknown.contains("Odczyt listy USB: NIEDOSTĘPNY"), "unavailable differs from zero");
        check(unknown.contains("Lista USB jest niedostępna"), "unavailable has actionable guidance");
        check(unknown.contains("Połączenie z BMW: NIEPOTWIERDZONE"), "no false BMW claim");
        check(unknown.contains("Komendy diagnostyczne: WYŁĄCZONE"), "no diagnostic commands");

        String empty = UsbReport.build(21, true, true, Collections.<UsbReport.Device>emptyList());
        check(empty.contains("Odczyt listy USB: DOSTĘPNY"), "enumeration available");
        check(empty.contains("Wykryte urządzenia z poprawnymi danymi: 0"), "empty list isn't unavailable");
        check(empty.contains("przejściówkę OTG i pendrive"), "empty suggests zero-cost OTG test");

        String noHost = UsbReport.build(21, false, true, Collections.<UsbReport.Device>emptyList());
        check(noHost.contains("nie kupuj kabla"), "unsupported host cannot trigger hardware purchases");

        String denied = UsbReport.build(21, true, true,
                Arrays.asList(new UsbReport.Device(0x0403, 0x6001, 1, false)));
        check(denied.contains("Nadaj zgodę"), "no permission recommends consent");
        check(!denied.contains("Zapisz VID:PID"), "no driver-ready claim before permission");

        String observed = UsbReport.build(21, true, true,
                Arrays.asList(new UsbReport.Device(0x0403, 0x6001, 1, true),
                        new UsbReport.Device(0x1a86, 0x7523, 2, false)));
        check(observed.contains("0403:6001, interfejsy 1, zgoda Androida TAK"), "first VID:PID");
        check(observed.contains("1A86:7523, interfejsy 2, zgoda Androida NIE"), "second VID:PID");
        check(observed.contains("Wykryte urządzenia z poprawnymi danymi: 2"), "accurate count");
        check(observed.contains("Zapisz VID:PID"), "permission guides next observation");
        check(observed.contains("brak rodziny = NIEPOTWIERDZONY"), "no driver assumption");
        check(!observed.contains("OTG potwierdzone"), "no hardware claim from enumeration alone");
        check(!observed.contains("POŁĄCZONO"), "no vehicle session claim");

        check("FTDI".equals(UsbSerialEvidence.family("FtdiSerialDriver")), "FTDI class mapping");
        check("CP210X".equals(UsbSerialEvidence.family("Cp21xxSerialDriver")), "CP210x class mapping");
        check("CH34X".equals(UsbSerialEvidence.family("Ch34xSerialDriver")), "CH34x class mapping");
        check("PL2303".equals(UsbSerialEvidence.family("ProlificSerialDriver")), "Prolific mapping");
        check("UNKNOWN".equals(UsbSerialEvidence.family("AnythingElse")), "unknown driver stays unknown");

        String ftdi = UsbReport.build(21, true, true,
                Arrays.asList(new UsbReport.Device(0x0403, 0x6001, 1, true, "FTDI", 1)));
        check(ftdi.contains("sterownik FTDI, porty 1"), "sanitized driver evidence is exported");
        check(ftdi.contains("profil K+DCAN: KANDYDAT FTDI"), "FTDI is candidate, not BMW proof");
        check(!ftdi.contains("FtdiSerialDriver"), "implementation class name not exported");
        check(!ftdi.contains("BMW: POŁĄCZONO"), "FTDI never becomes BMW proof");

        String contradictory = UsbReport.build(21, false, true,
                Arrays.asList(new UsbReport.Device(0x0403, 0x6001, 1, true)));
        check(contradictory.contains("niespójny"), "host/device mismatch does not claim success");

        String invalid = UsbReport.build(21, true, true,
                Arrays.asList(new UsbReport.Device(-1, 1, 1, true),
                        new UsbReport.Device(1, 65536, 1, true),
                        new UsbReport.Device(1, 2, -1, true)));
        check(invalid.contains("Wykryte urządzenia z poprawnymi danymi: 0"), "invalid items are not counted");
        check(!invalid.contains("VID:PID"), "invalid identifiers not exported");
        check(!invalid.contains("serial="), "no serial or path in report");
        check(!invalid.contains("BMW: POŁĄCZONO"), "no fake BMW status");
        System.out.println("PASS: USB report privacy, states, next-step guidance and fail-closed tests");
    }
}
