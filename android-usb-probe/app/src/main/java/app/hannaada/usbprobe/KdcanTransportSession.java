package app.hannaada.usbprobe;

/**
 * Fail-closed transport session controller for the Android K+DCAN path.
 *
 * It owns session/epoch freshness and one pending request correlation token.
 * It never opens USB, writes serial bytes, verifies an ECU, clears DTCs,
 * codes modules, actuates hardware or flashes firmware.
 */
public final class KdcanTransportSession {
    public interface Clock { long nowMillis(); }

    public static final class Snapshot {
        public final boolean active;
        public final String stage;
        public final long epoch;
        public final String driverFamily;
        public final boolean portOpen;
        public final boolean configured;
        public final boolean requestBound;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Snapshot(boolean active, String stage, long epoch, String driverFamily,
                         boolean portOpen, boolean configured, boolean requestBound) {
            this.active = active;
            this.stage = stage;
            this.epoch = epoch;
            this.driverFamily = driverFamily;
            this.portOpen = portOpen;
            this.configured = configured;
            this.requestBound = requestBound;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    private final Clock clock;
    private final long ttlMs;
    private long epoch;
    private String sessionId;
    private String driverFamily = "UNKNOWN";
    private int vendorId = -1;
    private int productId = -1;
    private boolean active;
    private boolean portOpen;
    private boolean configured;
    private long lastSeenAt;
    private String pendingRequestId;
    private String terminalStage = "IDLE";

    public KdcanTransportSession() {
        this(new Clock() {
            @Override public long nowMillis() { return System.currentTimeMillis(); }
        }, 120000L);
    }

    public KdcanTransportSession(Clock clock, long ttlMs) {
        if (clock == null) throw new IllegalArgumentException("Clock required");
        if (ttlMs < 1000L || ttlMs > 3600000L) throw new IllegalArgumentException("Invalid TTL");
        this.clock = clock;
        this.ttlMs = ttlMs;
    }

    public synchronized Snapshot begin(String newSessionId, int newVendorId, int newProductId,
                                       String newDriverFamily) {
        if (!validSession(newSessionId)) throw new IllegalArgumentException("Invalid session id");
        if (!validUsbId(newVendorId) || !validUsbId(newProductId)) {
            throw new IllegalArgumentException("Invalid USB identity");
        }
        String family = normalizeFamily(newDriverFamily);
        epoch = epoch == Long.MAX_VALUE ? 1L : epoch + 1L;
        sessionId = newSessionId;
        vendorId = newVendorId;
        productId = newProductId;
        driverFamily = family;
        active = true;
        portOpen = false;
        configured = false;
        pendingRequestId = null;
        lastSeenAt = safeNow();
        terminalStage = "BOUND";
        return snapshot();
    }

    public synchronized Snapshot markPortOpen(String expectedSessionId, long expectedEpoch) {
        requireFresh(expectedSessionId, expectedEpoch);
        portOpen = true;
        configured = false;
        pendingRequestId = null;
        lastSeenAt = safeNow();
        terminalStage = "PORT_OPEN";
        return snapshot();
    }

    public synchronized Snapshot markConfigured(String expectedSessionId, long expectedEpoch) {
        requireFresh(expectedSessionId, expectedEpoch);
        if (!portOpen) throw new IllegalStateException("Port is not open");
        if (pendingRequestId != null) throw new IllegalStateException("Request already bound");
        configured = true;
        lastSeenAt = safeNow();
        terminalStage = "PORT_CONFIGURED";
        return snapshot();
    }

    public synchronized Snapshot bindRequest(String expectedSessionId, long expectedEpoch,
                                             String requestId) {
        requireFresh(expectedSessionId, expectedEpoch);
        if (!portOpen) throw new IllegalStateException("Port is not open");
        if (!configured) throw new IllegalStateException("Port is not configured");
        if (!validRequestId(requestId)) throw new IllegalArgumentException("Invalid request id");
        if (pendingRequestId != null) throw new IllegalStateException("Request already bound");
        pendingRequestId = requestId;
        lastSeenAt = safeNow();
        terminalStage = "REQUEST_BOUND";
        return snapshot();
    }

    public synchronized Snapshot abortRequest(String expectedSessionId, long expectedEpoch,
                                              String reason) {
        requireFresh(expectedSessionId, expectedEpoch);
        if (pendingRequestId == null) throw new IllegalStateException("No request bound");
        String stage;
        if ("TIMEOUT".equals(reason)) stage = "REQUEST_TIMEOUT";
        else if ("OVERFLOW".equals(reason)) stage = "RESPONSE_OVERFLOW";
        else if ("PROTOCOL".equals(reason)) stage = "PROTOCOL_REJECTED";
        else if ("CANCELLED".equals(reason)) stage = "REQUEST_CANCELLED";
        else throw new IllegalArgumentException("Invalid abort reason");
        pendingRequestId = null;
        lastSeenAt = safeNow();
        terminalStage = stage;
        return snapshot();
    }

    public synchronized LegacyEvidenceCorrelation.Result correlate(
            String expectedSessionId, long expectedEpoch, String responseRequestId,
            LegacyFrameEvidence.Result frame, String moduleIdentity) {
        requireFresh(expectedSessionId, expectedEpoch);
        String expectedRequest = pendingRequestId;
        // One response attempt consumes the token. This prevents replay/retry from
        // accidentally inheriting evidence from a prior response.
        pendingRequestId = null;
        lastSeenAt = safeNow();
        if (expectedRequest == null) {
            terminalStage = "NO_REQUEST";
            return LegacyEvidenceCorrelation.assess(
                    sessionId, sessionId, epoch, epoch, true, portOpen,
                    "missing-request", responseRequestId, frame, moduleIdentity);
        }
        LegacyEvidenceCorrelation.Result result = LegacyEvidenceCorrelation.assess(
                sessionId, expectedSessionId, epoch, expectedEpoch, true, portOpen,
                expectedRequest, responseRequestId, frame, moduleIdentity);
        terminalStage = result.stage;
        return result;
    }

    public synchronized Snapshot markPortClosed(String expectedSessionId, long expectedEpoch) {
        requireFresh(expectedSessionId, expectedEpoch);
        portOpen = false;
        configured = false;
        pendingRequestId = null;
        lastSeenAt = safeNow();
        terminalStage = "PORT_CLOSED";
        return snapshot();
    }

    public synchronized Snapshot disconnect() {
        invalidate("DISCONNECTED");
        return snapshot();
    }

    public synchronized Snapshot end() {
        invalidate("ENDED");
        return snapshot();
    }

    public synchronized Snapshot snapshot() {
        expireIfNeeded();
        if (!active) {
            return new Snapshot(false, terminalStage, epoch, driverFamily, false, false, false);
        }
        String stage = pendingRequestId != null ? "REQUEST_BOUND"
                : configured ? "PORT_CONFIGURED"
                : portOpen ? "PORT_OPEN" : "BOUND";
        if (!"BOUND".equals(terminalStage) && !"PORT_OPEN".equals(terminalStage)
                && !"PORT_CONFIGURED".equals(terminalStage)
                && !"REQUEST_BOUND".equals(terminalStage)) {
            stage = terminalStage;
        }
        return new Snapshot(true, stage, epoch, driverFamily, portOpen, configured,
                pendingRequestId != null);
    }

    private void requireFresh(String expectedSessionId, long expectedEpoch) {
        expireIfNeeded();
        if (!active) throw new IllegalStateException("No active session");
        if (!sessionId.equals(expectedSessionId)) throw new IllegalArgumentException("Session mismatch");
        if (epoch != expectedEpoch) throw new IllegalArgumentException("Epoch mismatch");
    }

    private void expireIfNeeded() {
        if (!active) return;
        long now = safeNow();
        long age = now - lastSeenAt;
        if (age < 0 || age > ttlMs) invalidate("SESSION_EXPIRED");
    }

    private void invalidate(String stage) {
        active = false;
        portOpen = false;
        configured = false;
        pendingRequestId = null;
        sessionId = null;
        vendorId = -1;
        productId = -1;
        terminalStage = stage;
    }

    private long safeNow() {
        long value = clock.nowMillis();
        if (value < 0) throw new IllegalStateException("Invalid clock");
        return value;
    }

    private static boolean validUsbId(int value) {
        return value >= 0 && value <= 0xFFFF;
    }

    private static boolean validSession(String value) {
        return value != null && value.length() >= 16 && value.length() <= 128;
    }

    private static boolean validRequestId(String value) {
        return value != null && value.length() >= 8 && value.length() <= 128;
    }

    private static String normalizeFamily(String value) {
        if ("FTDI".equals(value) || "CP210X".equals(value) || "CH34X".equals(value)
                || "PL2303".equals(value) || "CDC-ACM".equals(value)) return value;
        return "UNKNOWN";
    }
}
