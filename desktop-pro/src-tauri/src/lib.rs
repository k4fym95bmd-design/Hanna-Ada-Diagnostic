mod desktop_serial_inventory;
mod desktop_native_serial;
mod desktop_transport_coordinator;

use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostStatus {
    version: u8,
    host: &'static str,
    mode: &'static str,
    platform: &'static str,
    evidence_contract_version: u8,
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
        evidence_contract_version: 1,
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
fn desktop_list_serial_ports() -> Result<Vec<desktop_serial_inventory::DesktopSerialCandidate>, String> {
    desktop_serial_inventory::list_sanitized_ports()
}

#[tauri::command]
fn desktop_bind_serial_candidate(
    port_name: String,
    state: State<'_, Mutex<desktop_transport_coordinator::DesktopTransportCoordinator>>,
    native: State<'_, Mutex<desktop_native_serial::DesktopNativeSerialState>>,
) -> Result<desktop_transport_coordinator::DesktopTransportSnapshot, String> {
    let inventory = desktop_serial_inventory::list_sanitized_ports()?;
    // Lock order is always coordinator -> native across every command.
    let mut coordinator = state.lock().map_err(|_| "transport_state_poisoned".to_string())?;
    let native = native.lock().map_err(|_| "native_serial_state_poisoned".to_string())?;
    if native.is_open() {
        return Err("close_native_port_before_rebind".into());
    }
    coordinator.bind_from_inventory(&inventory, &port_name)
}

#[tauri::command]
fn desktop_clear_serial_candidate(
    state: State<'_, Mutex<desktop_transport_coordinator::DesktopTransportCoordinator>>,
    native: State<'_, Mutex<desktop_native_serial::DesktopNativeSerialState>>,
) -> Result<desktop_transport_coordinator::DesktopTransportSnapshot, String> {
    let mut coordinator = state.lock().map_err(|_| "transport_state_poisoned".to_string())?;
    let mut native = native.lock().map_err(|_| "native_serial_state_poisoned".to_string())?;
    native.close_any();
    Ok(coordinator.clear())
}

#[tauri::command]
fn desktop_open_configured_port(
    epoch: u64,
    protocol: String,
    baud_rate: u32,
    state: State<'_, Mutex<desktop_transport_coordinator::DesktopTransportCoordinator>>,
    native: State<'_, Mutex<desktop_native_serial::DesktopNativeSerialState>>,
) -> Result<desktop_transport_coordinator::DesktopTransportSnapshot, String> {
    let mut coordinator = state.lock().map_err(|_| "transport_state_poisoned".to_string())?;
    let bound = coordinator.snapshot();
    let mut native = native.lock().map_err(|_| "native_serial_state_poisoned".to_string())?;
    native.open_configured(&bound, epoch, &protocol, baud_rate)?;
    match coordinator.mark_open_configured(epoch) {
        Ok(snapshot) => Ok(snapshot),
        Err(error) => {
            // Never leave a native handle open if coordinator promotion fails.
            native.close_any();
            Err(error)
        }
    }
}

#[tauri::command]
fn desktop_read_bounded(
    epoch: u64,
    max_bytes: usize,
    timeout_ms: u64,
    state: State<'_, Mutex<desktop_transport_coordinator::DesktopTransportCoordinator>>,
    native: State<'_, Mutex<desktop_native_serial::DesktopNativeSerialState>>,
) -> Result<desktop_native_serial::DesktopReadResult, String> {
    let mut coordinator = state.lock().map_err(|_| "transport_state_poisoned".to_string())?;
    let snapshot = coordinator.snapshot();
    if snapshot.epoch != epoch || !snapshot.transport_open || !snapshot.configured {
        return Err("transport_not_configured_for_epoch".into());
    }

    let mut native = native.lock().map_err(|_| "native_serial_state_poisoned".to_string())?;
    match native.read_bounded(epoch, max_bytes, timeout_ms) {
        Ok(result) => Ok(result),
        Err(error) => {
            native.close_any();
            let _ = coordinator.mark_closed(epoch);
            Err(error)
        }
    }
}

#[tauri::command]
fn desktop_close_port(
    epoch: u64,
    state: State<'_, Mutex<desktop_transport_coordinator::DesktopTransportCoordinator>>,
    native: State<'_, Mutex<desktop_native_serial::DesktopNativeSerialState>>,
) -> Result<desktop_transport_coordinator::DesktopTransportSnapshot, String> {
    let mut coordinator = state.lock().map_err(|_| "transport_state_poisoned".to_string())?;
    let snapshot = coordinator.snapshot();
    if snapshot.epoch != epoch {
        return Err("stale_epoch".into());
    }
    let mut native = native.lock().map_err(|_| "native_serial_state_poisoned".to_string())?;
    native.close_any();
    coordinator.mark_closed(epoch)
}

#[tauri::command]
fn desktop_transport_snapshot(
    state: State<'_, Mutex<desktop_transport_coordinator::DesktopTransportCoordinator>>,
) -> Result<desktop_transport_coordinator::DesktopTransportSnapshot, String> {
    let coordinator = state.lock().map_err(|_| "transport_state_poisoned".to_string())?;
    Ok(coordinator.snapshot())
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
        .manage(Mutex::new(desktop_transport_coordinator::DesktopTransportCoordinator::default()))
        .manage(Mutex::new(desktop_native_serial::DesktopNativeSerialState::default()))
        .invoke_handler(tauri::generate_handler![
            desktop_host_status,
            desktop_list_serial_ports,
            desktop_bind_serial_candidate,
            desktop_clear_serial_candidate,
            desktop_open_configured_port,
            desktop_read_bounded,
            desktop_close_port,
            desktop_transport_snapshot,
            desktop_safety_policy
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Hanna & Ada Diagnostics PRO desktop host");
}
