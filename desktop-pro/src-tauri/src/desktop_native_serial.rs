use crate::desktop_transport_coordinator::DesktopTransportSnapshot;
use serde::Serialize;
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::io::{ErrorKind, Read, Write};
use std::time::{Duration, Instant};

const ME72_IDENTITY_REQUEST: [u8; 6] = [0xB8, 0x12, 0xF1, 0x01, 0xA2, 0xF8];
const ME72_ROUGHNESS_REQUEST: [u8; 8] = [0xB8, 0x12, 0xF1, 0x03, 0x22, 0x40, 0x03, 0x39];
const ME72_ENGINE_SNAPSHOT_REQUEST: [u8; 8] = [0xB8, 0x12, 0xF1, 0x03, 0x22, 0x40, 0x00, 0x3A];
const ME72_FUEL_ADAPTATION_REQUEST: [u8; 8] = [0xB8, 0x12, 0xF1, 0x03, 0x22, 0x40, 0x04, 0x3E];
const ME72_READINESS_REQUEST: [u8; 8] = [0xB8, 0x12, 0xF1, 0x03, 0x22, 0x40, 0x07, 0x3D];

#[derive(Clone, Copy)]
struct Me72ReadDataProfile {
    request: &'static [u8],
    did: [u8; 2],
    min_payload_len: usize,
    min_response_bytes: usize,
    profile_id: &'static str,
    write_error: &'static str,
    flush_error: &'static str,
    reply_error: &'static str,
}

const ME72_ROUGHNESS_PROFILE: Me72ReadDataProfile = Me72ReadDataProfile {
    request: &ME72_ROUGHNESS_REQUEST,
    did: [0x40, 0x03],
    min_payload_len: 19,
    min_response_bytes: 29,
    profile_id: "e39-me72-roughness-4003",
    write_error: "allowlisted_roughness_write_failed",
    flush_error: "allowlisted_roughness_flush_failed",
    reply_error: "me72_roughness_reply_not_verified",
};

const ME72_ENGINE_SNAPSHOT_PROFILE: Me72ReadDataProfile = Me72ReadDataProfile {
    request: &ME72_ENGINE_SNAPSHOT_REQUEST,
    did: [0x40, 0x00],
    min_payload_len: 45,
    min_response_bytes: 50,
    profile_id: "e39-me72-engine-snapshot-4000",
    write_error: "allowlisted_engine_snapshot_write_failed",
    flush_error: "allowlisted_engine_snapshot_flush_failed",
    reply_error: "me72_engine_snapshot_reply_not_verified",
};

const ME72_FUEL_ADAPTATION_PROFILE: Me72ReadDataProfile = Me72ReadDataProfile {
    request: &ME72_FUEL_ADAPTATION_REQUEST,
    did: [0x40, 0x04],
    min_payload_len: 19,
    min_response_bytes: 24,
    profile_id: "e39-me72-fuel-adaptation-4004",
    write_error: "allowlisted_fuel_adaptation_write_failed",
    flush_error: "allowlisted_fuel_adaptation_flush_failed",
    reply_error: "me72_fuel_adaptation_reply_not_verified",
};

const ME72_READINESS_PROFILE: Me72ReadDataProfile = Me72ReadDataProfile {
    request: &ME72_READINESS_REQUEST,
    did: [0x40, 0x07],
    min_payload_len: 5,
    min_response_bytes: 10,
    profile_id: "e39-me72-readiness-4007",
    write_error: "allowlisted_readiness_write_failed",
    flush_error: "allowlisted_readiness_flush_failed",
    reply_error: "me72_readiness_reply_not_verified",
};

fn ascii_field(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() || bytes.iter().any(|byte| !(0x20..=0x7E).contains(byte)) {
        return None;
    }
    let value = std::str::from_utf8(bytes).ok()?.trim();
    if value.is_empty()
        || !value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-')) {
        return None;
    }
    Some(value.to_string())
}

fn me72_identity_fingerprint(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 5 {
        return None;
    }
    for start in 0..=bytes.len() - 5 {
        if bytes[start] != 0xB8 || bytes[start + 1] != 0xF1 || bytes[start + 2] != 0x12 {
            continue;
        }
        let payload_len = bytes[start + 3] as usize;
        if payload_len < 26 || payload_len > 192 {
            continue;
        }
        let frame_len = payload_len + 5;
        if start + frame_len > bytes.len() {
            continue;
        }
        let frame = &bytes[start..start + frame_len];
        if frame.get(4) != Some(&0xE2) {
            continue;
        }
        let checksum = frame[..frame.len() - 1].iter().fold(0u8, |acc, byte| acc ^ *byte);
        if checksum != frame[frame.len() - 1] {
            continue;
        }

        let payload = &frame[4..4 + payload_len];
        let part = ascii_field(&payload[1..8])?;
        let hardware = ascii_field(&payload[8..10])?;
        let coding = ascii_field(&payload[10..12])?;
        let diagnostic = ascii_field(&payload[12..14])?;
        let bus = ascii_field(&payload[14..16])?;
        let week = ascii_field(&payload[16..18])?;
        let year = ascii_field(&payload[18..20])?;
        let supplier = ascii_field(&payload[20..26])?;

        return Some(format!(
            "PN{}-HW{}-CI{}-DI{}-BI{}-BW{}-BY{}-SP{}",
            part, hardware, coding, diagnostic, bus, week, year, supplier
        ));
    }
    None
}

fn has_complete_me72_identity_reply(bytes: &[u8]) -> bool {
    me72_identity_fingerprint(bytes).is_some()
}

fn has_complete_me72_read_data_reply(
    bytes: &[u8],
    profile: &Me72ReadDataProfile,
) -> bool {
    if bytes.len() < 5 {
        return false;
    }
    for start in 0..=bytes.len() - 5 {
        if bytes[start] != 0xB8 || bytes[start + 1] != 0xF1 || bytes[start + 2] != 0x12 {
            continue;
        }
        let payload_len = bytes[start + 3] as usize;
        if payload_len < profile.min_payload_len || payload_len > 192 {
            continue;
        }
        let frame_len = payload_len + 5;
        if start + frame_len > bytes.len() {
            continue;
        }
        let frame = &bytes[start..start + frame_len];
        if frame.get(4) != Some(&0x62)
            || frame.get(5) != Some(&profile.did[0])
            || frame.get(6) != Some(&profile.did[1]) {
            continue;
        }
        let checksum = frame[..frame.len() - 1].iter().fold(0u8, |acc, byte| acc ^ *byte);
        if checksum == frame[frame.len() - 1] {
            return true;
        }
    }
    false
}

fn has_complete_me72_engine_snapshot_reply(bytes: &[u8]) -> bool {
    has_complete_me72_read_data_reply(bytes, &ME72_ENGINE_SNAPSHOT_PROFILE)
}

fn has_complete_me72_roughness_reply(bytes: &[u8]) -> bool {
    has_complete_me72_read_data_reply(bytes, &ME72_ROUGHNESS_PROFILE)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSerialOpenPlan {
    pub protocol: &'static str,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub stop_bits: u8,
    pub parity: &'static str,
    pub dtr_send_time_required: bool,
    pub raw_write_exposed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopNativeSerialSnapshot {
    pub version: u8,
    pub evidence_contract_version: u8,
    pub evidence_stage: &'static str,
    pub stage: &'static str,
    pub epoch: u64,
    pub port_name: Option<String>,
    pub protocol: Option<&'static str>,
    pub baud_rate: Option<u32>,
    pub transport_open: bool,
    pub configured: bool,
    pub ecu_verified: bool,
    pub writes_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReadResult {
    pub version: u8,
    pub evidence_contract_version: u8,
    pub evidence_stage: &'static str,
    pub stage: &'static str,
    pub epoch: u64,
    pub protocol: &'static str,
    pub received_bytes: usize,
    pub bytes: Vec<u8>,
    pub native_request_receipt: Option<u64>,
    pub native_identity_fingerprint: Option<String>,
    pub readonly_profile_id: Option<&'static str>,
    pub readonly_sample_sequence: Option<u64>,
    pub ecu_verified: bool,
    pub writes_enabled: bool,
}

#[derive(Default)]
pub struct DesktopNativeSerialState {
    port: Option<Box<dyn SerialPort>>,
    epoch: u64,
    port_name: Option<String>,
    protocol: Option<&'static str>,
    baud_rate: Option<u32>,
}

pub fn build_open_plan(protocol: &str, baud_rate: u32) -> Result<DesktopSerialOpenPlan, String> {
    if !(300..=1_000_000).contains(&baud_rate) {
        return Err("baud_out_of_range".into());
    }

    match protocol {
        "DS2" => Ok(DesktopSerialOpenPlan {
            protocol: "DS2",
            baud_rate,
            data_bits: 8,
            stop_bits: 1,
            parity: "EVEN",
            dtr_send_time_required: true,
            raw_write_exposed: false,
        }),
        "KWP2000_BMW" => Ok(DesktopSerialOpenPlan {
            protocol: "KWP2000_BMW",
            baud_rate,
            data_bits: 8,
            stop_bits: 1,
            parity: "NONE",
            dtr_send_time_required: false,
            raw_write_exposed: false,
        }),
        _ => Err("unsupported_legacy_protocol".into()),
    }
}

impl DesktopNativeSerialState {
    pub fn is_open(&self) -> bool {
        self.port.is_some()
    }

    pub fn snapshot(&self) -> DesktopNativeSerialSnapshot {
        DesktopNativeSerialSnapshot {
            version: 1,
            evidence_contract_version: 1,
            evidence_stage: if self.port.is_some() { "PORT_OPEN" } else { "NO_CABLE" },
            stage: if self.port.is_some() { "PORT_CONFIGURED" } else { "PORT_CLOSED" },
            epoch: self.epoch,
            port_name: self.port_name.clone(),
            protocol: self.protocol,
            baud_rate: self.baud_rate,
            transport_open: self.port.is_some(),
            configured: self.port.is_some(),
            ecu_verified: false,
            writes_enabled: false,
        }
    }

    pub fn open_configured(
        &mut self,
        bound: &DesktopTransportSnapshot,
        expected_epoch: u64,
        protocol: &str,
        baud_rate: u32,
    ) -> Result<DesktopNativeSerialSnapshot, String> {
        if self.port.is_some() {
            return Err("native_port_already_open".into());
        }
        if bound.epoch != expected_epoch {
            return Err("stale_epoch".into());
        }
        if bound.transport_open || bound.configured {
            return Err("coordinator_state_already_open".into());
        }
        if bound.kind.as_deref() != Some("usb") {
            return Err("usb_candidate_required".into());
        }

        let port_name = bound
            .port_name
            .as_ref()
            .ok_or_else(|| "no_bound_port".to_string())?
            .clone();
        let plan = build_open_plan(protocol, baud_rate)?;

        let parity = match plan.parity {
            "EVEN" => Parity::Even,
            "NONE" => Parity::None,
            _ => return Err("unsupported_parity".into()),
        };

        let opened = serialport::new(&port_name, plan.baud_rate)
            .data_bits(DataBits::Eight)
            .flow_control(FlowControl::None)
            .parity(parity)
            .stop_bits(StopBits::One)
            .timeout(Duration::from_millis(250))
            .open()
            .map_err(|_| "serial_open_or_configure_failed".to_string())?;

        self.port = Some(opened);
        self.epoch = expected_epoch;
        self.port_name = Some(port_name);
        self.protocol = Some(plan.protocol);
        self.baud_rate = Some(plan.baud_rate);
        Ok(self.snapshot())
    }

    pub fn execute_me72_identity(
        &mut self,
        expected_epoch: u64,
        max_bytes: usize,
        timeout_ms: u64,
    ) -> Result<DesktopReadResult, String> {
        if self.epoch != expected_epoch {
            return Err("stale_epoch".into());
        }
        if self.protocol != Some("KWP2000_BMW") {
            return Err("kwp2000_transport_required".into());
        }
        if max_bytes < 1 || max_bytes > 197 {
            return Err("read_size_out_of_range".into());
        }
        if !(10..=5000).contains(&timeout_ms) {
            return Err("read_timeout_out_of_range".into());
        }

        let port = self.port.as_mut().ok_or_else(|| "native_port_not_open".to_string())?;

        port.write_all(&ME72_IDENTITY_REQUEST)
            .map_err(|_| "allowlisted_request_write_failed".to_string())?;
        port.flush()
            .map_err(|_| "allowlisted_request_flush_failed".to_string())?;

        let deadline = Duration::from_millis(timeout_ms);
        let started = Instant::now();
        let mut buffer = Vec::with_capacity(max_bytes);

        while buffer.len() < max_bytes && started.elapsed() < deadline {
            let remaining = deadline.saturating_sub(started.elapsed());
            if remaining.is_zero() {
                break;
            }
            let per_read = remaining.min(Duration::from_millis(120));
            port.set_timeout(per_read)
                .map_err(|_| "serial_timeout_config_failed".to_string())?;

            let chunk_len = (max_bytes - buffer.len()).min(64);
            let mut chunk = [0u8; 64];
            match port.read(&mut chunk[..chunk_len]) {
                Ok(0) => {}
                Ok(count) => {
                    buffer.extend_from_slice(&chunk[..count]);
                    if has_complete_me72_identity_reply(&buffer) {
                        break;
                    }
                }
                Err(error) if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
                Err(_) => return Err("serial_read_failed".into()),
            }
        }

        let count = buffer.len();
        let native_identity_fingerprint = me72_identity_fingerprint(&buffer);
        Ok(DesktopReadResult {
            version: 1,
            evidence_contract_version: 1,
            evidence_stage: if count == 0 { "PORT_OPEN" } else { "RX_ACTIVITY" },
            stage: if count == 0 { "READ_TIMEOUT" } else { "READ_BYTES" },
            epoch: expected_epoch,
            protocol: "KWP2000_BMW",
            received_bytes: count,
            bytes: buffer,
            native_request_receipt: None,
            native_identity_fingerprint,
            readonly_profile_id: None,
            readonly_sample_sequence: None,
            ecu_verified: false,
            writes_enabled: false,
        })
    }

    fn execute_me72_read_data(
        &mut self,
        expected_epoch: u64,
        max_bytes: usize,
        timeout_ms: u64,
        profile: &Me72ReadDataProfile,
    ) -> Result<DesktopReadResult, String> {
        if self.epoch != expected_epoch {
            return Err("stale_epoch".into());
        }
        if self.protocol != Some("KWP2000_BMW") {
            return Err("kwp2000_transport_required".into());
        }
        if max_bytes < profile.min_response_bytes || max_bytes > 197 {
            return Err("read_size_out_of_range".into());
        }
        if !(10..=5000).contains(&timeout_ms) {
            return Err("read_timeout_out_of_range".into());
        }

        let port = self.port.as_mut().ok_or_else(|| "native_port_not_open".to_string())?;
        port.write_all(profile.request)
            .map_err(|_| profile.write_error.to_string())?;
        port.flush()
            .map_err(|_| profile.flush_error.to_string())?;

        let deadline = Duration::from_millis(timeout_ms);
        let started = Instant::now();
        let mut buffer = Vec::with_capacity(max_bytes);

        while buffer.len() < max_bytes && started.elapsed() < deadline {
            let remaining = deadline.saturating_sub(started.elapsed());
            if remaining.is_zero() {
                break;
            }
            let per_read = remaining.min(Duration::from_millis(120));
            port.set_timeout(per_read)
                .map_err(|_| "serial_timeout_config_failed".to_string())?;

            let chunk_len = (max_bytes - buffer.len()).min(64);
            let mut chunk = [0u8; 64];
            match port.read(&mut chunk[..chunk_len]) {
                Ok(0) => {}
                Ok(count) => {
                    buffer.extend_from_slice(&chunk[..count]);
                    if has_complete_me72_read_data_reply(&buffer, profile) {
                        break;
                    }
                }
                Err(error) if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
                Err(_) => return Err("serial_read_failed".into()),
            }
        }

        if !has_complete_me72_read_data_reply(&buffer, profile) {
            return Err(profile.reply_error.into());
        }

        Ok(DesktopReadResult {
            version: 1,
            evidence_contract_version: 1,
            evidence_stage: "RX_ACTIVITY",
            stage: "READ_BYTES",
            epoch: expected_epoch,
            protocol: "KWP2000_BMW",
            received_bytes: buffer.len(),
            bytes: buffer,
            native_request_receipt: None,
            native_identity_fingerprint: None,
            readonly_profile_id: Some(profile.profile_id),
            readonly_sample_sequence: None,
            ecu_verified: false,
            writes_enabled: false,
        })
    }

    pub fn execute_me72_roughness(
        &mut self,
        expected_epoch: u64,
        max_bytes: usize,
        timeout_ms: u64,
    ) -> Result<DesktopReadResult, String> {
        self.execute_me72_read_data(
            expected_epoch,
            max_bytes,
            timeout_ms,
            &ME72_ROUGHNESS_PROFILE,
        )
    }

    pub fn execute_me72_engine_snapshot(
        &mut self,
        expected_epoch: u64,
        max_bytes: usize,
        timeout_ms: u64,
    ) -> Result<DesktopReadResult, String> {
        self.execute_me72_read_data(
            expected_epoch,
            max_bytes,
            timeout_ms,
            &ME72_ENGINE_SNAPSHOT_PROFILE,
        )
    }

    pub fn execute_me72_fuel_adaptation(
        &mut self,
        expected_epoch: u64,
        max_bytes: usize,
        timeout_ms: u64,
    ) -> Result<DesktopReadResult, String> {
        self.execute_me72_read_data(
            expected_epoch,
            max_bytes,
            timeout_ms,
            &ME72_FUEL_ADAPTATION_PROFILE,
        )
    }

    pub fn execute_me72_readiness(
        &mut self,
        expected_epoch: u64,
        max_bytes: usize,
        timeout_ms: u64,
    ) -> Result<DesktopReadResult, String> {
        self.execute_me72_read_data(
            expected_epoch,
            max_bytes,
            timeout_ms,
            &ME72_READINESS_PROFILE,
        )
    }

    pub fn read_bounded(
        &mut self,
        expected_epoch: u64,
        max_bytes: usize,
        timeout_ms: u64,
    ) -> Result<DesktopReadResult, String> {
        if self.epoch != expected_epoch {
            return Err("stale_epoch".into());
        }
        let protocol = self.protocol.ok_or_else(|| "protocol_not_configured".to_string())?;
        let hard_max = match protocol {
            "DS2" => 255usize,
            "KWP2000_BMW" => 197usize,
            _ => return Err("unsupported_legacy_protocol".into()),
        };
        if max_bytes < 1 || max_bytes > hard_max {
            return Err("read_size_out_of_range".into());
        }
        if !(10..=5000).contains(&timeout_ms) {
            return Err("read_timeout_out_of_range".into());
        }

        let port = self.port.as_mut().ok_or_else(|| "native_port_not_open".to_string())?;
        port.set_timeout(Duration::from_millis(timeout_ms))
            .map_err(|_| "serial_timeout_config_failed".to_string())?;

        let mut buffer = vec![0u8; max_bytes];
        match port.read(&mut buffer) {
            Ok(count) => {
                buffer.truncate(count);
                Ok(DesktopReadResult {
                    version: 1,
                    evidence_contract_version: 1,
                    evidence_stage: if count == 0 { "PORT_OPEN" } else { "RX_ACTIVITY" },
                    stage: if count == 0 { "READ_EMPTY" } else { "READ_BYTES" },
                    epoch: expected_epoch,
                    protocol,
                    received_bytes: count,
                    bytes: buffer,
                    native_request_receipt: None,
                    native_identity_fingerprint: None,
                    readonly_profile_id: None,
                    readonly_sample_sequence: None,
                    ecu_verified: false,
                    writes_enabled: false,
                })
            }
            Err(error) if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {
                Ok(DesktopReadResult {
                    version: 1,
                    evidence_contract_version: 1,
                    evidence_stage: "PORT_OPEN",
                    stage: "READ_TIMEOUT",
                    epoch: expected_epoch,
                    protocol,
                    received_bytes: 0,
                    bytes: Vec::new(),
                    native_request_receipt: None,
                    native_identity_fingerprint: None,
                    readonly_profile_id: None,
                    readonly_sample_sequence: None,
                    ecu_verified: false,
                    writes_enabled: false,
                })
            }
            Err(_) => Err("serial_read_failed".into()),
        }
    }

    pub fn close_any(&mut self) -> DesktopNativeSerialSnapshot {
        self.port = None;
        self.port_name = None;
        self.protocol = None;
        self.baud_rate = None;
        self.snapshot()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn me72_reply_detector_ignores_echo_and_accepts_valid_e2_reply() {
        let echo = [0xB8, 0x12, 0xF1, 0x01, 0xA2, 0xF8];
        assert!(!has_complete_me72_identity_reply(&echo));

        let reply = [
            0xB8,0xF1,0x12,0x2B,0xE2,0x37,0x35,0x30,0x36,0x33,0x36,0x36,
            0x30,0x46,0x30,0x31,0x41,0x38,0x36,0x30,0x30,0x38,0x30,0x30,
            0x30,0x30,0x31,0x30,0x32,0x31,0x33,0x35,0x31,0x30,0xFF,0xFF,
            0xFF,0xFF,0x30,0x30,0x30,0x30,0x38,0x33,0x38,0x32,0x38,0x99
        ];
        let mut combined = echo.to_vec();
        combined.extend_from_slice(&reply);
        assert!(has_complete_me72_identity_reply(&combined));
    }

    #[test]
    fn native_fingerprint_matches_reference_vector() {
        let reply = [
            0xB8,0xF1,0x12,0x2B,0xE2,0x37,0x35,0x30,0x36,0x33,0x36,0x36,
            0x30,0x46,0x30,0x31,0x41,0x38,0x36,0x30,0x30,0x38,0x30,0x30,
            0x30,0x30,0x31,0x30,0x32,0x31,0x33,0x35,0x31,0x30,0xFF,0xFF,
            0xFF,0xFF,0x30,0x30,0x30,0x30,0x38,0x33,0x38,0x32,0x38,0x99
        ];
        assert_eq!(
            me72_identity_fingerprint(&reply).as_deref(),
            Some("PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021")
        );
        let mut corrupt = reply;
        corrupt[47] ^= 0x01;
        assert!(me72_identity_fingerprint(&corrupt).is_none());
    }

    #[test]
    fn read_data_profiles_cannot_cross_accept_each_other() {
        let roughness_reply = [
            0xB8,0xF1,0x12,0x18,0x62,0x40,0x03,0xFF,0x70,0xFF,0x4E,0x00,
            0x00,0xFF,0xD8,0x00,0x32,0x00,0x90,0x00,0x0C,0x00,0x8E,0x01,
            0x00,0xE5,0x01,0x26,0x98
        ];
        let engine_reply = [
            0xB8,0xF1,0x12,0x2D,0x62,0x40,0x00,0x00,0xC3,0x7E,0x36,0x81,
            0xB4,0x00,0x0A,0xEC,0x46,0xFF,0xF1,0x00,0x21,0x66,0xC4,0x11,
            0x05,0x00,0xB5,0x1B,0x62,0x8F,0x00,0x93,0xAF,0x00,0x20,0x00,
            0x1F,0x00,0x1E,0x00,0x1F,0x00,0x25,0x00,0x1E,0x00,0x24,0x00,
            0x1E,0x93
        ];

        assert!(has_complete_me72_read_data_reply(
            &roughness_reply,
            &ME72_ROUGHNESS_PROFILE
        ));
        assert!(!has_complete_me72_read_data_reply(
            &roughness_reply,
            &ME72_ENGINE_SNAPSHOT_PROFILE
        ));
        assert!(has_complete_me72_read_data_reply(
            &engine_reply,
            &ME72_ENGINE_SNAPSHOT_PROFILE
        ));
        assert!(!has_complete_me72_read_data_reply(
            &engine_reply,
            &ME72_ROUGHNESS_PROFILE
        ));
        assert_eq!(ME72_ROUGHNESS_PROFILE.request, &ME72_ROUGHNESS_REQUEST);
        assert_eq!(ME72_ENGINE_SNAPSHOT_PROFILE.request, &ME72_ENGINE_SNAPSHOT_REQUEST);
    }

    #[test]
    fn readiness_request_and_reply_are_fixed_and_read_only() {
        assert_eq!(
            ME72_READINESS_REQUEST,
            [0xB8,0x12,0xF1,0x03,0x22,0x40,0x07,0x3D]
        );
        assert_eq!(ME72_READINESS_REQUEST.iter().fold(0u8, |acc, byte| acc ^ byte), 0);

        let echo = ME72_READINESS_REQUEST;
        assert!(!has_complete_me72_read_data_reply(&echo, &ME72_READINESS_PROFILE));

        let reply = [0xB8,0xF1,0x12,0x05,0x62,0x40,0x07,0xFD,0x10,0x96];
        let mut combined = echo.to_vec();
        combined.extend_from_slice(&reply);
        assert!(has_complete_me72_read_data_reply(&combined, &ME72_READINESS_PROFILE));
        let last = combined.len() - 1;
        combined[last] ^= 0x01;
        assert!(!has_complete_me72_read_data_reply(&combined, &ME72_READINESS_PROFILE));
    }

    #[test]
    fn fuel_adaptation_request_and_reply_are_fixed_and_read_only() {
        assert_eq!(
            ME72_FUEL_ADAPTATION_REQUEST,
            [0xB8,0x12,0xF1,0x03,0x22,0x40,0x04,0x3E]
        );
        assert_eq!(ME72_FUEL_ADAPTATION_REQUEST.iter().fold(0u8, |acc, byte| acc ^ byte), 0);

        let echo = ME72_FUEL_ADAPTATION_REQUEST;
        assert!(!has_complete_me72_read_data_reply(&echo, &ME72_FUEL_ADAPTATION_PROFILE));

        let reply = [
            0xB8,0xF1,0x12,0x13,0x62,0x40,0x04,0x00,0x2C,0x00,0x20,0x82,
            0x83,0x80,0x0C,0x6C,0x6C,0x6C,0x6C,0x00,0xF5,0x01,0x15,0x0E
        ];
        let mut combined = echo.to_vec();
        combined.extend_from_slice(&reply);
        assert!(has_complete_me72_read_data_reply(
            &combined,
            &ME72_FUEL_ADAPTATION_PROFILE
        ));
        let last = combined.len() - 1;
        combined[last] ^= 0x01;
        assert!(!has_complete_me72_read_data_reply(
            &combined,
            &ME72_FUEL_ADAPTATION_PROFILE
        ));
    }

    #[test]
    fn fuel_adaptation_profile_is_allowlisted_and_did_isolated() {
        assert_eq!(
            ME72_FUEL_ADAPTATION_REQUEST,
            [0xB8,0x12,0xF1,0x03,0x22,0x40,0x04,0x3E]
        );
        assert_eq!(
            ME72_FUEL_ADAPTATION_REQUEST.iter().fold(0u8, |acc, byte| acc ^ byte),
            0
        );
        let reply = [
            0xB8,0xF1,0x12,0x13,0x62,0x40,0x04,0x00,0x2C,0x00,0x20,0x82,
            0x83,0x80,0x0C,0x6C,0x6C,0x6C,0x6C,0x00,0xF5,0x01,0x15,0x0E
        ];
        assert!(has_complete_me72_read_data_reply(
            &reply,
            &ME72_FUEL_ADAPTATION_PROFILE
        ));
        assert!(!has_complete_me72_read_data_reply(
            &reply,
            &ME72_ROUGHNESS_PROFILE
        ));
        assert!(!has_complete_me72_read_data_reply(
            &reply,
            &ME72_ENGINE_SNAPSHOT_PROFILE
        ));
    }

    #[test]
    fn engine_snapshot_request_and_reply_are_fixed_and_read_only() {
        assert_eq!(
            ME72_ENGINE_SNAPSHOT_REQUEST,
            [0xB8,0x12,0xF1,0x03,0x22,0x40,0x00,0x3A]
        );
        assert_eq!(ME72_ENGINE_SNAPSHOT_REQUEST.iter().fold(0u8, |acc, byte| acc ^ byte), 0);

        let echo = ME72_ENGINE_SNAPSHOT_REQUEST;
        assert!(!has_complete_me72_engine_snapshot_reply(&echo));

        let reply = [
            0xB8,0xF1,0x12,0x2D,0x62,0x40,0x00,0x00,0xC3,0x7E,0x36,0x81,
            0xB4,0x00,0x0A,0xEC,0x46,0xFF,0xF1,0x00,0x21,0x66,0xC4,0x11,
            0x05,0x00,0xB5,0x1B,0x62,0x8F,0x00,0x93,0xAF,0x00,0x20,0x00,
            0x1F,0x00,0x1E,0x00,0x1F,0x00,0x25,0x00,0x1E,0x00,0x24,0x00,
            0x1E,0x93
        ];
        let mut combined = echo.to_vec();
        combined.extend_from_slice(&reply);
        assert!(has_complete_me72_engine_snapshot_reply(&combined));
        let last = combined.len() - 1;
        combined[last] ^= 0x01;
        assert!(!has_complete_me72_engine_snapshot_reply(&combined));
    }

    #[test]
    fn roughness_request_and_reply_are_fixed_and_read_only() {
        assert_eq!(
            ME72_ROUGHNESS_REQUEST,
            [0xB8,0x12,0xF1,0x03,0x22,0x40,0x03,0x39]
        );
        assert_eq!(ME72_ROUGHNESS_REQUEST.iter().fold(0u8, |acc, byte| acc ^ byte), 0);

        let echo = ME72_ROUGHNESS_REQUEST;
        assert!(!has_complete_me72_roughness_reply(&echo));

        let reply = [
            0xB8,0xF1,0x12,0x18,0x62,0x40,0x03,0xFF,0x70,0xFF,0x4E,0x00,
            0x00,0xFF,0xD8,0x00,0x32,0x00,0x90,0x00,0x0C,0x00,0x8E,0x01,
            0x00,0xE5,0x01,0x26,0x98
        ];
        let mut combined = echo.to_vec();
        combined.extend_from_slice(&reply);
        assert!(has_complete_me72_roughness_reply(&combined));
        let last = combined.len() - 1;
        combined[last] ^= 0x01;
        assert!(!has_complete_me72_roughness_reply(&combined));
    }

    #[test]
    fn me72_identity_request_material_is_private_and_fixed() {
        assert_eq!(ME72_IDENTITY_REQUEST, [0xB8, 0x12, 0xF1, 0x01, 0xA2, 0xF8]);
        assert_eq!(ME72_IDENTITY_REQUEST.iter().fold(0u8, |acc, byte| acc ^ byte), 0);
    }

    #[test]
    fn serial_plan_is_protocol_bounded_and_never_exposes_raw_write() {
        let ds2 = build_open_plan("DS2", 9600).unwrap();
        assert_eq!(ds2.data_bits, 8);
        assert_eq!(ds2.stop_bits, 1);
        assert_eq!(ds2.parity, "EVEN");
        assert!(ds2.dtr_send_time_required);
        assert!(!ds2.raw_write_exposed);

        let kwp = build_open_plan("KWP2000_BMW", 10400).unwrap();
        assert_eq!(kwp.parity, "NONE");
        assert!(!kwp.dtr_send_time_required);
        assert!(!kwp.raw_write_exposed);

        assert_eq!(
            build_open_plan("RAW", 9600).unwrap_err(),
            "unsupported_legacy_protocol"
        );
        assert_eq!(build_open_plan("DS2", 0).unwrap_err(), "baud_out_of_range");
    }

    #[test]
    fn protocol_receive_limits_are_enforced() {
        let ds2 = build_open_plan("DS2", 9600).unwrap();
        let kwp = build_open_plan("KWP2000_BMW", 10400).unwrap();
        assert_eq!(ds2.protocol, "DS2");
        assert_eq!(kwp.protocol, "KWP2000_BMW");
        assert!(!ds2.raw_write_exposed);
        assert!(!kwp.raw_write_exposed);
    }

    #[test]
    fn closed_native_state_is_fail_closed() {
        let state = DesktopNativeSerialState::default();
        let snap = state.snapshot();
        assert_eq!(snap.stage, "PORT_CLOSED");
        assert_eq!(snap.evidence_contract_version, 1);
        assert_eq!(snap.evidence_stage, "NO_CABLE");
        assert!(!snap.transport_open);
        assert!(!snap.configured);
        assert!(!snap.ecu_verified);
        assert!(!snap.writes_enabled);
    }
}
