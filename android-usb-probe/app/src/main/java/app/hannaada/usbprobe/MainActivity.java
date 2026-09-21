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
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Offline, off-vehicle USB inspector. No serial communication, ECU commands or Internet. */
public final class MainActivity extends Activity {
    private static final String ACTION_PERMISSION = "app.hannaada.usbprobe.USB_PERMISSION";
    private UsbManager usbManager;
    private LinearLayout content;
    private TabletUi ui;
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
                if (!ACTION_PERMISSION.equals(action)) resetAccessTest();
                render();
            }
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
        ui = new TabletUi(this);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(TabletUi.BG);
        content = ui.column();
        int padding = ui.dp(ui.isWide() ? 25 : 17);
        content.setPadding(padding, ui.dp(21), padding, ui.dp(35));
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

    private static String usbId(UsbDevice device) {
        return String.format(Locale.US, "%04X:%04X", device.getVendorId(), device.getProductId());
    }

    private static boolean isObservedFtdiId(UsbDevice device) {
        // Identifier is evidence of a descriptor, NOT proof of authentic FTDI silicon or K-line.
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
        // System USB paths stay internal and never enter the clipboard/report.
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
        return UsbReport.build(Build.VERSION.SDK_INT, hostFeature(), devices != null, snapshot)
                + "Test uchwytu USB (bez transmisji): "
                + (matchingDevice ? accessResult : "NIEPRZEPROWADZONY / NIEAKTUALNY") + "\n";
    }

    private void copyReport() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            Toast.makeText(this, "Schowek niedostępny", Toast.LENGTH_SHORT).show();
            return;
        }
        clipboard.setPrimaryClip(ClipData.newPlainText("Raport USB Hanna Ada", currentReport()));
        Toast.makeText(this, "Raport skopiowany — możesz też wysłać zdjęcie ekranu", Toast.LENGTH_LONG).show();
    }

    private void render() {
        if (content == null || ui == null) return;
        content.removeAllViews();
        Map<String, UsbDevice> devices = currentDevices();
        boolean host = hostFeature();
        int count = devices == null ? 0 : devices.size();
        UsbDevice selected = null;
        UsbDevice ftdi = null;
        if (devices != null) {
            for (String key : sortedKeys(devices)) {
                UsbDevice device = devices.get(key);
                if (device == null) continue;
                if (selected == null) selected = device;
                if (ftdi == null && isObservedFtdiId(device)) ftdi = device;
            }
        }
        if (count == 0) resetAccessTest();
        boolean ftdiGranted = ftdi != null && usbManager != null && usbManager.hasPermission(ftdi);
        ui.header(content);
        if (ftdiGranted) {
            ui.hero(content, "Kabel USB wykryty",
                    "Android wykrył identyfikator typu FTDI i przyznał dostęp. Następny test nie przesyła żadnych danych.",
                    TabletUi.GREEN, "USB 0403:6001  •  ZGODA UDZIELONA");
        } else if (ftdi != null) {
            ui.hero(content, "Kabel USB wykryty",
                    "Przejściówka działa. Aby sprawdzić dostęp do kabla, najpierw udziel zgody systemowej Androida.",
                    TabletUi.AMBER, "USB 0403:6001  •  OCZEKUJE NA ZGODĘ");
        } else if (count > 0) {
            ui.hero(content, "Urządzenie USB wykryte",
                    "Port OTG działa. Podłączony sprzęt nie ma identyfikatora 0403:6001 naszego testowanego kabla.",
                    TabletUi.BLUE, "WYKRYTE URZĄDZENIA: " + count);
        } else {
            ui.hero(content, "Czekam na urządzenie USB",
                    "Podłącz poza samochodem kabel przez przejściówkę micro-USB OTG i odśwież wynik.",
                    TabletUi.AMBER, "BEZ POŁĄCZENIA Z AUTEM");
        }

        ui.sectionTitle(content, "01  /  STAN SPRZĘTU");
        LinearLayout hostCard = ui.metric("shield", "USB HOST / OTG",
                count > 0 ? "WYKRYWA USB" : (host ? "DEKLARACJA: TAK" : "NIEPOTWIERDZONE"),
                count > 0 ? "System widzi fizyczne urządzenie przez port micro-USB."
                        : "Sama deklaracja Androida nie dowodzi działania portu OTG.",
                count > 0 ? TabletUi.GREEN : TabletUi.AMBER);
        LinearLayout deviceCard = ui.metric("chip", "URZĄDZENIA USB",
                count > 0 ? String.valueOf(count) + " WYKRYTE" : "BRAK",
                ftdi != null ? "Rozpoznano deskryptor typu FTDI 0403:6001."
                        : "Identyfikator kabla wyświetli się po podłączeniu.",
                count > 0 ? TabletUi.GREEN : TabletUi.AMBER);
        ui.metrics(content, hostCard, deviceCard);

        ui.sectionTitle(content, "02  /  SZCZEGÓŁY INTERFEJSU");
        LinearLayout detailCard = ui.card();
        if (selected == null) {
            detailCard.addView(ui.text("Brak podłączonego urządzenia", 19, TabletUi.WHITE, true));
            ui.gap(detailCard, 10);
            detailCard.addView(ui.text("Jeżeli podłączyłeś kabel, sprawdź przejściówkę OTG i wybierz Odśwież.",
                    15, TabletUi.MUTED, false));
        } else {
            UsbDevice shown = ftdi != null ? ftdi : selected;
            detailCard.addView(ui.text(ftdi != null ? "K+DCAN — deskryptor USB-Serial" : "Podłączone urządzenie USB",
                    19, TabletUi.WHITE, true));
            ui.gap(detailCard, 15);
            ui.detail(detailCard, "Identyfikator USB", usbId(shown), TabletUi.BLUE);
            ui.detail(detailCard, "Interfejsy", String.valueOf(shown.getInterfaceCount()), TabletUi.WHITE);
            boolean permitted = usbManager.hasPermission(shown);
            ui.detail(detailCard, "Zgoda Androida", permitted ? "UDZIELONA" : "BRAK",
                    permitted ? TabletUi.GREEN : TabletUi.AMBER);
            if (isObservedFtdiId(shown)) {
                ui.detail(detailCard, "Uchwyt USB", matchesTestedDevice(shown) ? accessResult : "NIEBADANY",
                        matchesTestedDevice(shown) && "UDANY".equals(accessResult)
                                ? TabletUi.GREEN : TabletUi.AMBER);
            }
            detailCard.addView(ui.text("Deskryptor i zgoda nie potwierdzają sterownika, autentyczności układu ani komunikacji z BMW.",
                    14, TabletUi.MUTED, false));
        }
        content.addView(detailCard);
        ui.gap(content, 21);

        ui.sectionTitle(content, "03  /  DZIAŁANIE");
        if (ftdi != null && !ftdiGranted) {
            final UsbDevice target = ftdi;
            ui.button(content, "Poproś Androida o dostęp", "+", true,
                    view -> requestUsbPermission(target));
        } else if (ftdiGranted) {
            final UsbDevice target = ftdi;
            ui.button(content, "Sprawdź dostęp USB", "+", true,
                    view -> testUsbAccess(target));
        }
        ui.button(content, "Odśwież wynik USB", "↻", ftdi == null,
                view -> { resetAccessTest(); render(); });
        ui.button(content, "Kopiuj bezpieczny raport", "▤", false, view -> copyReport());
        ui.gap(content, 10);
        ui.note(content, "TRYB TESTOWY  •  TYLKO POZA SAMOCHODEM\n"
                + "Bez połączenia z ECU, bez komend diagnostycznych, bez transmisji przez kabel i bez Internetu. "
                + "Możesz wysłać samo zdjęcie ekranu zamiast kopiowania raportu.");
    }

    private void testUsbAccess(UsbDevice candidate) {
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
            // Never expose exception content, which may contain USB paths.
            result = "NIEUDANY";
        } finally {
            if (connection != null) connection.close();
        }
        testedDeviceName = current.getDeviceName(); // Internal only.
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
