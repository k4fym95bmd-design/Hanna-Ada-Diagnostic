package app.hannaada.usbprobe;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
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

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * OFF-VEHICLE USB compatibility inspection ONLY.
 * No Internet permission, USB port open, serial driver, transfers or ECU commands.
 * In particular, merely enumerating a VID:PID never proves BMW compatibility.
 */
public final class MainActivity extends Activity {
    private static final String ACTION_PERMISSION = "app.hannaada.usbprobe.USB_PERMISSION";
    private UsbManager usbManager;
    private LinearLayout content;
    private boolean receiverRegistered;

    private final BroadcastReceiver usbEvents = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_PERMISSION.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)
                    || UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                // Never trust broadcast extras as proof of permission or connection:
                // refresh from the OS's current state instead.
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

    private void render() {
        content.removeAllViews();
        label("HANNA & ADA  /  USB TEST", 22, Color.rgb(100, 168, 255));
        label("ONLY OFF THE VEHICLE · NO DIAGNOSTIC COMMANDS", 13, Color.rgb(255, 145, 145));
        label("Android API: " + Build.VERSION.SDK_INT, 16, Color.WHITE);

        boolean host = getPackageManager().hasSystemFeature(PackageManager.FEATURE_USB_HOST);
        label("USB host feature: " + (host ? "REPORTED" : "NOT REPORTED"), 17,
                host ? Color.rgb(155, 227, 190) : Color.rgb(255, 167, 122));
        label("This is an OS declaration, not proof that the tablet powers or enumerates an OTG peripheral.",
                13, Color.LTGRAY);
        action("Refresh USB status", view -> render());
        if (!host || usbManager == null) {
            label("STOP: USB host is unavailable or cannot be read. No cable driver will be activated.",
                    16, Color.rgb(255, 145, 145));
            return;
        }
        Map<String, UsbDevice> devices = usbManager.getDeviceList();
        if (devices == null || devices.isEmpty()) {
            label("Enumerated USB devices: 0. Test with an existing low-power peripheral and a known-good OTG adapter, away from the vehicle.",
                    16, Color.LTGRAY);
            return;
        }
        label("Enumerated USB devices: " + devices.size(), 17, Color.WHITE);
        // Sort by non-exported internal names for stable ordering, but never show names:
        // some vendor implementations include potentially identifying USB paths here.
        List<String> keys = new ArrayList<>(devices.keySet());
        Collections.sort(keys);
        int ordinal = 0;
        for (String key : keys) {
            final UsbDevice device = devices.get(key);
            if (device == null) continue;
            ordinal++;
            label("Device " + ordinal + " · VID:PID " + usbId(device)
                            + " · interfaces " + device.getInterfaceCount(),
                    16, Color.rgb(180, 209, 245));
            boolean permitted = usbManager.hasPermission(device);
            label("Android permission: " + (permitted ? "GRANTED" : "NOT GRANTED"),
                    14, permitted ? Color.rgb(155, 227, 190) : Color.LTGRAY);
            if (!permitted) {
                action("Request permission for device " + ordinal, view -> requestUsbPermission(device));
            }
        }
        label("Enumeration and permission do NOT verify a serial driver, K-line, an ECU or a vehicle. "
                        + "No USB device is opened and no data is sent or uploaded.", 13, Color.LTGRAY);
    }

    private void requestUsbPermission(UsbDevice candidate) {
        if (usbManager == null
                || !getPackageManager().hasSystemFeature(PackageManager.FEATURE_USB_HOST)
                || candidate == null) {
            render();
            return;
        }
        UsbDevice current = usbManager.getDeviceList().get(candidate.getDeviceName());
        if (current == null
                || current.getVendorId() != candidate.getVendorId()
                || current.getProductId() != candidate.getProductId()) {
            render();
            return;
        }
        Intent scoped = new Intent(ACTION_PERMISSION).setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // The USB framework must populate permission extras. Android 12+ needs a
        // mutable PendingIntent for that; older releases have no such flag.
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent response = PendingIntent.getBroadcast(this, 0, scoped, flags);
        usbManager.requestPermission(current, response);
    }
}
