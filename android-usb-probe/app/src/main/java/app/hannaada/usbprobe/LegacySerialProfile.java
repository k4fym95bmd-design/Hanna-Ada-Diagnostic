package app.hannaada.usbprobe;

/**
 * Clean-room metadata for legacy BMW serial communication concepts.
 *
 * Facts represented here are derived from public reference behavior only.
 * This class does not open or configure a serial port and contains no TX path.
 */
public final class LegacySerialProfile {
    public static final String BAUD_FROM_COMM_PARAMETER_1 = "COMM_PARAMETER_1";
    public static final String PARITY_EVEN = "EVEN";
    public static final String PARITY_NONE = "NONE";
    public static final String DTR_DS2_ADAPTER_ECHO_DEPENDENT = "DS2_ADAPTER_ECHO_DEPENDENT";
    public static final String DTR_NOT_ESTABLISHED = "NOT_ESTABLISHED_HERE";

    public static final class Profile {
        public final String protocol;
        public final int conceptId;
        public final int minimumParameterCount;
        public final String baudSource;
        public final String parity;
        public final String dtrPolicy;
        public final boolean sendDtr;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Profile(String protocol, int conceptId, int minimumParameterCount,
                        String baudSource, String parity, String dtrPolicy, boolean sendDtr) {
            this.protocol = protocol;
            this.conceptId = conceptId;
            this.minimumParameterCount = minimumParameterCount;
            this.baudSource = baudSource;
            this.parity = parity;
            this.dtrPolicy = dtrPolicy;
            this.sendDtr = sendDtr;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    public static final class Resolution {
        public final boolean valid;
        public final String stage;
        public final int baudRate;
        public final String parity;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Resolution(boolean valid, String stage, int baudRate, String parity) {
            this.valid = valid;
            this.stage = stage;
            this.baudRate = baudRate;
            this.parity = parity;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    private LegacySerialProfile() { }

    public static Profile ds2(boolean hasAdapterEcho) {
        return new Profile(
                "DS2",
                0x0006,
                8,
                BAUD_FROM_COMM_PARAMETER_1,
                PARITY_EVEN,
                DTR_DS2_ADAPTER_ECHO_DEPENDENT,
                !hasAdapterEcho);
    }

    public static Profile kwp2000Bmw() {
        return new Profile(
                "KWP2000_BMW",
                0x010C,
                33,
                BAUD_FROM_COMM_PARAMETER_1,
                PARITY_NONE,
                DTR_NOT_ESTABLISHED,
                false);
    }

    public static Resolution resolve(Profile profile, long[] commParameters) {
        if (profile == null) return invalid("PROFILE_MISSING");
        if (commParameters == null || commParameters.length < profile.minimumParameterCount) {
            return invalid("PARAMETERS_INCOMPLETE");
        }
        long rawBaud = commParameters[1];
        if (rawBaud <= 0L || rawBaud > 1000000L) {
            return invalid("BAUD_INVALID");
        }
        return new Resolution(true, "SERIAL_PROFILE_RESOLVED", (int)rawBaud, profile.parity);
    }

    private static Resolution invalid(String stage) {
        return new Resolution(false, stage, 0, "UNKNOWN");
    }
}
