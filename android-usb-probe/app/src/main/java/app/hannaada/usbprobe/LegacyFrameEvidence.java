package app.hannaada.usbprobe;

/**
 * Pure Java evidence parser for legacy BMW receive frames.
 *
 * IMPORTANT:
 * - no USB access
 * - no serial writes
 * - no ECU requests
 * - a structurally valid frame is still NOT proof of a real ECU response
 */
public final class LegacyFrameEvidence {
    private LegacyFrameEvidence() { }

    public static final class Result {
        public final boolean valid;
        public final String protocol;
        public final boolean checksumValid;
        public final int length;
        public final int address;
        public final int source;
        public final int destination;
        public final String directionHint;
        public final boolean ecuVerified;

        private Result(boolean valid, String protocol, boolean checksumValid, int length,
                       int address, int source, int destination, String directionHint) {
            this.valid = valid;
            this.protocol = protocol;
            this.checksumValid = checksumValid;
            this.length = length;
            this.address = address;
            this.source = source;
            this.destination = destination;
            this.directionHint = directionHint;
            this.ecuVerified = false;
        }
    }

    public static Result parseDs2(byte[] frame) {
        if (frame == null || frame.length < 4 || frame.length > 255) {
            return invalid("DS2");
        }
        int declaredLength = u8(frame[1]);
        if (declaredLength != frame.length) return invalid("DS2");
        boolean checksum = xor(frame, frame.length - 1) == u8(frame[frame.length - 1]);
        if (!checksum) return invalid("DS2");
        return new Result(true, "DS2", true, frame.length, u8(frame[0]),
                -1, -1, "unverified");
    }

    public static Result parseKwp(byte[] frame) {
        if (frame == null || frame.length < 5 || frame.length > 197) {
            return invalid("KWP");
        }
        if (u8(frame[0]) != 0xB8) return invalid("KWP");
        int payloadLength = u8(frame[3]);
        if (payloadLength > 192 || payloadLength + 5 != frame.length) return invalid("KWP");
        boolean checksum = xor(frame, frame.length - 1) == u8(frame[frame.length - 1]);
        if (!checksum) return invalid("KWP");
        int destination = u8(frame[1]);
        int source = u8(frame[2]);
        String direction = source == 0x12 && destination == 0xF1 ? "possible-reply"
                : source == 0xF1 && destination == 0x12 ? "possible-echo"
                : "unknown";
        return new Result(true, "KWP", true, frame.length, -1,
                source, destination, direction);
    }

    private static Result invalid(String protocol) {
        return new Result(false, protocol, false, 0, -1, -1, -1, "invalid");
    }

    private static int xor(byte[] data, int endExclusive) {
        int value = 0;
        for (int i = 0; i < endExclusive; i++) value ^= u8(data[i]);
        return value & 0xFF;
    }

    private static int u8(byte value) {
        return value & 0xFF;
    }
}
