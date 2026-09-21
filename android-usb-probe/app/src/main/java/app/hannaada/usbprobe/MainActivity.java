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

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * ONLY an off-vehicle, offline USB capability test. It has no Internet permission,
 * port opening, transfers, ELM/BMW commands or diagnostic functionality.
 */
public final class MainActivity extends Activity {
    private static final String ACTION_PERMISSION = "app.hannaada.usbprobe.USB_PERMISSION";
    private UsbManager usbManager;
    private LinearLayout content;
    private boolean receiverRegistered;

    private final BroadcastReceiver usbEvents = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            if (ACTION_PERMISSION.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                // A broadcast never proves access: re-read actual system state.
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
        // Names are ONLY used internally for stable ordering; never displayed or exported.
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
        return UsbReport.build(Build.VERSION.SDK_INT, hostFeature(), devices != null, snapshot);
    }

    private void copyReport() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            Toast.makeText(this, "Schowek niedostępny", Toast.LENGTH_SHORT).show();
            return;
        }
        // Fresh state at tap time; report accepts no USB paths, serials or ECU data.
        clipboard.setPrimaryClip(ClipData.newPlainText("Raport USB Hanna Ada", currentReport()));
        Toast.makeText(this, "Raport skopiowany — wklej go do rozmowy", Toast.LENGTH_LONG).show();
    }

    private void render() {
        content.removeAllViews();
        label("HANNA & ADA  /  TEST USB", 22, Color.rgb(100, 168, 255));
        label("TYLKO POZA SAMOCHODEM · BEZ POLECEŃ DO ECU", 13, Color.rgb(255, 145, 145));
        label("Android API: " + Build.VERSION.SDK_INT, 16, Color.WHITE);

        boolean host = hostFeature();
        label("1. USB Host (deklaracja Androida): " + (host ? "TAK" : "NIE"), 17,
                host ? Color.rgb(155, 227, 190) : Color.rgb(255, 167, 122));
        label("Sama deklaracja nie dowodzi, że port micro-USB obsługuje OTG.", 13, Color.LTGRAY);
        action("Odśwież wynik USB", view -> render());

        Map<String, UsbDevice> devices = currentDevices();
        if (devices == null) {
            label("2. Lista USB niedostępna. Nie ma potwierdzenia trybu host.",
                    16, Color.rgb(255, 167, 122));
        } else if (devices.isEmpty()) {
            label("2. Wykryte urządzenia: 0 — OTG nadal niepotwierdzone.",
                    16, Color.rgb(255, 167, 122));
            label("Przetestuj poza autem posiadaną przejściówkę micro-USB OTG i zwykły pendrive; "
                    + "następnie wybierz «Odśwież wynik USB». Nie kupuj kabla na podstawie tego ekranu.",
                    14, Color.LTGRAY);
        } else {
            label("2. Wykryte urządzenia: " + devices.size()
                    + " — system widzi sprzęt USB.", 17, Color.rgb(155, 227, 190));
            if (!host) {
                label("Uwaga: wykrywanie USB i deklaracja systemu są sprzeczne; wymagany test na tablecie.",
                        13, Color.rgb(255, 167, 122));
            }
            int ordinal = 0;
            for (String key : sortedKeys(devices)) {
                final UsbDevice device = devices.get(key);
                if (device == null) continue;
                ++ordinal;
                label("Urządzenie " + ordinal + " · VID:PID " + usbId(device)
                        + " · interfejsy " + device.getInterfaceCount(),
                        16, Color.rgb(180, 209, 245));
                boolean permitted = usbManager.hasPermission(device);
                label("3. Zgoda Androida: " + (permitted ? "UDZIELONA" : "BRAK"),
                        14, permitted ? Color.rgb(155, 227, 190) : Color.LTGRAY);
                if (!permitted) {
                    action("Poproś o zgodę: urządzenie " + ordinal,
                            view -> requestUsbPermission(device));
                }
            }
            label("Wykrycie USB i zgoda NIE potwierdzają sterownika, kabla K-line ani połączenia z BMW.",
                    13, Color.LTGRAY);
        }
        action("Kopiuj bezpieczny raport do ChatGPT", view -> copyReport());
        label("Raport zawiera tylko wersję Androida, deklarację USB Host, VID:PID, liczbę "
                + "interfejsów i status zgody. Nie zbiera numerów seryjnych ani danych pojazdu. "
                + "Program nie otwiera portu i niczego nie wysyła.", 13, Color.LTGRAY);
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
        // Android 12+ USB framework must be able to populate permission extras.
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent response = PendingIntent.getBroadcast(this, 0, scoped, flags);
        usbManager.requestPermission(current, response);
    }
}
