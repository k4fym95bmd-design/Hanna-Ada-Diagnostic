package app.hannaada.usbprobe;

/**
 * Deterministic fault-injection sequence test.
 * It deliberately performs legal and illegal state transitions and checks that
 * unsafe state can never be promoted.
 */
public final class KdcanTransportFaultTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static LegacyFrameEvidence.Result reply() {
        return LegacyFrameEvidence.parseKwp(new byte[] {
                (byte)0xB8, (byte)0xF1, 0x12, 0x05,
                0x62, 0x40, 0x07, 0x01, (byte)0x90, (byte)0xEA
        });
    }

    private static long next(long x) {
        return (x * 6364136223846793005L + 1442695040888963407L);
    }

    public static void main(String[] args) {
        final long[] now = new long[] { 1000L };
        KdcanTransportSession session = new KdcanTransportSession(
                new KdcanTransportSession.Clock() {
                    @Override public long nowMillis() { return now[0]; }
                }, 5000L);

        long rnd = 0x5A17C0DEL;
        long lastEpoch = 0L;
        String activeSession = null;

        for (int i = 0; i < 1500; i++) {
            rnd = next(rnd);
            int action = (int)((rnd >>> 16) & 7L);

            KdcanTransportSession.Snapshot before = session.snapshot();

            try {
                switch (action) {
                    case 0: {
                        activeSession = "fault-session-" + String.format("%020d", i);
                        KdcanTransportSession.Snapshot s =
                                session.begin(activeSession, 0x0403, 0x6001, "FTDI");
                        check(s.epoch > lastEpoch || (lastEpoch == Long.MAX_VALUE && s.epoch == 1L),
                                "epoch must advance on begin");
                        lastEpoch = s.epoch;
                        break;
                    }
                    case 1:
                        if (activeSession != null) session.markPortOpen(activeSession, lastEpoch);
                        break;
                    case 2:
                        if (activeSession != null) {
                            session.bindRequest(activeSession, lastEpoch,
                                    "req-" + String.format("%08d", i));
                        }
                        break;
                    case 3:
                        if (activeSession != null) {
                            session.correlate(activeSession, lastEpoch,
                                    "req-" + String.format("%08d", i),
                                    reply(), "ME7.2");
                        }
                        break;
                    case 4:
                        session.disconnect();
                        activeSession = null;
                        break;
                    case 5:
                        now[0] += 6000L;
                        break;
                    case 6:
                        if (activeSession != null) {
                            // Deliberately stale epoch.
                            session.markPortOpen(activeSession, Math.max(0L, lastEpoch - 1L));
                        }
                        break;
                    default:
                        if (activeSession != null) {
                            // Deliberately wrong session id.
                            session.bindRequest("wrong-session-00000000000000", lastEpoch,
                                    "req-bad-" + String.format("%08d", i));
                        }
                        break;
                }
            } catch (RuntimeException expectedForIllegalTransition) {
                // Illegal transitions are expected in this fault-injection test.
            }

            KdcanTransportSession.Snapshot after = session.snapshot();
            check(!after.ecuVerified, "fault injection must never verify ECU");
            check(!after.writesEnabled, "fault injection must never enable writes");
            if (!after.active) {
                check(!after.portOpen, "inactive session cannot keep port-open state");
                check(!after.requestBound, "inactive session cannot keep request token");
            }
            if (before.active && !after.active) activeSession = null;
        }

        session.disconnect();
        KdcanTransportSession.Snapshot finalState = session.snapshot();
        check(!finalState.active && !finalState.portOpen && !finalState.requestBound,
                "final disconnect must purge all state");
        check(!finalState.ecuVerified && !finalState.writesEnabled,
                "final state stays fail-closed");

        System.out.println("PASS: 1500-step K+DCAN deterministic fault injection");
    }
}
