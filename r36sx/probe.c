/* Hanna & Ada R36SX feasibility probe. Read-only: never opens USB/serial ports,
 * never sends commands, never writes files or changes the system. STDOUT only.
 * This CLI program is NOT yet integrated with the console display/launcher. */
#define _POSIX_C_SOURCE 200809L
#include <ctype.h>
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *root;

static int full_path(char *dst, size_t size, const char *path) {
    int n = snprintf(dst, size, "%s%s", root, path);
    return n >= 0 && (size_t)n < size;
}

static int read_value(const char *path, char *value, size_t size) {
    char full[512];
    if (!full_path(full, sizeof(full), path)) return 0;
    FILE *f = fopen(full, "r");
    if (!f) return 0;
    if (!fgets(value, (int)size, f)) { fclose(f); return 0; }
    fclose(f);
    value[strcspn(value, "\r\n")] = '\0';
    return 1;
}

static int valid_hex4(const char *value) {
    if (strlen(value) != 4) return 0;
    for (size_t i = 0; i < 4; ++i)
        if (!isxdigit((unsigned char)value[i])) return 0;
    return 1;
}

static void cpu_info(void) {
    char path[512], line[256];
    puts("[CPU]");
    if (!full_path(path, sizeof(path), "/proc/cpuinfo")) return;
    FILE *f = fopen(path, "r");
    if (!f) { puts("CPU info: unavailable"); return; }
    unsigned shown = 0;
    while (fgets(line, sizeof(line), f) && shown < 5) {
        if (strstr(line, "cpu model") || strstr(line, "system type") ||
            strstr(line, "processor") || strstr(line, "machine")) {
            fputs(line, stdout);
            ++shown;
        }
    }
    fclose(f);
    if (!shown) puts("CPU identification: not exposed");
}

static void usb_inventory(void) {
    char directory[512];
    puts("[USB sysfs: inventory only, NOT a cable/driver test]");
    if (!full_path(directory, sizeof(directory), "/sys/bus/usb/devices")) return;
    DIR *dir = opendir(directory);
    if (!dir) { puts("USB sysfs: unavailable"); return; }
    unsigned found = 0;
    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_name[0] == '.') continue;
        char vendor_path[512], product_path[512], vendor[32], product[32];
        int a = snprintf(vendor_path, sizeof(vendor_path),
                         "/sys/bus/usb/devices/%s/idVendor", entry->d_name);
        int b = snprintf(product_path, sizeof(product_path),
                         "/sys/bus/usb/devices/%s/idProduct", entry->d_name);
        if (a < 0 || b < 0 || (size_t)a >= sizeof(vendor_path) ||
            (size_t)b >= sizeof(product_path)) continue;
        if (read_value(vendor_path, vendor, sizeof(vendor)) &&
            read_value(product_path, product, sizeof(product)) &&
            valid_hex4(vendor) && valid_hex4(product)) {
            printf("USB device %s VID:PID %s:%s (identity unverified)\n",
                   entry->d_name, vendor, product);
            ++found;
        }
    }
    closedir(dir);
    if (!found) puts("No USB VID/PID entries visible");
}

static void serial_inventory(void) {
    char directory[512];
    puts("[Serial device names: inventory only, never opened]");
    if (!full_path(directory, sizeof(directory), "/dev")) return;
    DIR *dir = opendir(directory);
    if (!dir) { puts("/dev: unavailable"); return; }
    unsigned found = 0;
    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (strncmp(entry->d_name, "ttyUSB", 6) == 0 ||
            strncmp(entry->d_name, "ttyACM", 6) == 0) {
            printf("Serial node: /dev/%s (driver/function unverified)\n", entry->d_name);
            ++found;
        }
    }
    closedir(dir);
    if (!found) puts("No ttyUSB/ttyACM nodes visible");
}

int main(void) {
    const char *test_root = getenv("HANNA_ADA_PROBE_ROOT");
    root = test_root ? test_root : "";
    puts("HANNA & ADA | R36SX H.OS feasibility probe v0.1");
    puts("MODE: READ ONLY | NO CAR | NO SERIAL IO | NO STORAGE WRITES");
    cpu_info();
    usb_inventory();
    serial_inventory();
    puts("RESULT: inventory collected; console UI, USB host and INPA compatibility NOT VERIFIED");
    return 0;
}
