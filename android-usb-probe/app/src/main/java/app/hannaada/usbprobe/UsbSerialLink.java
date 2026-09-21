package app.hannaada.usbprobe;

import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;

import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;

import java.util.List;

/**
 * A manual USB SERIAL open/close test for DISCONNECTED, off-vehicle adapters only.
 * No baud-rate changes, reads, writes, BMW/ELM commands or ECU communication.
 */
final class UsbSerialLink {
    private UsbSerialLink() { }

    static UsbSerialDriver findDriver(UsbManager manager, UsbDevice target) {
        if (manager == null || target == null) return null;
        List<UsbSerialDriver> drivers = UsbSerialProber.getDefaultProber().findAllDrivers(manager);
        for (UsbSerialDriver driver : drivers) {
            if (driver.getDevice().getDeviceName().equals(target.getDeviceName())
                    && driver.getDevice().getVendorId() == target.getVendorId()
                    && driver.getDevice().getProductId() == target.getProductId()) {
                return driver;
            }
        }
        return null;
    }

    static String testOpenAndClose(UsbManager manager, UsbDevice device) {
        if (manager == null || device == null) return "USB niedostępne na tablecie.";
        if (!manager.hasPermission(device)) return "Brak zgody Androida na dostęp do USB.";
        UsbSerialDriver driver = findDriver(manager, device);
        if (driver == null) return "Nie znaleziono pasującego sterownika USB-serial dla tego VID:PID.";
        if (driver.getPorts().isEmpty()) return "Sterownik rozpoznany, ale nie udostępnia portu.";

        UsbDeviceConnection connection = null;
        UsbSerialPort port = driver.getPorts().get(0);
        boolean opened = false;
        String result;
        try {
            connection = manager.openDevice(device);
            if (connection == null) return "Android nie otworzył urządzenia USB — sprawdź zgodę lub OTG.";
            port.open(connection);
            opened = true;
            result = "SUKCES: sterownik " + driver.getClass().getSimpleName()
                    + " otworzył port USB-serial. Żadnych danych nie wysłano do auta.";
        } catch (Exception failure) {
            // Deliberately omit exception messages: they may contain device paths or serials.
            result = "Port USB-serial nie otworzył się (" + failure.getClass().getSimpleName()
                    + "). Sprawdź OTG, zasilanie adaptera i zgodę Androida.";
        } finally {
            try {
                if (opened) port.close();
                else if (connection != null) connection.close();
            } catch (Exception closeFailure) {
                // Never silently report a clean close if it failed.
                result = "Uwaga: błąd zamknięcia portu; odłącz adapter USB poza samochodem.";
            }
        }
        return result + " Test nie potwierdza komunikacji z BMW ani zgodności K+DCAN.";
    }
}
