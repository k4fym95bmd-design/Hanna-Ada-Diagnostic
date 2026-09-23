package app.hannaada.usbprobe;

import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;

import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;

import java.util.UUID;

/**
 * Physical Android USB-serial bridge for the current K+DCAN evidence stage.
 *
 * Safety boundary:
 * - opens exactly one serial port;
 * - may apply a previously verified static UART plan;
 * - does not read;
 * - does not write;
 * - does not toggle DTR as part of configuration;
 * - does not send BMW/ELM/INPA commands;
 * - disconnect/close always invalidates the transport session.
 */
public final class AndroidKdcanUsbBridge {
    public static final class ConfigurationResult {
        public final boolean applied;
        public final String stage;
        public final long epoch;
        public final int baudRate;
        public final String parity;
        public final boolean dtrPendingForSend;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private ConfigurationResult(boolean applied, String stage, long epoch,
                                    int baudRate, String parity, boolean dtrPendingForSend) {
            this.applied = applied;
            this.stage = stage;
            this.epoch = epoch;
            this.baudRate = baudRate;
            this.parity = parity;
            this.dtrPendingForSend = dtrPendingForSend;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    public static final class Result {
        public final boolean opened;
        public final String stage;
        public final String driverFamily;
        public final long epoch;
        public final boolean ecuVerified;
        public final boolean writesEnabled;

        private Result(boolean opened, String stage, String driverFamily, long epoch) {
            this.opened = opened;
            this.stage = stage;
            this.driverFamily = driverFamily;
            this.epoch = epoch;
            this.ecuVerified = false;
            this.writesEnabled = false;
        }
    }

    private final UsbManager manager;
    private final KdcanTransportSession transportSession;
    private UsbDeviceConnection connection;
    private UsbSerialPort port;
    private String boundDeviceName;
    private String activeSessionId;
    private long activeEpoch;
    private String activeDriverFamily = "UNKNOWN";

    public AndroidKdcanUsbBridge(UsbManager manager) {
        this(manager, new KdcanTransportSession());
    }

    AndroidKdcanUsbBridge(UsbManager manager, KdcanTransportSession transportSession) {
        if (manager == null) throw new IllegalArgumentException("UsbManager required");
        if (transportSession == null) throw new IllegalArgumentException("Transport session required");
        this.manager = manager;
        this.transportSession = transportSession;
    }

    public synchronized Result openNoTraffic(UsbDevice device) {
        if (device == null) return fail("NO_DEVICE");
        if (port != null || connection != null || transportSession.snapshot().active) {
            return fail("ALREADY_ACTIVE");
        }
        if (!manager.hasPermission(device)) return fail("PERMISSION_REQUIRED");

        UsbSerialDriver driver = UsbSerialLink.findDriver(manager, device);
        if (driver == null) return fail("DRIVER_NOT_FOUND");
        if (driver.getPorts().size() != 1) return fail("PORT_COUNT_UNSUPPORTED");

        String family = UsbSerialEvidence.family(driver.getClass().getSimpleName());
        String sessionId = UUID.randomUUID().toString();
        KdcanTransportSession.Snapshot bound = transportSession.begin(
                sessionId, device.getVendorId(), device.getProductId(), family);

        UsbDeviceConnection openedConnection = null;
        UsbSerialPort openedPort = driver.getPorts().get(0);
        try {
            openedConnection = manager.openDevice(device);
            if (openedConnection == null) {
                transportSession.disconnect();
                return fail("OPEN_DEVICE_FAILED");
            }
            openedPort.open(openedConnection);

            connection = openedConnection;
            port = openedPort;
            boundDeviceName = device.getDeviceName();
            activeSessionId = sessionId;
            activeEpoch = bound.epoch;
            activeDriverFamily = family;

            KdcanTransportSession.Snapshot open =
                    transportSession.markPortOpen(activeSessionId, activeEpoch);
            return new Result(true, open.stage, activeDriverFamily, activeEpoch);
        } catch (Exception failure) {
            try {
                openedPort.close();
            } catch (Exception ignored) { }
            if (openedConnection != null) {
                try { openedConnection.close(); } catch (Exception ignored) { }
            }
            transportSession.disconnect();
            clearHandles();
            return fail("PORT_OPEN_FAILED");
        }
    }

    public synchronized ConfigurationResult applyStaticConfiguration(
            LegacyPortConfigurationPlan.Result plan) {
        KdcanTransportSession.Snapshot state = transportSession.snapshot();
        if (port == null || connection == null || !state.active || !state.portOpen) {
            return configFail("TRANSPORT_NOT_READY");
        }
        if (plan == null || !plan.ready) return configFail("PLAN_NOT_READY");
        if (state.epoch != plan.epoch || activeEpoch != plan.epoch) {
            return configFail("STALE_EPOCH");
        }
        if (state.requestBound) return configFail("REQUEST_ALREADY_BOUND");

        LegacyPortApplyPolicy.Result policy = LegacyPortApplyPolicy.from(plan);
        if (!policy.valid) return configFail(policy.stage);

        final int parity;
        if (LegacySerialProfile.PARITY_EVEN.equals(policy.parity)) {
            parity = UsbSerialPort.PARITY_EVEN;
        } else if (LegacySerialProfile.PARITY_NONE.equals(policy.parity)) {
            parity = UsbSerialPort.PARITY_NONE;
        } else {
            return configFail("PARITY_UNSUPPORTED");
        }

        try {
            port.setParameters(
                    policy.baudRate,
                    UsbSerialPort.DATABITS_8,
                    UsbSerialPort.STOPBITS_1,
                    parity);
            KdcanTransportSession.Snapshot configured =
                    transportSession.markConfigured(activeSessionId, activeEpoch);
            return new ConfigurationResult(
                    true,
                    configured.stage,
                    configured.epoch,
                    policy.baudRate,
                    policy.parity,
                    policy.dtrRequiredDuringSend);
        } catch (Exception failure) {
            closeAndInvalidate();
            return new ConfigurationResult(
                    false,
                    "CONFIGURATION_FAILED_INVALIDATED",
                    state.epoch,
                    0,
                    "UNKNOWN",
                    false);
        }
    }

    public synchronized Result closeAndInvalidate() {
        boolean closeClean = true;
        if (port != null) {
            try { port.close(); } catch (Exception failure) { closeClean = false; }
        }
        if (connection != null) {
            try { connection.close(); } catch (Exception failure) { closeClean = false; }
        }
        clearHandles();
        KdcanTransportSession.Snapshot state = transportSession.disconnect();
        return new Result(false, closeClean ? "DISCONNECTED" : "CLOSE_FAILED_INVALIDATED",
                state.driverFamily, state.epoch);
    }

    public synchronized Result onUsbDetached() {
        return closeAndInvalidate();
    }

    public synchronized KdcanTransportSession.Snapshot snapshot() {
        return transportSession.snapshot();
    }

    public synchronized boolean isBoundTo(UsbDevice device) {
        return device != null && boundDeviceName != null
                && boundDeviceName.equals(device.getDeviceName());
    }

    private ConfigurationResult configFail(String stage) {
        KdcanTransportSession.Snapshot state = transportSession.snapshot();
        return new ConfigurationResult(false, stage, state.epoch, 0, "UNKNOWN", false);
    }

    private Result fail(String stage) {
        KdcanTransportSession.Snapshot state = transportSession.snapshot();
        return new Result(false, stage, state.driverFamily, state.epoch);
    }

    private void clearHandles() {
        connection = null;
        port = null;
        boundDeviceName = null;
        activeSessionId = null;
        activeEpoch = 0L;
        activeDriverFamily = "UNKNOWN";
    }
}
