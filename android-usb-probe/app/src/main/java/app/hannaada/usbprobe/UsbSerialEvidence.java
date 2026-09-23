package app.hannaada.usbprobe;

/**
 * Sanitized USB-serial evidence. Pure Java: no Android handles, USB paths,
 * serial numbers, ECU data or exception strings.
 */
public final class UsbSerialEvidence {
    private UsbSerialEvidence() { }

    public static String family(String driverClassName) {
        if ("FtdiSerialDriver".equals(driverClassName)) return "FTDI";
        if ("Cp21xxSerialDriver".equals(driverClassName)) return "CP210X";
        if ("Ch34xSerialDriver".equals(driverClassName)) return "CH34X";
        if ("ProlificSerialDriver".equals(driverClassName)) return "PL2303";
        if ("CdcAcmSerialDriver".equals(driverClassName)) return "CDC-ACM";
        return "UNKNOWN";
    }

    public static int safePortCount(int value) {
        return value >= 0 && value <= 16 ? value : 0;
    }

    public static boolean isKdcAnReferenceCandidate(String family) {
        return "FTDI".equals(family);
    }
}
