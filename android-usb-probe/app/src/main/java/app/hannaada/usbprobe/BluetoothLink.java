package app.hannaada.usbprobe;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Android Bluetooth Classic SPP, a transport separate from BLE/Carista.
 * This OFF-VEHICLE smoke test connects and closes the socket without reading,
 * writing, sending ELM commands or claiming a BMW ECU connection.
 */
final class BluetoothLink {
    static final int REQUEST_CONNECT_PERMISSION = 421;
    private static final Object PROBE_LOCK = new Object();
    private static long probeGeneration;
    private static BluetoothSocket activeProbeSocket;
    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothLink() { }

    static long beginProbe() {
        synchronized (PROBE_LOCK) {
            probeGeneration = probeGeneration == Long.MAX_VALUE ? 1L : probeGeneration + 1L;
            return probeGeneration;
        }
    }

    static void cancelActiveProbe() {
        BluetoothSocket socket;
        synchronized (PROBE_LOCK) {
            probeGeneration = probeGeneration == Long.MAX_VALUE ? 1L : probeGeneration + 1L;
            socket = activeProbeSocket;
            activeProbeSocket = null;
        }
        closeQuietly(socket);
    }

    private static boolean currentProbe(long token) {
        synchronized (PROBE_LOCK) {
            return token > 0L && probeGeneration == token;
        }
    }

    private static boolean claimProbeSocket(long token, BluetoothSocket socket) {
        synchronized (PROBE_LOCK) {
            if (token <= 0L || probeGeneration != token || activeProbeSocket != null) return false;
            activeProbeSocket = socket;
            return true;
        }
    }

    private static void releaseProbeSocket(BluetoothSocket socket) {
        synchronized (PROBE_LOCK) {
            if (activeProbeSocket == socket) activeProbeSocket = null;
        }
    }

    private static void closeQuietly(BluetoothSocket socket) {
        if (socket == null) return;
        try { socket.close(); } catch (IOException ignored) { }
    }

    static boolean hasPermission(Context context) {
        return Build.VERSION.SDK_INT < 31
                || context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                    == PackageManager.PERMISSION_GRANTED;
    }

    static boolean available() {
        return BluetoothAdapter.getDefaultAdapter() != null;
    }

    static boolean enabled(Context context) {
        if (!hasPermission(context)) return false;
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        try {
            return adapter != null && adapter.isEnabled();
        } catch (SecurityException ignored) {
            return false;
        }
    }

    static List<BluetoothDevice> paired(Context context) {
        if (!hasPermission(context)) return Collections.emptyList();
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !enabled(context)) return Collections.emptyList();
        try {
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            if (devices == null) return Collections.emptyList();
            List<BluetoothDevice> result = new ArrayList<>(devices);
            Collections.sort(result, new Comparator<BluetoothDevice>() {
                @Override public int compare(BluetoothDevice first, BluetoothDevice second) {
                    return displayName(first).compareToIgnoreCase(displayName(second));
                }
            });
            return result;
        } catch (SecurityException ignored) {
            return Collections.emptyList();
        }
    }

    static String displayName(BluetoothDevice device) {
        if (device == null) return "Urządzenie Bluetooth";
        try {
            String name = device.getName();
            return name == null || name.trim().isEmpty() ? "Urządzenie bez nazwy" : name;
        } catch (SecurityException ignored) {
            return "Urządzenie Bluetooth";
        }
    }

    /** Blocking call: caller MUST run it on a background thread. */
    static String testPairedSppConnection(Context context, BluetoothDevice device, long probeToken) {
        if (device == null || !available()) return "Bluetooth niedostępny.";
        if (!hasPermission(context)) return "Brak zgody Bluetooth Androida.";
        if (!enabled(context)) return "Włącz Bluetooth w ustawieniach tabletu.";
        if (!currentProbe(probeToken)) return "SPP: test anulowany. To nie dowodzi połączenia z ECU.";
        BluetoothSocket socket = null;
        String outcome = "Brak wyniku testu.";
        try {
            // Paired device only. No discovery and no insecure RFCOMM fallback.
            if (device.getBondState() != BluetoothDevice.BOND_BONDED) {
                return "Urządzenie nie jest sparowane.";
            }
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            if (!claimProbeSocket(probeToken, socket)) {
                closeQuietly(socket);
                return "SPP: test anulowany. To nie dowodzi połączenia z ECU.";
            }
            socket.connect();
            outcome = currentProbe(probeToken)
                    ? "SPP: połączono z adapterem, bez odczytu i wysyłania danych."
                    : "SPP: test anulowany.";
        } catch (SecurityException ignored) {
            outcome = currentProbe(probeToken)
                    ? "Android zablokował dostęp Bluetooth. Sprawdź uprawnienia."
                    : "SPP: test anulowany.";
        } catch (IOException ignored) {
            outcome = currentProbe(probeToken)
                    ? "SPP: brak połączenia. Urządzenie może korzystać z BLE zamiast SPP."
                    : "SPP: test anulowany.";
        } finally {
            releaseProbeSocket(socket);
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    if (currentProbe(probeToken)) {
                        outcome = "Nie udało się potwierdzić zamknięcia sesji Bluetooth.";
                    }
                }
            }
        }
        return outcome + " To nie dowodzi połączenia z ECU.";
    }
}
