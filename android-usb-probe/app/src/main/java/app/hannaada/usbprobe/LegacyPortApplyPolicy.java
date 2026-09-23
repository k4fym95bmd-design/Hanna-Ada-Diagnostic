package app.hannaada.usbprobe;

/**
 * Pure-Java policy translating a verified configuration plan into static UART
 * settings. DTR is deliberately NOT applied here: for DS2 it is a send-time
 * behavior, not part of static port configuration.
 */
public final class LegacyPortApplyPolicy {
    public static final class Result {
        public final boolean valid;
        public final String stage;
        public final int baudRate;
        public final int dataBits;
        public final int stopBits;
        public final String parity;
        public final boolean dtrRequiredDuringSend;
        public final boolean dtrTouchedDuringConfiguration;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Result(boolean valid, String stage, int baudRate, int dataBits,
                       int stopBits, String parity, boolean dtrRequiredDuringSend) {
            this.valid = valid;
            this.stage = stage;
            this.baudRate = baudRate;
            this.dataBits = dataBits;
            this.stopBits = stopBits;
            this.parity = parity;
            this.dtrRequiredDuringSend = dtrRequiredDuringSend;
            this.dtrTouchedDuringConfiguration = false;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    private LegacyPortApplyPolicy() { }

    public static Result from(LegacyPortConfigurationPlan.Result plan) {
        if (plan == null || !plan.ready) return blocked("PLAN_NOT_READY");
        if (plan.baudRate <= 0) return blocked("BAUD_INVALID");
        if (!LegacySerialProfile.PARITY_EVEN.equals(plan.parity)
                && !LegacySerialProfile.PARITY_NONE.equals(plan.parity)) {
            return blocked("PARITY_UNSUPPORTED");
        }
        return new Result(
                true,
                "STATIC_UART_SETTINGS_READY",
                plan.baudRate,
                8,
                1,
                plan.parity,
                plan.sendDtr);
    }

    private static Result blocked(String stage) {
        return new Result(false, stage, 0, 0, 0, "UNKNOWN", false);
    }
}
