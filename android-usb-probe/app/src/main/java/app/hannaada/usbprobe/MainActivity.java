package app.hannaada.usbprobe;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.hoho.android.usbserial.driver.UsbSerialDriver;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * OFF-VEHICLE USB and USB-serial link test. No network, ECU traffic or car diagnosis.
 * A successful USB port open does NOT imply working BMW diagnostics.
 */
public final class MainActivity extends Activity {
    private static final String ACTION_PERMISSION = "app.hannaada.usbprobe.USB_PERMISSION";
    private UsbManager usbManager;
    private LinearLayout content;
    private boolean receiverRegistered;
    private volatile boolean portTestRunning;
    private String lastPortResult;

    private final BroadcastReceiver usbEvents = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            if (ACTION_PERMISSION.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) lastPortResult = null;
                render();
            }
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(17, 22, 31));
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(18);
        content.setPadding(padding, padding, padding, padding);
        scroll.addView(content);
        setContentView(scroll);
        IntentFilter filter = new IntentFilter(ACTION_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        registerReceiver(usbEvents, filter);
        receiverRegistered = true;
        render();
    }

    @Override protected void onResume() {
        super.onResume();
        if (content != null) render();
    }

    @Override protected void onDestroy() {
        if (receiverRegistered) unregisterReceiver(usbEvents);
        receiverRegistered = false;
        super.onDestroy();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setPadding(0, dp(7), 0, dp(7));
        content.addView(view);
    }

    private void action(String title, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(title);
        button.setAllCaps(false);
        button.setOnClickListener(listener);
        content.addView(button);
    }

    private static String usbId(UsbDevice device) {
        return String.format(Locale.US, "%04X:%04X", device.getVendorId(), device.getProductId());
    }

    private boolean hostFeature() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_USB_HOST);
    }

    private Map<String, UsbDevice> currentDevices() {
        return usbManager == null ? null : usbManager.getDeviceList();
    }

    private List<String> sortedKeys(Map<String, UsbDevice> devices) {
        List<String> keys = new ArrayList<>(devices.keySet());
        // USB paths used internally for stable ordering; never exported.
        Collections.sort(keys);
        return keys;
    }

    private String currentReport() {
        Map<String, UsbDevice> devices = currentDevices();
        List<UsbReport.Device> snapshot = new ArrayList<>();
        if (devices != null) {
            for (String key : sortedKeys(devices)) {
                UsbDevice device = devices.get(key);
                if (device != null) {
                    snapshot.add(new UsbReport.Device(device.getVendorId(), device.getProductId(),
                            device.getInterfaceCount(), usbManager.hasPermission(device)));
                }
            }
        }
        // Deliberately do not export model, serial number, device path or error strings.
        return UsbReport.build(Build.VERSION.SDK_INT, hostFeature(), devices != null, snapshot);
    }

    private void copyReport() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            Toast.makeText(this, "Schowek niedostępny", Toast.LENGTH_SHORT).show();
            return;
        }
        clipboard.setPrimaryClip(ClipData.newPlainText("Raport USB Hanna Ada", currentReport()));
        Toast.makeText(this, "Raport skopiowany — wklej go do rozmowy", Toast.LENGTH_LONG).show();
    }

    private void render() {
        content.removeAllViews();
        label("HANNA & ADA / FIRE USB-SERIAL v0.4", 22, Color.rgb(100, 168, 255));
        label("TEST WYŁĄCZNIE POZA AUTEM · ZERO POLECEŃ DO ECU", 13,
                Color.rgb(255, 145, 145));
        label("Tablet: " + Build.MANUFACTURER + " " + Build.MODEL + " · Android API "
                + Build.VERSION.SDK_INT, 16, Color.WHITE);

        boolean host = hostFeature();
        label("1. USB Host Androida: " + (host ? "TAK" : "NIE"), 17,
                host ? Color.rgb(155, 227, 190) : Color.rgb(255, 167, 122));
        label("USB-C / micro-USB i deklaracja Host nie dowodzą, że konkretny adapter OTG działa.",
                13, Color.LTGRAY);
        action("Odśwież wynik USB", view -> render());

        Map<String, UsbDevice> devices = currentDevices();
        if (devices == null) {
            label("2. Lista USB niedostępna. Brak potwierdzenia OTG.", 16,
                    Color.rgb(255, 167, 122));
        } else if (devices.isEmpty()) {
            label("2. Urządzenia USB: 0 — podłącz adapter USB poza samochodem.", 16,
                    Color.rgb(255, 167, 122));
            label("Przygotuj przejściówkę OTG zgodną z portem Fire HD 10 i podłącz kabel "
                    + "bez samochodu. Odśwież wynik. Nie zmieniaj systemu i nie kupuj "
                    + "sprzętu na podstawie samego komunikatu.", 14, Color.LTGRAY);
        } else {
            label("2. System wykrył " + devices.size() + " urządzeń USB.", 17,
                    Color.rgb(155, 227, 190));
            if (!host) label("Deklaracja Host i wykrycie USB są sprzeczne — sprawdź na tablecie.",
                    13, Color.rgb(255, 167, 122));
            int ordinal = 0;
            for (String key : sortedKeys(devices)) {
                final UsbDevice device = devices.get(key);
                if (device == null) continue;
                ++ordinal;
                label("Urządzenie " + ordinal + " · VID:PID " + usbId(device)
                        + " · interfejsy " + device.getInterfaceCount(), 16,
                        Color.rgb(180, 209, 245));
                boolean permitted = usbManager.hasPermission(device);
                label("Zgoda systemu: " + (permitted ? "UDZIELONA" : "BRAK"), 14,
                        permitted ? Color.rgb(155, 227, 190) : Color.LTGRAY);
                if (!permitted) {
                    action("Poproś o zgodę: urządzenie " + ordinal,
                            view -> requestUsbPermission(device));
                } else {
                    UsbSerialDriver driver = UsbSerialLink.findDriver(usbManager, device);
                    if (driver == null) {
                        label("Sterownik USB-serial: BRAK dla tego urządzenia.", 14,
                                Color.rgb(255, 167, 122));
                    } else {
                        label("Sterownik: " + driver.getClass().getSimpleName() + " · porty: "
                                + driver.getPorts().size(), 14, Color.rgb(155, 227, 190));
                        if (!portTestRunning) {
                            action("Sprawdź i zamknij port USB (TYLKO POZA AUTEM)",
                                    view -> testSerialPort(device));
                        }
                    }
                }
            }
        }
        if (portTestRunning) label("Trwa jednorazowy test otwarcia i zamknięcia portu...",
                15, Color.rgb(100, 168, 255));
        if (lastPortResult != null) label("3. Wynik portu: " + lastPortResult,
                15, Color.rgb(155, 227, 190));
        action("Kopiuj bezpieczny raport USB do ChatGPT", view -> copyReport());
        label("Raport: tylko API Androida, USB Host, VID:PID, liczba interfejsów i zgoda. "
                + "Test portu NIE komunikuje się z BMW i NIE uruchamia INPA/ISTA. "
                + "Działanie z konkretnym Fire HD 10 i kablem pozostaje do sprawdzenia.",
                13, Color.LTGRAY);
    }

    private void testSerialPort(UsbDevice selected) {
        if (portTestRunning || selected == null || usbManager == null) return;
        Map<String, UsbDevice> connected = currentDevices();
        UsbDevice device = connected == null ? null : connected.get(selected.getDeviceName());
        if (device == null || !usbManager.hasPermission(device)
                || UsbSerialLink.findDriver(usbManager, device) == null) {
            lastPortResult = "Połączenie zmieniło się. Odśwież listę i uzyskaj zgodę USB.";
            render();
            return;
        }
        portTestRunning = true;
        lastPortResult = null;
        render();
        new Thread(() -> {
            final String result = UsbSerialLink.testOpenAndClose(usbManager, device);
            runOnUiThread(() -> {
                portTestRunning = false;
                if (!isFinishing()) {
                    lastPortResult = result;
                    render();
                }
            });
        }, "hannaada-usb-port-test").start();
    }

    private void requestUsbPermission(UsbDevice candidate) {
        if (usbManager == null || candidate == null) {
            render();
            return;
        }
        Map<String, UsbDevice> devices = currentDevices();
        UsbDevice current = devices == null ? null : devices.get(candidate.getDeviceName());
        if (current == null || current.getVendorId() != candidate.getVendorId()
                || current.getProductId() != candidate.getProductId()) {
            render();
            return;
        }
        Intent scoped = new Intent(ACTION_PERMISSION).setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent response = PendingIntent.getBroadcast(this, 0, scoped, flags);
        usbManager.requestPermission(current, response);
    }
}
