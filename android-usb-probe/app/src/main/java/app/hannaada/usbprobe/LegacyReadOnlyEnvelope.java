package app.hannaada.usbprobe;

import java.io.ByteArrayOutputStream;

/**
 * Read-only receive envelope for one already-bound legacy diagnostic request.
 *
 * This class owns NO serial port and has NO transmit API. It only buffers a
 * bounded response candidate and feeds it into the existing passive parser and
 * correlation gate.
 */
public final class LegacyReadOnlyEnvelope {
    public interface Clock { long nowMillis(); }

    public static final class Result {
        public final boolean finished;
        public final boolean accepted;
        public final String stage;
        public final int receivedBytes;
        public final boolean moduleIdentityEligible;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Result(boolean finished, boolean accepted, String stage, int receivedBytes,
                       boolean moduleIdentityEligible) {
            this.finished = finished;
            this.accepted = accepted;
            this.stage = stage;
            this.receivedBytes = receivedBytes;
            this.moduleIdentityEligible = moduleIdentityEligible;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    private final KdcanTransportSession session;
    private final String sessionId;
    private final long epoch;
    private final String requestId;
    private final String protocol;
    private final int maxResponseBytes;
    private final long deadlineAt;
    private final Clock clock;
    private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    private boolean terminal;
    private String terminalStage = "RECEIVING";

    private LegacyReadOnlyEnvelope(KdcanTransportSession session, String sessionId, long epoch,
                                   String requestId, String protocol, int maxResponseBytes,
                                   long timeoutMs, Clock clock) {
        this.session = session;
        this.sessionId = sessionId;
        this.epoch = epoch;
        this.requestId = requestId;
        this.protocol = protocol;
        this.maxResponseBytes = maxResponseBytes;
        this.clock = clock;
        long now = safeNow();
        if (timeoutMs < 50L || timeoutMs > 30000L) {
            throw new IllegalArgumentException("Invalid timeout");
        }
        if (now > Long.MAX_VALUE - timeoutMs) throw new IllegalArgumentException("Deadline overflow");
        this.deadlineAt = now + timeoutMs;
        session.bindRequest(sessionId, epoch, requestId);
    }

    public static LegacyReadOnlyEnvelope open(KdcanTransportSession session,
                                              String sessionId,
                                              long epoch,
                                              String requestId,
                                              String protocol,
                                              int maxResponseBytes,
                                              long timeoutMs,
                                              Clock clock) {
        if (session == null) throw new IllegalArgumentException("Session required");
        if (clock == null) throw new IllegalArgumentException("Clock required");
        if (!"DS2".equals(protocol) && !"KWP".equals(protocol)) {
            throw new IllegalArgumentException("Unsupported protocol");
        }
        int protocolMax = "DS2".equals(protocol) ? 255 : 197;
        if (maxResponseBytes < 4 || maxResponseBytes > protocolMax) {
            throw new IllegalArgumentException("Invalid response limit");
        }
        return new LegacyReadOnlyEnvelope(session, sessionId, epoch, requestId, protocol,
                maxResponseBytes, timeoutMs, clock);
    }

    public synchronized Result accept(byte[] chunk) {
        if (terminal) return result(true, false, terminalStage, false);
        if (expired()) return abort("TIMEOUT", "REQUEST_TIMEOUT");
        if (chunk == null || chunk.length == 0) {
            return result(false, true, "RECEIVING", false);
        }
        if (buffer.size() > maxResponseBytes - chunk.length) {
            buffer.reset();
            return abort("OVERFLOW", "RESPONSE_OVERFLOW");
        }
        buffer.write(chunk, 0, chunk.length);
        return result(false, true, "RECEIVING", false);
    }

    public synchronized Result finish(String responseRequestId, String moduleIdentity) {
        if (terminal) return result(true, false, terminalStage, false);
        if (expired()) return abort("TIMEOUT", "REQUEST_TIMEOUT");

        byte[] response = buffer.toByteArray();
        LegacyFrameEvidence.Result frame = "DS2".equals(protocol)
                ? LegacyFrameEvidence.parseDs2(response)
                : LegacyFrameEvidence.parseKwp(response);

        if (!frame.valid || !frame.checksumValid) {
            buffer.reset();
            return abort("PROTOCOL", "PROTOCOL_REJECTED");
        }

        LegacyEvidenceCorrelation.Result correlated = session.correlate(
                sessionId, epoch, responseRequestId, frame, moduleIdentity);
        terminal = true;
        terminalStage = correlated.stage;
        buffer.reset();
        return result(true, correlated.correlated, correlated.stage,
                correlated.moduleIdentityEligible);
    }

    public synchronized Result cancel() {
        if (terminal) return result(true, false, terminalStage, false);
        buffer.reset();
        return abort("CANCELLED", "REQUEST_CANCELLED");
    }

    public synchronized Result status() {
        if (!terminal && expired()) return abort("TIMEOUT", "REQUEST_TIMEOUT");
        return result(terminal, !terminal, terminalStage, false);
    }

    private Result abort(String reason, String stage) {
        if (!terminal) {
            try {
                session.abortRequest(sessionId, epoch, reason);
            } catch (RuntimeException ignored) {
                // The session controller remains authoritative. The envelope still
                // becomes terminal and cannot be reused.
            }
        }
        terminal = true;
        terminalStage = stage;
        buffer.reset();
        return result(true, false, stage, false);
    }

    private boolean expired() {
        long now = safeNow();
        return now > deadlineAt;
    }

    private long safeNow() {
        long value = clock.nowMillis();
        if (value < 0L) throw new IllegalStateException("Invalid clock");
        return value;
    }

    private Result result(boolean finished, boolean accepted, String stage,
                          boolean moduleIdentityEligible) {
        return new Result(finished, accepted, stage, buffer.size(), moduleIdentityEligible);
    }
}
