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
import android.hardware.usb.UsbDeviceConnection;
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
 * data transfers, ELM/BMW commands, port configuration or diagnostic functionality.
 * USB access test opens and immediately closes an OS handle; it never claims an interface.
 */
public final class MainActivity extends Activity {
    private static final String ACTION_PERMISSION = "app.hannaada.usbprobe.USB_PERMISSION";
    private UsbManager usbManager;
    private LinearLayout content;
    private boolean receiverRegistered;
    private String testedDeviceName;
    private String accessResult;

    private final BroadcastReceiver usbEvents = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();
            if (ACTION_PERMISSION.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                // Detach/attach invalidates the previous physical-device test.
                if (!ACTION_PERMISSION.equals(action)) resetAccessTest();
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

    private void resetAccessTest() {
        testedDeviceName = null;
        accessResult = null;
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

    private static boolean isObservedFtdiId(UsbDevice device) {
        // A USB descriptor alone does NOT prove that the IC is genuine or that serial works.
        return device != null && device.getVendorId() == 0x0403 && device.getProductId() == 0x6001;
    }

    private boolean hostFeature() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_USB_HOST);
    }

    private Map<String, UsbDevice> currentDevices() {
        return usbManager == null ? null : usbManager.getDeviceList();
    }

    private List<String> sortedKeys(Map<String, UsbDevice> devices) {
        List<String> keys = new ArrayList<>(devices.keySet());
        // Names are only used internally for stable ordering; never displayed or exported.
        Collections.sort(keys);
        return keys;
    }

    private boolean matchesTestedDevice(UsbDevice device) {
        return device != null && accessResult != null && testedDeviceName != null
                && testedDeviceName.equals(device.getDeviceName())
                && usbManager != null && usbManager.hasPermission(device)
                && isObservedFtdiId(device);
    }

    private String currentReport() {
        Map<String, UsbDevice> devices = currentDevices();
        List<UsbReport.Device> snapshot = new ArrayList<>();
        boolean matchingDevice = false;
        if (devices != null) {
            for (String key : sortedKeys(devices)) {
                UsbDevice device = devices.get(key);
                if (device != null) {
                    snapshot.add(new UsbReport.Device(device.getVendorId(), device.getProductId(),
                            device.getInterfaceCount(), usbManager.hasPermission(device)));
                    if (matchesTestedDevice(device)) matchingDevice = true;
                }
            }
        }
        String report = UsbReport.build(Build.VERSION.SDK_INT, hostFeature(), devices != null, snapshot);
        return report + "Test otwarcia uchwytu USB (bez transmisji): "
                + (matchingDevice ? accessResult : "NIEPRZEPROWADZONY / NIEAKTUALNY") + "\n";
    }

    private void copyReport() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            Toast.makeText(this, "Schowek niedostępny", Toast.LENGTH_SHORT).show();
            return;
        }
        // No USB paths, serial numbers, VIN or ECU data ever enter the report.
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
            resetAccessTest();
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
                if (isObservedFtdiId(device)) {
                    label("Identyfikator FTDI 0403:6001 (typ USB-Serial). Oryginalność układu, sterownik i K-line NIEPOTWIERDZONE.",
                            14, Color.rgb(155, 227, 190));
                }
                boolean permitted = usbManager.hasPermission(device);
                label("3. Zgoda Androida: " + (permitted ? "UDZIELONA" : "BRAK"),
                        14, permitted ? Color.rgb(155, 227, 190) : Color.LTGRAY);
                if (!permitted) {
                    action("Poproś o zgodę: urządzenie " + ordinal,
                            view -> requestUsbPermission(device));
                } else if (isObservedFtdiId(device)) {
                    action("Test dostępu do kabla USB (BEZ transmisji)",
                            view -> testUsbAccess(device));
                    if (matchesTestedDevice(device)) {
                        label("4. Uchwyt USB: " + accessResult, 15,
                                "UDANY".equals(accessResult) ? Color.rgb(155, 227, 190)
                                        : Color.rgb(255, 167, 122));
                    }
                }
            }
            label("Wykrycie USB, zgoda i otwarcie uchwytu NIE potwierdzają sterownika szeregowego ani połączenia z BMW.",
                    13, Color.LTGRAY);
        }
        action("Kopiuj bezpieczny raport do ChatGPT", view -> copyReport());
        label("Raport: wersja Androida, USB Host, VID:PID, liczba interfejsów, zgoda i wynik dostępu. "
                + "Bez numerów seryjnych i danych pojazdu. Program nie konfiguruje portu, "
                + "nie odbiera ani nie wysyła danych.", 13, Color.LTGRAY);
    }

    private void testUsbAccess(UsbDevice candidate) {
        // Require a fresh, permissioned FTDI-descriptor match. Never run against other USB devices.
        Map<String, UsbDevice> devices = currentDevices();
        UsbDevice current = devices == null || candidate == null ? null
                : devices.get(candidate.getDeviceName());
        resetAccessTest();
        if (usbManager == null || current == null || !isObservedFtdiId(current)
                || !usbManager.hasPermission(current)) {
            render();
            return;
        }
        UsbDeviceConnection connection = null;
        String result = "NIEUDANY";
        try {
            connection = usbManager.openDevice(current);
            if (connection != null) result = "UDANY";
        } catch (RuntimeException ignored) {
            // Never export exception content: vendor implementations may include USB paths.
            result = "NIEUDANY";
        } finally {
            if (connection != null) connection.close();
        }
        testedDeviceName = current.getDeviceName(); // Internal only; not copied or displayed.
        accessResult = result;
        render();
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
