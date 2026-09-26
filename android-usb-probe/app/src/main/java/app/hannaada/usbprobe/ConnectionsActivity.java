package app.hannaada.usbprobe;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothDevice;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/** User-facing hardware transport selection. No mock ECU data or vehicle writes. */
public final class ConnectionsActivity extends Activity {
    private static final int BG = Color.rgb(9, 15, 26);
    private static final int PANEL = Color.rgb(20, 32, 49);
    private static final int BLUE = Color.rgb(41, 125, 244);
    private static final int TEXT = Color.rgb(244, 249, 255);
    private static final int MUTED = Color.rgb(168, 188, 210);
    private static final int GREEN = Color.rgb(115, 225, 170);
    private static final int AMBER = Color.rgb(255, 190, 110);
    private static final int MAX_DISCOVERED = 12;
    private LinearLayout content;
    private UsbManager usbManager;
    private BleLink bleLink;
    private final List<BluetoothDevice> nearbyBle = new ArrayList<>();
    private boolean bluetoothBusy;
    private String bluetoothResult;
    private boolean bluetoothConnected;
    private boolean bleScanning;
    private boolean bleBusy;
    private String bleStatus;
    private boolean bleConnected;
    private volatile long connectionUiEpoch;
    private ExecutorService transportExecutor;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        usbManager = (UsbManager) getSystemService(USB_SERVICE);
        bleLink = new BleLink(this);
        transportExecutor = Executors.newSingleThreadExecutor(runnable -> {
            Thread worker = new Thread(runnable, "hannaada-connection-worker");
            worker.setDaemon(true);
            return worker;
        });
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(20), dp(18), dp(24));
        scroll.addView(content);
        setContentView(scroll);
        render();
    }

    @Override protected void onResume() {
        super.onResume();
        if (content != null) render();
    }

    @Override protected void onPause() {
        connectionUiEpoch++;
        BluetoothLink.cancelActiveProbe();
        if (bleLink != null) bleLink.stopAll();
        if (bleScanning || bleBusy) {
            bleScanning = false;
            bleBusy = false;
            bleConnected = false;
            bleStatus = "Test BLE przerwany po opuszczeniu ekranu.";
        }
        if (bluetoothBusy) {
            bluetoothBusy = false;
            bluetoothConnected = false;
            bluetoothResult = "Test SPP przerwany po opuszczeniu ekranu.";
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        connectionUiEpoch++;
        BluetoothLink.cancelActiveProbe();
        if (bleLink != null) bleLink.stopAll();
        if (transportExecutor != null) transportExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions,
                                                      int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == BluetoothLink.REQUEST_CONNECT_PERMISSION
                || code == BleLink.PERMISSION_REQUEST) render();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private GradientDrawable shape(int fill, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        return drawable;
    }

    private void text(LinearLayout target, String value, int size, int color) {
        TextView label = new TextView(this);
        label.setText(value);
        label.setTextSize(size);
        label.setTextColor(color);
        label.setPadding(0, dp(5), 0, dp(5));
        target.addView(label);
    }

    private LinearLayout panel(LinearLayout parent, String icon, String heading,
                               String subheading, boolean columns) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(shape(PANEL, 20));
        card.setPadding(dp(18), dp(16), dp(18), dp(20));
        LinearLayout.LayoutParams params = columns
                ? new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                : new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(5), dp(8), dp(5), dp(12));
        parent.addView(card, params);
        TextView emblem = new TextView(this);
        emblem.setText(icon);
        emblem.setTextSize(23);
        emblem.setTextColor(TEXT);
        emblem.setGravity(android.view.Gravity.CENTER);
        emblem.setBackground(shape(BLUE, 16));
        LinearLayout.LayoutParams emblemParams = new LinearLayout.LayoutParams(dp(66), dp(66));
        emblemParams.bottomMargin = dp(9);
        card.addView(emblem, emblemParams);
        text(card, heading, 23, TEXT);
        text(card, subheading, 15, MUTED);
        return card;
    }

    private void button(LinearLayout target, String label, boolean enabled,
                        View.OnClickListener action) {
        Button control = new Button(this);
        control.setText(label);
        control.setTextSize(16);
        control.setTextColor(TEXT);
        control.setAllCaps(false);
        control.setMinHeight(dp(64));
        control.setEnabled(enabled);
        control.setBackground(shape(enabled ? BLUE : Color.rgb(58, 69, 86), 14));
        control.setOnClickListener(action);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        params.setMargins(0, dp(12), 0, 0);
        target.addView(control, params);
    }

    private void render() {
        content.removeAllViews();
        text(content, "HANNA & ADA", 29, Color.rgb(91, 164, 255));
        text(content, "DIAGNOSTICS  /  WYBÓR POŁĄCZENIA", 17, TEXT);
        text(content, "Android " + Build.VERSION.RELEASE + "  ·  " + Build.MODEL,
                14, MUTED);
        text(content, "Połączenie z adapterem nie oznacza jeszcze diagnostyki ECU.", 15, AMBER);

        boolean columns = getResources().getConfiguration().screenWidthDp >= 720;
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(columns ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
        content.addView(top);

        LinearLayout usb = panel(top, "USB", "KABEL USB / K+DCAN",
                "Sterownik USB-serial · test poza samochodem", columns);
        Map<String, UsbDevice> devices = usbManager == null ? null : usbManager.getDeviceList();
        if (devices == null) {
            text(usb, "Android nie udostępnia listy USB.", 16, AMBER);
        } else if (devices.isEmpty()) {
            text(usb, "Nie wykryto urządzenia USB.", 16, MUTED);
        } else {
            text(usb, "Wykryto USB: " + devices.size(), 18, GREEN);
            for (UsbDevice device : devices.values()) {
                if (device == null) continue;
                String id = String.format(Locale.US, "%04X:%04X",
                        device.getVendorId(), device.getProductId());
                text(usb, id + " · zgoda: " + (usbManager.hasPermission(device) ? "TAK" : "NIE"),
                        15, MUTED);
            }
        }
        button(usb, "OTWÓRZ TEST KABLA USB", true,
                view -> startActivity(new Intent(this, MainActivity.class)));

        LinearLayout bluetooth = panel(top, "BT", "BLUETOOTH CLASSIC",
                "Sparowane adaptery SPP · test bez komend ECU", columns);
        if (!BluetoothLink.available()) {
            text(bluetooth, "Ten tablet nie zgłasza Bluetooth.", 16, AMBER);
        } else if (!BluetoothLink.hasPermission(this)) {
            text(bluetooth, "Android wymaga zgody Bluetooth.", 16, AMBER);
            button(bluetooth, "UDZIEL ZGODY BLUETOOTH", true, view -> {
                if (Build.VERSION.SDK_INT >= 31) requestPermissions(
                        new String[]{Manifest.permission.BLUETOOTH_CONNECT},
                        BluetoothLink.REQUEST_CONNECT_PERMISSION);
            });
        } else if (!BluetoothLink.enabled(this)) {
            text(bluetooth, "Bluetooth jest wyłączony.", 16, MUTED);
            button(bluetooth, "OTWÓRZ USTAWIENIA BLUETOOTH", true,
                    view -> startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
        } else {
            List<BluetoothDevice> paired = BluetoothLink.paired(this);
            if (paired.isEmpty()) {
                text(bluetooth, "Brak sparowanych urządzeń Bluetooth Classic.", 15, MUTED);
            } else {
                text(bluetooth, "Sparowane urządzenia: " + paired.size()
                        + " · wybierz swój adapter.", 15, MUTED);
                int shown = 0;
                for (BluetoothDevice device : paired) {
                    if (shown++ >= MAX_DISCOVERED) break;
                    // Do not silently hide compatible adapters with unfamiliar brand names.
                    button(bluetooth, "TEST SPP: " + BluetoothLink.displayName(device),
                            !bluetoothBusy, view -> testBluetooth(device));
                }
            }
            button(bluetooth, "USTAWIENIA PAROWANIA", true,
                    view -> startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
        }
        if (bluetoothBusy) text(bluetooth, "Łączę i zamykam sesję SPP…", 15, AMBER);
        if (bluetoothResult != null) text(bluetooth, bluetoothResult, 15,
                bluetoothConnected ? GREEN : AMBER);

        LinearLayout ble = panel(content, "BLE", "BLUETOOTH LE / CARISTA",
                "Wykrywanie rzeczywistych urządzeń · test transportu GATT", false);
        if (!BleLink.available()) {
            text(ble, "Ten tablet nie zgłasza Bluetooth.", 16, AMBER);
        } else if (!BluetoothLink.enabled(this) && BluetoothLink.hasPermission(this)) {
            text(ble, "Włącz Bluetooth w ustawieniach tabletu.", 16, AMBER);
        } else if (BleLink.missingPermissions(this).length > 0) {
            text(ble, "Zgoda systemowa jest wymagana do wyszukania BLE."
                    + (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT <= 30
                    ? " Android 6–11 wymaga zgody na lokalizację do skanowania; aplikacja jej nie odczytuje."
                    : ""), 15, AMBER);
            button(ble, "UDZIEL ZGODY NA BLE", true, view -> {
                if (Build.VERSION.SDK_INT >= 23) requestPermissions(
                        BleLink.missingPermissions(this), BleLink.PERMISSION_REQUEST);
            });
        } else {
            button(ble, bleScanning ? "SKANOWANIE BLE…" : "SZUKAJ URZĄDZEŃ BLE · 10 S",
                    !bleScanning && !bleBusy, view -> startBleScan());
            if (nearbyBle.isEmpty() && !bleScanning) {
                text(ble, "Lista pusta. Wyszukaj w pobliżu kompatybilny adapter BLE.",
                        15, MUTED);
            }
            for (BluetoothDevice device : nearbyBle) {
                button(ble, "TEST BLE: " + BleLink.displayName(device),
                        !bleScanning && !bleBusy, view -> testBle(device));
            }
        }
        if (bleScanning) text(ble, "Wyszukiwanie trwa, maksymalnie 10 sekund…", 15, AMBER);
        if (bleBusy) text(ble, "Trwa próba połączenia BLE, maksymalnie 12 sekund…", 15, AMBER);
        if (bleStatus != null) text(ble, bleStatus, 15, bleConnected ? GREEN : AMBER);
        text(content, "Tylko test transportu · bez zapisu, kodowania i flashowania · bez danych demo",
                14, MUTED);
    }

    private void startBleScan() {
        if (bleScanning || bleBusy) return;
        final long owner = ++connectionUiEpoch;
        nearbyBle.clear();
        bleScanning = true;
        bleConnected = false;
        bleStatus = null;
        render();
        bleLink.startScan(new BleLink.ScanListener() {
            @Override public void onDevice(BluetoothDevice device, String name) {
                if (owner != connectionUiEpoch || !bleScanning || isFinishing()) return;
                if (nearbyBle.size() < MAX_DISCOVERED && !nearbyBle.contains(device)) {
                    nearbyBle.add(device);
                    render();
                }
            }
            @Override public void onFinished(String message) {
                if (owner != connectionUiEpoch || isFinishing() || !bleScanning) return;
                bleScanning = false;
                bleStatus = message;
                render();
            }
        });
    }

    private void testBle(BluetoothDevice device) {
        if (bleBusy || bleScanning || device == null) return;
        final long owner = ++connectionUiEpoch;
        bleBusy = true;
        bleStatus = null;
        bleConnected = false;
        render();
        bleLink.testConnection(device, (message, connected) -> {
            if (owner != connectionUiEpoch || isFinishing()
                    || (Build.VERSION.SDK_INT >= 17 && isDestroyed())) return;
            bleBusy = false;
            bleConnected = connected;
            bleStatus = message;
            render();
        });
    }

    private void testBluetooth(BluetoothDevice device) {
        if (bluetoothBusy || device == null || !BluetoothLink.hasPermission(this)) return;
        final long owner = ++connectionUiEpoch;
        final long probeToken = BluetoothLink.beginProbe();
        bluetoothBusy = true;
        bluetoothResult = null;
        bluetoothConnected = false;
        render();
        try {
            transportExecutor.execute(() -> {
                String result = BluetoothLink.testPairedSppConnection(this, device, probeToken);
                runOnUiThread(() -> {
                    if (owner != connectionUiEpoch || isFinishing()
                            || (Build.VERSION.SDK_INT >= 17 && isDestroyed())) return;
                    bluetoothBusy = false;
                    bluetoothResult = result;
                    bluetoothConnected = result.startsWith("SPP: połączono");
                    render();
                });
            });
        } catch (RejectedExecutionException rejected) {
            bluetoothBusy = false;
            bluetoothConnected = false;
            bluetoothResult = "Worker połączeń został zatrzymany; uruchom test ponownie.";
            render();
        }
    }
}
