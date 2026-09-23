use crate::desktop_transport_coordinator::DesktopTransportSnapshot;
use serde::Serialize;
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::io::{ErrorKind, Read};
use std::time::Duration;

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
    pub stage: &'static str,
    pub epoch: u64,
    pub protocol: &'static str,
    pub received_bytes: usize,
    pub bytes: Vec<u8>,
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
                    stage: if count == 0 { "READ_EMPTY" } else { "READ_BYTES" },
                    epoch: expected_epoch,
                    protocol,
                    received_bytes: count,
                    bytes: buffer,
                    ecu_verified: false,
                    writes_enabled: false,
                })
            }
            Err(error) if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {
                Ok(DesktopReadResult {
                    version: 1,
                    stage: "READ_TIMEOUT",
                    epoch: expected_epoch,
                    protocol,
                    received_bytes: 0,
                    bytes: Vec::new(),
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
        assert!(!snap.transport_open);
        assert!(!snap.configured);
        assert!(!snap.ecu_verified);
        assert!(!snap.writes_enabled);
    }
}
