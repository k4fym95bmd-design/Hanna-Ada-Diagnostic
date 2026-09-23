package app.hannaada.usbprobe;

public final class LegacyPortConfigurationPlanTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        final long[] now = new long[] { 1000L };
        KdcanTransportSession session = new KdcanTransportSession(
                new KdcanTransportSession.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                }, 10000L);

        KdcanTransportSession.Snapshot bound =
                session.begin("session-portplan-1234567890", 0x0403, 0x6001, "FTDI");

        long[] ds2Params = new long[8];
        ds2Params[1] = 9600L;
        LegacySerialProfile.Profile ds2 = LegacySerialProfile.ds2(false);
        LegacySerialProfile.Resolution ds2Resolved =
                LegacySerialProfile.resolve(ds2, ds2Params);

        LegacyPortConfigurationPlan.Result closed =
                LegacyPortConfigurationPlan.build(bound, bound.epoch, ds2, ds2Resolved);
        check(!closed.ready && "PORT_NOT_OPEN".equals(closed.stage),
                "closed port cannot receive a config plan");

        KdcanTransportSession.Snapshot open =
                session.markPortOpen("session-portplan-1234567890", bound.epoch);
        LegacyPortConfigurationPlan.Result ready =
                LegacyPortConfigurationPlan.build(open, open.epoch, ds2, ds2Resolved);
        check(ready.ready, "fresh open session can form a plan");
        check("CONFIGURATION_PLAN_READY".equals(ready.stage), "ready stage");
        check("DS2".equals(ready.protocol), "DS2 protocol retained");
        check(ready.baudRate == 9600, "baud comes from resolved parameters");
        check(LegacySerialProfile.PARITY_EVEN.equals(ready.parity), "DS2 parity retained");
        check(ready.sendDtr, "DS2 DTR policy retained");
        check(!ready.applied, "plan does not apply hardware settings");
        check(!ready.ecuVerified && !ready.writesEnabled, "plan is not ECU proof");

        LegacyPortConfigurationPlan.Result stale =
                LegacyPortConfigurationPlan.build(open, open.epoch - 1L, ds2, ds2Resolved);
        check(!stale.ready && "STALE_EPOCH".equals(stale.stage), "stale epoch rejected");

        session.markConfigured("session-portplan-1234567890", open.epoch);
        session.bindRequest("session-portplan-1234567890", open.epoch, "request-plan-0001");
        LegacyPortConfigurationPlan.Result busy =
                LegacyPortConfigurationPlan.build(session.snapshot(), open.epoch, ds2, ds2Resolved);
        check(!busy.ready && "REQUEST_ALREADY_BOUND".equals(busy.stage),
                "config cannot change while a request is bound");

        session.disconnect();
        LegacyPortConfigurationPlan.Result inactive =
                LegacyPortConfigurationPlan.build(session.snapshot(), open.epoch, ds2, ds2Resolved);
        check(!inactive.ready && "SESSION_INACTIVE".equals(inactive.stage),
                "disconnected session rejected");

        long[] kwpParams = new long[33];
        kwpParams[1] = 10400L;
        LegacySerialProfile.Profile kwp = LegacySerialProfile.kwp2000Bmw();
        LegacySerialProfile.Resolution kwpResolved =
                LegacySerialProfile.resolve(kwp, kwpParams);

        KdcanTransportSession.Snapshot second =
                session.begin("session-portplan-abcdefghij", 0x0403, 0x6001, "FTDI");
        KdcanTransportSession.Snapshot secondOpen =
                session.markPortOpen("session-portplan-abcdefghij", second.epoch);
        LegacyPortConfigurationPlan.Result kwpPlan =
                LegacyPortConfigurationPlan.build(secondOpen, secondOpen.epoch, kwp, kwpResolved);
        check(kwpPlan.ready, "KWP plan resolves");
        check("KWP2000_BMW".equals(kwpPlan.protocol), "KWP protocol retained");
        check(LegacySerialProfile.PARITY_NONE.equals(kwpPlan.parity), "KWP parity retained");
        check(!kwpPlan.sendDtr, "no guessed KWP DTR behavior");
        check(!kwpPlan.applied, "KWP plan remains metadata only");

        System.out.println("PASS: legacy port configuration plan is epoch-bound and non-applying");
    }
}
