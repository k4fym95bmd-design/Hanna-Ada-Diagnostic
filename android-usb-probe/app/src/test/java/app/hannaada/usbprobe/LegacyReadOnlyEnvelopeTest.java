package app.hannaada.usbprobe;

public final class LegacyReadOnlyEnvelopeTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static KdcanTransportSession ready(final long[] now, String id) {
        KdcanTransportSession s = new KdcanTransportSession(
                new KdcanTransportSession.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                }, 10000L);
        KdcanTransportSession.Snapshot b = s.begin(id, 0x0403, 0x6001, "FTDI");
        s.markPortOpen(id, b.epoch);
        s.markConfigured(id, b.epoch);
        return s;
    }

    public static void main(String[] args) {
        final long[] now = new long[] { 1000L };
        String sessionId = "session-envelope-1234567890";
        KdcanTransportSession s = ready(now, sessionId);
        long epoch = s.snapshot().epoch;

        LegacyReadOnlyEnvelope e = LegacyReadOnlyEnvelope.open(
                s, sessionId, epoch, "request-env-0001", "KWP", 64, 500L,
                new LegacyReadOnlyEnvelope.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                });
        check(s.snapshot().requestBound, "envelope binds exactly one request token");

        byte[] frame = new byte[] {
                (byte)0xB8, (byte)0xF1, 0x12, 0x05,
                0x62, 0x40, 0x07, 0x01, (byte)0x90, (byte)0xEA
        };
        check(e.accept(new byte[] {(byte)0xB8, (byte)0xF1, 0x12, 0x05}).accepted,
                "first chunk accepted");
        check(e.accept(new byte[] {0x62, 0x40, 0x07, 0x01, (byte)0x90, (byte)0xEA}).accepted,
                "second chunk accepted");
        LegacyReadOnlyEnvelope.Result ok = e.finish("request-env-0001", "ME7.2");
        check(ok.finished && ok.accepted, "valid response correlated");
        check(ok.moduleIdentityEligible, "identity candidate promoted");
        check(!ok.ecuVerified && !ok.writesEnabled, "still read-only and unverified");
        check(!s.snapshot().requestBound, "request token consumed after finish");

        String timeoutSession = "session-envelope-timeout-123";
        KdcanTransportSession t = ready(now, timeoutSession);
        long timeoutEpoch = t.snapshot().epoch;
        LegacyReadOnlyEnvelope timeout = LegacyReadOnlyEnvelope.open(
                t, timeoutSession, timeoutEpoch, "request-timeout-1", "DS2", 32, 100L,
                new LegacyReadOnlyEnvelope.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                });
        now[0] += 101L;
        LegacyReadOnlyEnvelope.Result timed = timeout.status();
        check(timed.finished && !timed.accepted, "timeout becomes terminal");
        check("REQUEST_TIMEOUT".equals(timed.stage), "timeout stage");
        check(!t.snapshot().requestBound, "timeout releases request token");

        String overflowSession = "session-envelope-overflow-12";
        KdcanTransportSession o = ready(now, overflowSession);
        LegacyReadOnlyEnvelope overflow = LegacyReadOnlyEnvelope.open(
                o, overflowSession, o.snapshot().epoch, "request-overflow", "DS2", 8, 500L,
                new LegacyReadOnlyEnvelope.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                });
        LegacyReadOnlyEnvelope.Result over = overflow.accept(new byte[9]);
        check(over.finished && "RESPONSE_OVERFLOW".equals(over.stage), "overflow blocked");
        check(!o.snapshot().requestBound, "overflow releases request token");

        String badSession = "session-envelope-badframe-12";
        KdcanTransportSession b = ready(now, badSession);
        LegacyReadOnlyEnvelope bad = LegacyReadOnlyEnvelope.open(
                b, badSession, b.snapshot().epoch, "request-badframe", "DS2", 32, 500L,
                new LegacyReadOnlyEnvelope.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                });
        bad.accept(new byte[] {0x12, 0x04, 0x00, 0x17});
        LegacyReadOnlyEnvelope.Result rejected = bad.finish("request-badframe", "DME");
        check(rejected.finished && !rejected.accepted, "bad checksum rejected");
        check("PROTOCOL_REJECTED".equals(rejected.stage), "protocol reject stage");
        check(!b.snapshot().requestBound, "bad frame releases token");

        boolean unconfiguredRejected = false;
        try {
            KdcanTransportSession u = new KdcanTransportSession(
                    new KdcanTransportSession.Clock() {
                        @Override public long nowMillis() { return now[0]; }
                    }, 10000L);
            String id = "session-envelope-unconfigured";
            KdcanTransportSession.Snapshot ub = u.begin(id, 0x0403, 0x6001, "FTDI");
            u.markPortOpen(id, ub.epoch);
            LegacyReadOnlyEnvelope.open(
                    u, id, ub.epoch, "request-no-config", "KWP", 64, 500L,
                    new LegacyReadOnlyEnvelope.Clock() {
                        @Override public long nowMillis() { return now[0]; }
                    });
        } catch (IllegalStateException expected) {
            unconfiguredRejected = true;
        }
        check(unconfiguredRejected, "envelope cannot open before PORT_CONFIGURED");

        System.out.println("PASS: read-only envelope bounds timeout, size and correlation");
    }
}
