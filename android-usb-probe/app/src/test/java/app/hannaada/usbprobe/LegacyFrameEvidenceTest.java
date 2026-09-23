package app.hannaada.usbprobe;

public final class LegacyFrameEvidenceTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        byte[] ds2 = new byte[] { 0x12, 0x04, 0x00, 0x16 };
        LegacyFrameEvidence.Result d = LegacyFrameEvidence.parseDs2(ds2);
        check(d.valid, "valid DS2 candidate accepted");
        check(d.checksumValid, "DS2 checksum");
        check(d.address == 0x12, "DS2 address");
        check(!d.ecuVerified, "DS2 frame never verifies ECU");

        byte[] ds2Bad = new byte[] { 0x12, 0x04, 0x00, 0x17 };
        check(!LegacyFrameEvidence.parseDs2(ds2Bad).valid, "bad DS2 checksum rejected");
        check(!LegacyFrameEvidence.parseDs2(new byte[] {0x12, 0x05, 0x00, 0x17}).valid,
                "bad DS2 length rejected");

        byte[] kwpReply = new byte[] {
                (byte)0xB8, (byte)0xF1, 0x12, 0x05, 0x62, 0x40, 0x07, 0x01, (byte)0x90, (byte)0xEA
        };
        LegacyFrameEvidence.Result k = LegacyFrameEvidence.parseKwp(kwpReply);
        check(k.valid, "valid KWP candidate accepted");
        check(k.checksumValid, "KWP checksum");
        check(k.source == 0x12 && k.destination == 0xF1, "KWP endpoints");
        check("possible-reply".equals(k.directionHint), "KWP direction is only a hint");
        check(!k.ecuVerified, "KWP candidate never verifies ECU");

        byte[] kwpEcho = new byte[] {(byte)0xB8, 0x12, (byte)0xF1, 0x01, (byte)0xA2, (byte)0xFA};
        LegacyFrameEvidence.Result e = LegacyFrameEvidence.parseKwp(kwpEcho);
        check(e.valid, "valid KWP echo candidate accepted");
        check("possible-echo".equals(e.directionHint), "echo not confused with response");
        check(!e.ecuVerified, "echo cannot verify ECU");

        byte[] badHeader = new byte[] {(byte)0xB7, (byte)0xF1, 0x12, 0x00, 0x54};
        check(!LegacyFrameEvidence.parseKwp(badHeader).valid, "wrong KWP header rejected");

        byte[] badChecksum = kwpReply.clone();
        badChecksum[badChecksum.length - 1] ^= 0x01;
        check(!LegacyFrameEvidence.parseKwp(badChecksum).valid, "bad KWP checksum rejected");

        check(!LegacyFrameEvidence.parseDs2(null).valid, "null DS2 rejected");
        check(!LegacyFrameEvidence.parseKwp(null).valid, "null KWP rejected");

        System.out.println("PASS: legacy DS2/KWP evidence parser remains read-only and fail-closed");
    }
}
