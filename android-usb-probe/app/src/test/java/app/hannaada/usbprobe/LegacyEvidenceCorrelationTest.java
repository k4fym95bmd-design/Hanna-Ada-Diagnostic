package app.hannaada.usbprobe;

public final class LegacyEvidenceCorrelationTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static LegacyFrameEvidence.Result reply() {
        byte[] frame = new byte[] {
                (byte)0xB8, (byte)0xF1, 0x12, 0x05,
                0x62, 0x40, 0x07, 0x01, (byte)0x90, (byte)0xEA
        };
        return LegacyFrameEvidence.parseKwp(frame);
    }

    public static void main(String[] args) {
        String session = "session-1234567890123456";
        String req = "request-0001";

        LegacyEvidenceCorrelation.Result ok = LegacyEvidenceCorrelation.assess(
                session, session, 7, 7, true, true,
                req, req, reply(), "ME7.2");
        check(ok.correlated, "fresh session and response are correlated");
        check(ok.moduleIdentityEligible, "sanitized identity candidate accepted");
        check("CORRELATED_IDENTITY_CANDIDATE".equals(ok.stage), "identity stage");
        check(!ok.ecuVerified, "correlation is not ECU verification");
        check(!ok.writesEnabled, "writes remain disabled");

        check("SESSION_MISMATCH".equals(LegacyEvidenceCorrelation.assess(
                session, "other-session-123456789", 7, 7, true, true,
                req, req, reply(), "ME7.2").stage), "stale session rejected");

        check("STALE_EPOCH".equals(LegacyEvidenceCorrelation.assess(
                session, session, 7, 6, true, true,
                req, req, reply(), "ME7.2").stage), "stale epoch rejected");

        check("TRANSPORT_NOT_READY".equals(LegacyEvidenceCorrelation.assess(
                session, session, 7, 7, true, false,
                req, req, reply(), "ME7.2").stage), "closed port rejected");

        check("REQUEST_MISMATCH".equals(LegacyEvidenceCorrelation.assess(
                session, session, 7, 7, true, true,
                req, "request-0002", reply(), "ME7.2").stage), "wrong response binding rejected");

        byte[] echoBytes = new byte[] {
                (byte)0xB8, 0x12, (byte)0xF1, 0x01, (byte)0xA2, (byte)0xF8
        };
        LegacyFrameEvidence.Result echo = LegacyFrameEvidence.parseKwp(echoBytes);
        check("ECHO_REJECTED".equals(LegacyEvidenceCorrelation.assess(
                session, session, 7, 7, true, true,
                req, req, echo, "ME7.2").stage), "adapter echo rejected");

        LegacyEvidenceCorrelation.Result noId = LegacyEvidenceCorrelation.assess(
                session, session, 7, 7, true, true,
                req, req, reply(), "ME 7.2");
        check(noId.correlated, "frame may correlate without module identity");
        check(!noId.moduleIdentityEligible, "unsafe identity is not promoted");
        check("CORRELATED_NO_IDENTITY".equals(noId.stage), "no identity stage");
        check(!noId.ecuVerified, "still no ECU verification");

        System.out.println("PASS: legacy correlation gate rejects stale, echo and mismatched evidence");
    }
}
