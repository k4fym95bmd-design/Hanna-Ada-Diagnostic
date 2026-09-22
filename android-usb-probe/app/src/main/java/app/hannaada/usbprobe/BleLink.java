package app.hannaada.usbprobe;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/**
 * Foreground, user-initiated BLE transport smoke test. It does NOT identify an
 * ELM protocol, subscribe to GATT characteristics, or send any diagnostic bytes.
 * A positive result means BLE transport only, never an ECU connection.
 */
final class BleLink {
    static final int PERMISSION_REQUEST = 422;
    private static final long SCAN_WINDOW_MS = 10_000L;
    private static final long CONNECTION_TIMEOUT_MS = 12_000L;

    interface ScanListener {
        void onDevice(BluetoothDevice device, String name);
        void onFinished(String message);
    }

    interface ConnectionListener {
        void onResult(String message, boolean connected);
    }

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothLeScanner scanner;
    private ScanCallback callback;
    private Runnable scanTimeout;
    private BluetoothGatt gatt;
    private Runnable connectionTimeout;
    private boolean connecting;

    BleLink(Context context) {
        this.context = context.getApplicationContext();
    }

    static boolean available() {
        return BluetoothAdapter.getDefaultAdapter() != null;
    }

    static String[] missingPermissions(Context context) {
        if (Build.VERSION.SDK_INT < 23) return new String[0];
        if (Build.VERSION.SDK_INT >= 31) {
            boolean scan = context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)
                    != PackageManager.PERMISSION_GRANTED;
            boolean connect = context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED;
            if (scan && connect) return new String[]{Manifest.permission.BLUETOOTH_SCAN,
                    Manifest.permission.BLUETOOTH_CONNECT};
            if (scan) return new String[]{Manifest.permission.BLUETOOTH_SCAN};
            if (connect) return new String[]{Manifest.permission.BLUETOOTH_CONNECT};
            return new String[0];
        }
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                ? new String[0] : new String[]{Manifest.permission.ACCESS_FINE_LOCATION};
    }

    static String displayName(BluetoothDevice device) {
        if (device == null) return "Nieznane urządzenie BLE";
        try {
            String name = device.getName();
            return name == null || name.trim().isEmpty()
                    ? "Urządzenie BLE bez nazwy" : name.trim();
        } catch (SecurityException ignored) {
            return "Urządzenie BLE";
        }
    }

    void startScan(final ScanListener listener) {
        stopScan();
        if (missingPermissions(context).length != 0) {
            listener.onFinished("Brak zgody Androida na wyszukiwanie BLE.");
            return;
        }
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                listener.onFinished("Bluetooth jest niedostępny lub wyłączony.");
                return;
            }
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) {
                listener.onFinished("Android nie udostępnia skanera Bluetooth LE.");
                return;
            }
            callback = new ScanCallback() {
                @Override public void onScanResult(int type, ScanResult result) {
                    if (result == null || result.getDevice() == null) return;
                    final BluetoothDevice device = result.getDevice();
                    final String name = displayName(device);
                    main.post(() -> {
                        if (callback == this) listener.onDevice(device, name);
                    });
                }

                @Override public void onScanFailed(int code) {
                    main.post(() -> {
                        if (callback != this) return;
                        stopScan();
                        listener.onFinished("Wyszukiwanie BLE nie powiodło się (kod Androida "
                                + code + ").");
                    });
                }
            };
            scanner.startScan(callback);
            scanTimeout = () -> {
                stopScan();
                listener.onFinished("Skanowanie BLE zakończone po 10 sekundach.");
            };
            main.postDelayed(scanTimeout, SCAN_WINDOW_MS);
        } catch (SecurityException | IllegalStateException error) {
            stopScan();
            listener.onFinished("Android odmówił dostępu do skanera BLE.");
        }
    }

    void stopScan() {
        if (scanTimeout != null) {
            main.removeCallbacks(scanTimeout);
            scanTimeout = null;
        }
        if (scanner != null && callback != null) {
            try { scanner.stopScan(callback); }
            catch (SecurityException | IllegalStateException ignored) { }
        }
        scanner = null;
        callback = null;
    }

    void testConnection(BluetoothDevice device, final ConnectionListener listener) {
        if (connecting) {
            listener.onResult("Trwa inna próba BLE.", false);
            return;
        }
        if (device == null || missingPermissions(context).length != 0) {
            listener.onResult("Brak urządzenia lub wymaganych uprawnień BLE.", false);
            return;
        }
        stopScan();
        connecting = true;
        try {
            gatt = device.connectGatt(context, false, new BluetoothGattCallback() {
                @Override public void onConnectionStateChange(BluetoothGatt connectedGatt,
                                                              int status, int newState) {
                    main.post(() -> {
                        if (!connecting || gatt != connectedGatt) return;
                        boolean success = status == BluetoothGatt.GATT_SUCCESS
                                && newState == BluetoothProfile.STATE_CONNECTED;
                        finishConnection();
                        listener.onResult(success
                                ? "Połączono z urządzeniem BLE. Nie testowano protokołu OBD ani ECU."
                                : "Nie nawiązano sesji BLE (status " + status + ").", success);
                    });
                }
            });
            if (gatt == null) {
                finishConnection();
                listener.onResult("Android nie otworzył sesji GATT.", false);
                return;
            }
            connectionTimeout = () -> {
                if (!connecting) return;
                finishConnection();
                listener.onResult("Przekroczono 12 sekund oczekiwania na BLE.", false);
            };
            main.postDelayed(connectionTimeout, CONNECTION_TIMEOUT_MS);
        } catch (SecurityException | IllegalStateException error) {
            finishConnection();
            listener.onResult("Android zablokował połączenie BLE.", false);
        }
    }

    private void finishConnection() {
        connecting = false;
        if (connectionTimeout != null) {
            main.removeCallbacks(connectionTimeout);
            connectionTimeout = null;
        }
        if (gatt != null) {
            try { gatt.disconnect(); } catch (SecurityException ignored) { }
            gatt.close();
            gatt = null;
        }
    }

    void stopAll() {
        stopScan();
        finishConnection();
    }
}
