use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostStatus {
    version: u8,
    host: &'static str,
    mode: &'static str,
    platform: &'static str,
    offline_capable: bool,
    transport_authority: &'static str,
    ecu_verified: bool,
    writes_enabled: bool,
    coding_enabled: bool,
    actuation_enabled: bool,
    flash_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SafetyPolicy {
    version: u8,
    read_only_first: bool,
    max_outstanding_requests: u8,
    raw_serial_write_exposed_to_ui: bool,
    arbitrary_shell_exposed_to_ui: bool,
    arbitrary_filesystem_exposed_to_ui: bool,
    writes_enabled: bool,
    coding_enabled: bool,
    actuation_enabled: bool,
    flash_enabled: bool,
}

#[tauri::command]
fn desktop_host_status() -> HostStatus {
    HostStatus {
        version: 1,
        host: "tauri",
        mode: "desktop-pro",
        platform: std::env::consts::OS,
        offline_capable: true,
        transport_authority: "native-desktop",
        ecu_verified: false,
        writes_enabled: false,
        coding_enabled: false,
        actuation_enabled: false,
        flash_enabled: false,
    }
}

#[tauri::command]
fn desktop_safety_policy() -> SafetyPolicy {
    SafetyPolicy {
        version: 1,
        read_only_first: true,
        max_outstanding_requests: 1,
        raw_serial_write_exposed_to_ui: false,
        arbitrary_shell_exposed_to_ui: false,
        arbitrary_filesystem_exposed_to_ui: false,
        writes_enabled: false,
        coding_enabled: false,
        actuation_enabled: false,
        flash_enabled: false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_host_status,
            desktop_safety_policy
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Hanna & Ada Diagnostics PRO desktop host");
}
