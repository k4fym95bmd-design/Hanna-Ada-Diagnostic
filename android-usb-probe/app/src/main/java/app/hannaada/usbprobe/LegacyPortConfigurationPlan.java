package app.hannaada.usbprobe;

/**
 * Binds a resolved legacy serial profile to one fresh K+DCAN transport epoch.
 *
 * This class creates a configuration PLAN only. It does not call setParameters,
 * manipulate DTR, read, write or transmit to a vehicle.
 */
public final class LegacyPortConfigurationPlan {
    public static final class Result {
        public final boolean ready;
        public final String stage;
        public final long epoch;
        public final String protocol;
        public final int baudRate;
        public final String parity;
        public final boolean sendDtr;
        public final boolean applied;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Result(boolean ready, String stage, long epoch, String protocol,
                       int baudRate, String parity, boolean sendDtr) {
            this.ready = ready;
            this.stage = stage;
            this.epoch = epoch;
            this.protocol = protocol;
            this.baudRate = baudRate;
            this.parity = parity;
            this.sendDtr = sendDtr;
            this.applied = false;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    private LegacyPortConfigurationPlan() { }

    public static Result build(KdcanTransportSession.Snapshot session,
                               long expectedEpoch,
                               LegacySerialProfile.Profile profile,
                               LegacySerialProfile.Resolution resolution) {
        if (session == null || !session.active) return blocked("SESSION_INACTIVE");
        if (session.epoch != expectedEpoch) return blocked("STALE_EPOCH");
        if (!session.portOpen) return blocked("PORT_NOT_OPEN");
        if (session.requestBound) return blocked("REQUEST_ALREADY_BOUND");
        if (profile == null) return blocked("PROFILE_MISSING");
        if (resolution == null || !resolution.valid) return blocked("PROFILE_UNRESOLVED");
        if (!profile.parity.equals(resolution.parity)) return blocked("PARITY_MISMATCH");
        if (resolution.baudRate <= 0) return blocked("BAUD_INVALID");

        return new Result(
                true,
                "CONFIGURATION_PLAN_READY",
                session.epoch,
                profile.protocol,
                resolution.baudRate,
                resolution.parity,
                profile.sendDtr);
    }

    private static Result blocked(String stage) {
        return new Result(false, stage, 0L, "UNKNOWN", 0, "UNKNOWN", false);
    }
}
