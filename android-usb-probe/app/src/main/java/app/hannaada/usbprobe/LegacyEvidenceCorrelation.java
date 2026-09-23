package app.hannaada.usbprobe;

/**
 * Stateless correlation gate between a physical transport session and one
 * structurally valid legacy response candidate.
 *
 * This class still does NOT verify an ECU. It only decides whether evidence
 * is correlated strongly enough to be considered for a later module-identity
 * verifier.
 */
public final class LegacyEvidenceCorrelation {
    private LegacyEvidenceCorrelation() { }

    public static final class Result {
        public final boolean correlated;
        public final boolean moduleIdentityEligible;
        public final String stage;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Result(boolean correlated, boolean moduleIdentityEligible, String stage) {
            this.correlated = correlated;
            this.moduleIdentityEligible = moduleIdentityEligible;
            this.stage = stage;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    public static Result assess(String expectedSessionId, String actualSessionId,
                                long expectedEpoch, long actualEpoch,
                                boolean usbSessionBound, boolean portOpen,
                                String requestId, String responseRequestId,
                                LegacyFrameEvidence.Result frame,
                                String moduleIdentity) {
        if (!validSession(expectedSessionId) || !expectedSessionId.equals(actualSessionId)) {
            return blocked("SESSION_MISMATCH");
        }
        if (expectedEpoch < 0 || expectedEpoch != actualEpoch) {
            return blocked("STALE_EPOCH");
        }
        if (!usbSessionBound || !portOpen) {
            return blocked("TRANSPORT_NOT_READY");
        }
        if (!validRequestId(requestId) || !requestId.equals(responseRequestId)) {
            return blocked("REQUEST_MISMATCH");
        }
        if (frame == null || !frame.valid || !frame.checksumValid) {
            return blocked("FRAME_INVALID");
        }
        if ("possible-echo".equals(frame.directionHint)) {
            return blocked("ECHO_REJECTED");
        }
        if (!validIdentity(moduleIdentity)) {
            return new Result(true, false, "CORRELATED_NO_IDENTITY");
        }
        return new Result(true, true, "CORRELATED_IDENTITY_CANDIDATE");
    }

    private static Result blocked(String stage) {
        return new Result(false, false, stage);
    }

    private static boolean validSession(String value) {
        return value != null && value.length() >= 16 && value.length() <= 128;
    }

    private static boolean validRequestId(String value) {
        return value != null && value.length() >= 8 && value.length() <= 128;
    }

    private static boolean validIdentity(String value) {
        if (value == null) return false;
        String trimmed = value.trim();
        if (trimmed.length() < 2 || trimmed.length() > 64) return false;
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            boolean ok = c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z'
                    || c >= '0' && c <= '9' || c == '.' || c == '_' || c == '-';
            if (!ok) return false;
        }
        return true;
    }
}
