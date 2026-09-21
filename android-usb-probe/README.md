# Hanna & Ada — Android 5 USB capability probe

**Engineering test module inside the existing Hanna & Ada repository, not a second vehicle diagnostic application.** Targets API 21/Android 5 on the Lenovo TB3-710F; does not depend on Capacitor, Chrome or the Floot action quota.

## What it does

- Shows the installed Android API level and the OS-reported USB-host feature.
- Refreshes the local USB device list and shows only VID:PID and interface count. Device names, serial numbers and product strings are not rendered, stored or uploaded.
- Can request Android's permission for a selected, currently enumerated USB device after an explicit tap, then re-reads `UsbManager.hasPermission` instead of trusting broadcast contents.
- Listens for USB attach/detach to invalidate what is displayed.
- Contains no `INTERNET` permission, `openDevice`, USB transfers, serial libraries, ELM commands or vehicle code. Never declares a BMW session verified.

## Intended zero-purchase check

Use **only away from the car**, with an already-owned working micro-USB OTG adapter and a low-power ordinary USB peripheral. The tablet must first report host support and actually enumerate the peripheral. A reported host feature alone is not a hardware proof; failure to detect one peripheral is not conclusive either. No equipment purchase is justified solely by this probe.

If later given a particular existing diagnostic cable, record only its observed VID:PID and separately identify its actual chipset. Enumeration/permission is *not* evidence of a compatible USB serial driver, valid BMW K-line electrical interface, 20-pin routing or ECU data. Those are independent future work gates.

## Build and status

The `Android 5 USB capability probe` GitHub Actions workflow compiles the debug-only `app-debug.apk` and saves it as a seven-day workflow artifact. Gradle 7.6.4, Android Gradle Plugin 7.4.2, Java 17 toolchain, Android compile SDK 33; app `minSdk 21`, `targetSdk 28`, no external Java dependencies. Successful CI compile does **not** demonstrate installation, OTG or connection on the actual tablet. No Android app store or Floot mobile build is used here. Any installation must use the user's trusted, project-owned build artifact; do not install APKs from third-party mirrors.

## Next stage, conditional

After a physical off-vehicle test, document actual tablet OS API/host response and non-sensitive VID:PID result. If no host is proven, retain this tablet as a diagnostic viewer and do not assume a USB cable can be made to work by changing web hosting. If host and device enumeration are demonstrated, independently determine the chip, Android serial driver compatibility and transport before any read-only vehicle diagnostic implementation. No ECU writes, active tests, clearing, flashing, coding or tuning are authorized by this probe.

Refs: `docs/TB3_710F_USB_FEASIBILITY.md`, `docs/KDCAN_ANDROID.md`, `public/android-usb-readiness.js`; official Android USB host documentation: https://developer.android.com/develop/connectivity/usb/host.
