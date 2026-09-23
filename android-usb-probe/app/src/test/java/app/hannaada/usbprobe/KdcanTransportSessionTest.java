package app.hannaada.usbprobe;

public final class KdcanTransportSessionTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static LegacyFrameEvidence.Result reply() {
        return LegacyFrameEvidence.parseKwp(new byte[] {
                (byte)0xB8, (byte)0xF1, 0x12, 0x05,
                0x62, 0x40, 0x07, 0x01, (byte)0x90, (byte)0xEA
        });
    }

    public static void main(String[] args) {
        final long[] now = new long[] { 1000L };
        KdcanTransportSession s = new KdcanTransportSession(
                new KdcanTransportSession.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                }, 1000L);

        KdcanTransportSession.Snapshot bound =
                s.begin("session-1234567890123456", 0x0403, 0x6001, "FTDI");
        check(bound.active, "session active");
        check(bound.epoch == 1L, "first epoch");
        check("FTDI".equals(bound.driverFamily), "driver family bound");
        check(!bound.portOpen && !bound.configured && !bound.requestBound, "bound is not open");
        check(!bound.ecuVerified && !bound.writesEnabled, "safe defaults");

        KdcanTransportSession.Snapshot open =
                s.markPortOpen("session-1234567890123456", bound.epoch);
        check(open.portOpen, "port state opened");
        check(!open.configured, "open port is not automatically configured");
        check("PORT_OPEN".equals(open.stage), "open stage");

        boolean unconfiguredRejected = false;
        try {
            s.bindRequest("session-1234567890123456", bound.epoch, "request-before-config");
        } catch (IllegalStateException expected) {
            unconfiguredRejected = true;
        }
        check(unconfiguredRejected, "request cannot bind before configuration");

        KdcanTransportSession.Snapshot configured =
                s.markConfigured("session-1234567890123456", bound.epoch);
        check(configured.configured, "configuration state recorded");
        check("PORT_CONFIGURED".equals(configured.stage), "configured stage");

        KdcanTransportSession.Snapshot req =
                s.bindRequest("session-1234567890123456", bound.epoch, "request-0001");
        check(req.requestBound, "one request token bound");

        LegacyEvidenceCorrelation.Result correlated = s.correlate(
                "session-1234567890123456", bound.epoch, "request-0001",
                reply(), "ME7.2");
        check(correlated.correlated, "response correlated");
        check(correlated.moduleIdentityEligible, "module identity candidate");
        check(!correlated.ecuVerified && !correlated.writesEnabled, "still not ECU verified");
        check(!s.snapshot().requestBound, "request token consumed");

        boolean replayBlocked = false;
        try {
            LegacyEvidenceCorrelation.Result replay = s.correlate(
                    "session-1234567890123456", bound.epoch, "request-0001",
                    reply(), "ME7.2");
            replayBlocked = !replay.correlated;
        } catch (RuntimeException expected) {
            replayBlocked = true;
        }
        check(replayBlocked, "replay cannot inherit prior token");

        s.bindRequest("session-1234567890123456", bound.epoch, "request-0002");
        KdcanTransportSession.Snapshot disconnected = s.disconnect();
        check(!disconnected.active, "disconnect invalidates session");
        check("DISCONNECTED".equals(disconnected.stage), "disconnect stage");
        check(!disconnected.portOpen && !disconnected.configured && !disconnected.requestBound,
                "disconnect purges state");

        KdcanTransportSession.Snapshot rebound =
                s.begin("session-abcdefghijklmnop", 0x0403, 0x6001, "FTDI");
        check(rebound.epoch == 2L, "reconnect increments epoch");
        boolean staleEpochRejected = false;
        try {
            s.markPortOpen("session-abcdefghijklmnop", 1L);
        } catch (IllegalArgumentException expected) {
            staleEpochRejected = true;
        }
        check(staleEpochRejected, "old epoch rejected");

        s.markPortOpen("session-abcdefghijklmnop", rebound.epoch);
        now[0] = 2001L;
        KdcanTransportSession.Snapshot expired = s.snapshot();
        check(!expired.active, "watchdog expires stale session");
        check("SESSION_EXPIRED".equals(expired.stage), "expiry stage");
        check(!expired.ecuVerified && !expired.writesEnabled, "expiry remains safe");

        boolean badUsbRejected = false;
        try {
            s.begin("session-qrstuvwxyz12345", -1, 0x6001, "FTDI");
        } catch (IllegalArgumentException expected) {
            badUsbRejected = true;
        }
        check(badUsbRejected, "invalid USB identity rejected");

        KdcanTransportSession.Snapshot unknown =
                s.begin("session-qrstuvwxyz12345", 0x1234, 0x5678, "MYSTERY");
        check("UNKNOWN".equals(unknown.driverFamily), "unknown family never guessed");

        System.out.println("PASS: K+DCAN transport session watchdog, epoch and replay gates");
    }
}
