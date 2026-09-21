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

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Honest transport selection screen, not a fake diagnostic dashboard.
 * USB and Bluetooth Classic smoke tests are offline and do not send commands.
 */
public final class ConnectionsActivity extends Activity {
    private static final int BG = Color.rgb(9, 15, 26);
    private static final int PANEL = Color.rgb(20, 32, 49);
    private static final int BLUE = Color.rgb(41, 125, 244);
    private static final int TEXT = Color.rgb(244, 249, 255);
    private static final int MUTED = Color.rgb(168, 188, 210);
    private static final int GREEN = Color.rgb(115, 225, 170);
    private LinearLayout content;
    private UsbManager usbManager;
    private boolean bluetoothBusy;
    private String bluetoothResult;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        usbManager = (UsbManager) getSystemService(USB_SERVICE);
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

    @Override public void onRequestPermissionsResult(int code, String[] permissions,
                                                      int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == BluetoothLink.REQUEST_CONNECT_PERMISSION) render();
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

    private LinearLayout panel(String icon, String heading, String subheading) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(shape(PANEL, 20));
        card.setPadding(dp(18), dp(16), dp(18), dp(20));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(8), 0, dp(12));
        content.addView(card, params);
        text(card, icon + "   " + heading, 23, TEXT);
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
        text(content, "DIAGNOSTICS  /  WYBÓR POŁĄCZENIA", 16, TEXT);
        text(content, "Android " + Build.VERSION.RELEASE + "  ·  " + Build.MODEL,
                14, MUTED);
        text(content, "Statusy sprzętu są rzeczywiste. Nie ma jeszcze połączenia z ECU.",
                15, GREEN);

        LinearLayout usb = panel("USB", "KABEL USB / K+DCAN",
                "Sterownik USB-serial · test poza samochodem");
        Map<String, UsbDevice> devices = usbManager == null ? null : usbManager.getDeviceList();
        if (devices == null) {
            text(usb, "Android nie udostępnia listy urządzeń USB.", 16, MUTED);
        } else if (devices.isEmpty()) {
            text(usb, "Brak urządzenia USB · nie potwierdzono OTG na tym tablecie.", 16, MUTED);
        } else {
            text(usb, "Wykryto urządzeń USB: " + devices.size(), 18, GREEN);
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

        LinearLayout bluetooth = panel("BT", "BLUETOOTH",
                "Android Classic SPP · sparowane adaptery · bez komend ECU");
        if (!BluetoothLink.available()) {
            text(bluetooth, "Ten tablet nie zgłasza adaptera Bluetooth.", 16, MUTED);
        } else if (!BluetoothLink.hasPermission(this)) {
            text(bluetooth, "Android wymaga zgody na połączenia Bluetooth.", 16, MUTED);
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
            int candidates = 0;
            for (BluetoothDevice device : paired) {
                String name = BluetoothLink.displayName(device);
                String lower = name.toLowerCase(Locale.US);
                if (!(lower.contains("obd") || lower.contains("elm")
                        || lower.contains("vgate") || lower.contains("vlink")
                        || lower.contains("carista") || lower.contains("konnwei"))) continue;
                candidates++;
                button(bluetooth, "SPRAWDŹ SPP: " + name, !bluetoothBusy,
                        view -> testBluetooth(device));
            }
            if (candidates == 0) {
                text(bluetooth, "Nie znaleziono sparowanego adaptera diagnostycznego SPP. "
                        + "Urządzenia Carista BLE mogą nie widnieć na tej liście.", 15, MUTED);
            }
            button(bluetooth, "USTAWIENIA PAROWANIA", true,
                    view -> startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
        }
        if (bluetoothBusy) text(bluetooth, "Trwa próba nawiązania i zamknięcia sesji SPP…", 15, GREEN);
        if (bluetoothResult != null) text(bluetooth, bluetoothResult, 15, GREEN);

        LinearLayout ble = panel("BLE", "CARISTA / BLUETOOTH LE",
                "Osobny protokół, nie jest zamienny z Bluetooth Classic SPP");
        text(ble, "Moduł BLE działa w istniejącym kodzie iOS. Na Androidzie nie "
                + "został jeszcze uruchomiony ani zweryfikowany — nie pokazujemy fałszywego Połącz.",
                15, MUTED);
        text(content, "Tryb bez zapisu · bez kodowania · bez flashowania · bez danych demonstracyjnych",
                14, MUTED);
    }

    private void testBluetooth(BluetoothDevice device) {
        if (bluetoothBusy || device == null || !BluetoothLink.hasPermission(this)) return;
        bluetoothBusy = true;
        bluetoothResult = null;
        render();
        new Thread(() -> {
            String result = BluetoothLink.testPairedSppConnection(this, device);
            runOnUiThread(() -> {
                bluetoothBusy = false;
                if (!isFinishing()) {
                    bluetoothResult = result;
                    render();
                }
            });
        }, "hannaada-bt-spp-test").start();
    }
}
