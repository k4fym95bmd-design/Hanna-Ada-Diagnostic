package app.hannaada.usbprobe;

public final class LegacySerialProfileTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        LegacySerialProfile.Profile ds2NoEcho = LegacySerialProfile.ds2(false);
        check(ds2NoEcho.conceptId == 0x0006, "DS2 concept id");
        check(ds2NoEcho.minimumParameterCount == 8, "DS2 minimum parameter count");
        check(LegacySerialProfile.PARITY_EVEN.equals(ds2NoEcho.parity), "DS2 parity EVEN");
        check(ds2NoEcho.sendDtr, "DS2 DTR used when adapter echo is absent");
        check(!ds2NoEcho.ecuVerified && !ds2NoEcho.writesEnabled, "DS2 metadata stays safe");

        LegacySerialProfile.Profile ds2Echo = LegacySerialProfile.ds2(true);
        check(!ds2Echo.sendDtr, "DS2 DTR suppressed when adapter echo exists");

        LegacySerialProfile.Profile kwp = LegacySerialProfile.kwp2000Bmw();
        check(kwp.conceptId == 0x010C, "KWP2000 BMW concept id");
        check(kwp.minimumParameterCount == 33, "KWP minimum parameter count");
        check(LegacySerialProfile.PARITY_NONE.equals(kwp.parity), "KWP parity NONE");
        check(LegacySerialProfile.DTR_NOT_ESTABLISHED.equals(kwp.dtrPolicy),
                "KWP DTR behavior is not guessed");
        check(!kwp.ecuVerified && !kwp.writesEnabled, "KWP metadata stays safe");

        long[] tooShort = new long[7];
        check(!LegacySerialProfile.resolve(ds2NoEcho, tooShort).valid,
                "incomplete DS2 parameters rejected");

        long[] ds2Params = new long[8];
        ds2Params[1] = 9600L;
        LegacySerialProfile.Resolution ds2Resolved =
                LegacySerialProfile.resolve(ds2NoEcho, ds2Params);
        check(ds2Resolved.valid, "DS2 parameter baud resolves");
        check(ds2Resolved.baudRate == 9600, "DS2 uses parameter index 1, not hardcoded value");
        check(LegacySerialProfile.PARITY_EVEN.equals(ds2Resolved.parity),
                "resolved DS2 parity");
        check(!ds2Resolved.ecuVerified && !ds2Resolved.writesEnabled,
                "resolution is not ECU proof");

        long[] kwpParams = new long[33];
        kwpParams[1] = 10400L;
        LegacySerialProfile.Resolution kwpResolved =
                LegacySerialProfile.resolve(kwp, kwpParams);
        check(kwpResolved.valid, "KWP parameter baud resolves");
        check(kwpResolved.baudRate == 10400, "KWP uses parameter index 1, not hardcoded value");
        check(LegacySerialProfile.PARITY_NONE.equals(kwpResolved.parity),
                "resolved KWP parity");

        kwpParams[1] = 0L;
        check(!LegacySerialProfile.resolve(kwp, kwpParams).valid,
                "zero baud rejected");
        kwpParams[1] = 1000001L;
        check(!LegacySerialProfile.resolve(kwp, kwpParams).valid,
                "implausible baud rejected");

        System.out.println("PASS: legacy serial profiles resolve from communication parameters without guessing");
    }
}
