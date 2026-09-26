package app.hannaada.usbprobe;

public final class LegacyPortApplyPolicyTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        final long[] now = new long[] { 1000L };
        KdcanTransportSession s = new KdcanTransportSession(
                new KdcanTransportSession.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                }, 10000L);

        KdcanTransportSession.Snapshot bound =
                s.begin("session-applypolicy-123456", 0x0403, 0x6001, "FTDI");
        KdcanTransportSession.Snapshot open =
                s.markPortOpen("session-applypolicy-123456", bound.epoch);

        long[] ds2Params = new long[8];
        ds2Params[1] = 9600L;
        LegacySerialProfile.Profile ds2 = LegacySerialProfile.ds2(false);
        LegacyPortConfigurationPlan.Result ds2Plan = LegacyPortConfigurationPlan.build(
                open, open.epoch, ds2, LegacySerialProfile.resolve(ds2, ds2Params));
        LegacyPortApplyPolicy.Result d = LegacyPortApplyPolicy.from(ds2Plan);
        check(d.valid, "DS2 static UART policy valid");
        check(d.baudRate == 9600, "DS2 baud retained");
        check(d.dataBits == 8, "reference data bits = 8");
        check(d.stopBits == 1, "reference stop bits = 1");
        check(LegacySerialProfile.PARITY_EVEN.equals(d.parity), "DS2 parity EVEN");
        check(d.dtrRequiredDuringSend, "DS2 send-time DTR requirement retained");
        check(!d.dtrTouchedDuringConfiguration, "configuration never toggles DTR");
        check(!d.ecuVerified && !d.writesEnabled, "static settings are not ECU proof");

        long[] kwpParams = new long[33];
        kwpParams[1] = 10400L;
        LegacySerialProfile.Profile kwp = LegacySerialProfile.kwp2000Bmw();
        LegacyPortConfigurationPlan.Result kwpPlan = LegacyPortConfigurationPlan.build(
                open, open.epoch, kwp, LegacySerialProfile.resolve(kwp, kwpParams));
        LegacyPortApplyPolicy.Result k = LegacyPortApplyPolicy.from(kwpPlan);
        check(k.valid, "KWP static UART policy valid");
        check(k.dataBits == 8 && k.stopBits == 1, "KWP static framing");
        check(LegacySerialProfile.PARITY_NONE.equals(k.parity), "KWP parity NONE");
        check(!k.dtrRequiredDuringSend, "KWP DTR not guessed");
        check(!k.dtrTouchedDuringConfiguration, "KWP configuration does not touch DTR");

        check(!LegacyPortApplyPolicy.from(null).valid, "null plan rejected");

        System.out.println("PASS: static UART policy applies only evidence-backed settings");
    }
}
