package app.hannaada.usbprobe;

/** Shared stage vocabulary mirrored from public/evidence-contract.js. */
public final class UnifiedEvidenceContract {
    public static final int VERSION = 1;
    public static final String NO_CABLE = "NO_CABLE";
    public static final String USB_SEEN = "USB_SEEN";
    public static final String HARDWARE_BOUND = "HARDWARE_BOUND";
    public static final String PORT_OPEN = "PORT_OPEN";
    public static final String RX_ACTIVITY = "RX_ACTIVITY";
    public static final String FRAME_CANDIDATE = "FRAME_CANDIDATE";
    public static final String READ_ONLY_IDENTITY_VERIFIED = "READ_ONLY_IDENTITY_VERIFIED";

    private UnifiedEvidenceContract() { }

    public static String transportStage(boolean active, boolean portOpen) {
        if (!active) return NO_CABLE;
        return portOpen ? PORT_OPEN : HARDWARE_BOUND;
    }
}
