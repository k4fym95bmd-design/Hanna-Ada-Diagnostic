use crate::desktop_native_serial::DesktopNativeSerialSnapshot;
use crate::desktop_transport_coordinator::DesktopTransportSnapshot;
use serde::Serialize;
use std::collections::HashSet;
use std::time::{Duration, Instant};

const MAX_ATTEMPTS: usize = 32;

struct ActiveRequest {
    operation_id: &'static str,
    request_id: String,
    protocol: &'static str,
    timeout_ms: u64,
    max_response_bytes: usize,
    started_at: Instant,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRequestBrokerSnapshot {
    pub version: u8,
    pub evidence_contract_version: u8,
    pub stage: &'static str,
    pub epoch: u64,
    pub active_request: bool,
    pub active_request_id: Option<String>,
    pub operation_id: Option<&'static str>,
    pub protocol: Option<&'static str>,
    pub timeout_ms: Option<u64>,
    pub max_response_bytes: Option<usize>,
    pub attempt_count: usize,
    pub max_attempts: usize,
    pub tx_bytes_exposed: bool,
    pub write_like: bool,
    pub ecu_verified: bool,
    pub writes_enabled: bool,
    pub flash_enabled: bool,
}

#[derive(Default)]
pub struct DesktopReadOnlyRequestBroker {
    epoch: u64,
    active: Option<ActiveRequest>,
    issued_request_ids: HashSet<String>,
}

fn canonical_operation(id: &str) -> Option<(&'static str, &'static str, u64, usize)> {
    match id {
        "e39-dme-me72-module-identity" =>
            Some(("e39-dme-me72-module-identity", "KWP2000_BMW", 750, 197)),
        "e39-legacy-module-identity" =>
            Some(("e39-legacy-module-identity", "DS2", 750, 255)),
        _ => None,
    }
}

fn valid_request_id(value: &str) -> bool {
    let len = value.len();
    (8..=64).contains(&len)
        && value.bytes().all(|b|
            b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

impl DesktopReadOnlyRequestBroker {
    fn expire_if_needed(&mut self) {
        let expired = self.active.as_ref().map(|active|
            active.started_at.elapsed() >= Duration::from_millis(active.timeout_ms)
        ).unwrap_or(false);
        if expired {
            self.active = None;
        }
    }

    pub fn reset(&mut self, epoch: u64) {
        self.epoch = epoch;
        self.active = None;
        self.issued_request_ids.clear();
    }

    pub fn prepare(
        &mut self,
        transport: &DesktopTransportSnapshot,
        native: &DesktopNativeSerialSnapshot,
        epoch: u64,
        operation_id: &str,
        request_id: &str,
        protocol: &str,
        timeout_ms: u64,
        max_response_bytes: usize,
    ) -> Result<DesktopRequestBrokerSnapshot, String> {
        self.expire_if_needed();

        if transport.epoch != epoch || native.epoch != epoch {
            return Err("stale_epoch".into());
        }
        if !transport.transport_open || !transport.configured
            || !native.transport_open || !native.configured {
            return Err("transport_not_configured".into());
        }
        if native.protocol != Some(protocol) {
            return Err("native_protocol_mismatch".into());
        }

        let (canonical_id, canonical_protocol, canonical_timeout, canonical_max) =
            canonical_operation(operation_id).ok_or_else(|| "operation_not_allowlisted".to_string())?;

        if canonical_protocol != protocol
            || canonical_timeout != timeout_ms
            || canonical_max != max_response_bytes {
            return Err("request_plan_policy_mismatch".into());
        }
        if !valid_request_id(request_id) {
            return Err("invalid_request_id".into());
        }
        if self.active.is_some() {
            return Err("request_already_active".into());
        }
        if self.epoch != 0 && self.epoch != epoch {
            return Err("broker_epoch_mismatch".into());
        }
        if self.issued_request_ids.len() >= MAX_ATTEMPTS {
            return Err("request_attempt_limit_reached".into());
        }
        if self.issued_request_ids.contains(request_id) {
            return Err("request_id_replay".into());
        }

        self.epoch = epoch;
        self.issued_request_ids.insert(request_id.to_string());
        self.active = Some(ActiveRequest {
            operation_id: canonical_id,
            request_id: request_id.to_string(),
            protocol: canonical_protocol,
            timeout_ms: canonical_timeout,
            max_response_bytes: canonical_max,
            started_at: Instant::now(),
        });
        Ok(self.snapshot())
    }

    pub fn consume(
        &mut self,
        epoch: u64,
        request_id: &str,
    ) -> Result<DesktopRequestBrokerSnapshot, String> {
        self.expire_if_needed();
        if self.epoch != epoch {
            return Err("stale_epoch".into());
        }
        let active = self.active.as_ref().ok_or_else(|| "no_active_request".to_string())?;
        if active.request_id != request_id {
            return Err("request_correlation_mismatch".into());
        }
        self.active = None;
        Ok(self.snapshot())
    }

    pub fn cancel(
        &mut self,
        epoch: u64,
        request_id: &str,
    ) -> Result<DesktopRequestBrokerSnapshot, String> {
        if self.epoch != epoch {
            return Err("stale_epoch".into());
        }
        let active = self.active.as_ref().ok_or_else(|| "no_active_request".to_string())?;
        if active.request_id != request_id {
            return Err("request_correlation_mismatch".into());
        }
        self.active = None;
        Ok(self.snapshot())
    }

    pub fn snapshot(&mut self) -> DesktopRequestBrokerSnapshot {
        self.expire_if_needed();
        let active = self.active.as_ref();
        DesktopRequestBrokerSnapshot {
            version: 1,
            evidence_contract_version: 1,
            stage: if active.is_some() { "REQUEST_ACTIVE" } else { "BROKER_IDLE" },
            epoch: self.epoch,
            active_request: active.is_some(),
            active_request_id: active.map(|r| r.request_id.clone()),
            operation_id: active.map(|r| r.operation_id),
            protocol: active.map(|r| r.protocol),
            timeout_ms: active.map(|r| r.timeout_ms),
            max_response_bytes: active.map(|r| r.max_response_bytes),
            attempt_count: self.issued_request_ids.len(),
            max_attempts: MAX_ATTEMPTS,
            tx_bytes_exposed: false,
            write_like: false,
            ecu_verified: false,
            writes_enabled: false,
            flash_enabled: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop_serial_inventory::DesktopSerialCandidate;

    fn configured_transport() -> (DesktopTransportSnapshot, DesktopNativeSerialSnapshot) {
        let transport = DesktopTransportSnapshot {
            version: 1,
            evidence_contract_version: 1,
            stage: "PORT_CONFIGURED",
            evidence_stage: "PORT_OPEN",
            epoch: 7,
            port_name: Some("COM7".into()),
            kind: Some("usb".into()),
            vid: Some(0x0403),
            pid: Some(0x6001),
            candidate_family: Some("FTDI"),
            transport_open: true,
            configured: true,
            ecu_verified: false,
            writes_enabled: false,
        };
        let native = DesktopNativeSerialSnapshot {
            version: 1,
            evidence_contract_version: 1,
            evidence_stage: "PORT_OPEN",
            stage: "PORT_CONFIGURED",
            epoch: 7,
            port_name: Some("COM7".into()),
            protocol: Some("KWP2000_BMW"),
            baud_rate: Some(10400),
            transport_open: true,
            configured: true,
            ecu_verified: false,
            writes_enabled: false,
        };
        (transport, native)
    }

    #[test]
    fn broker_accepts_only_allowlisted_metadata_and_one_active_request() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);

        let active = broker.prepare(
            &transport, &native, 7,
            "e39-dme-me72-module-identity",
            "broker-request-0001",
            "KWP2000_BMW", 750, 197,
        ).unwrap();
        assert_eq!(active.stage, "REQUEST_ACTIVE");
        assert!(active.active_request);
        assert!(!active.tx_bytes_exposed);
        assert!(!active.write_like);
        assert!(!active.ecu_verified);

        assert_eq!(
            broker.prepare(
                &transport, &native, 7,
                "e39-dme-me72-module-identity",
                "broker-request-0002",
                "KWP2000_BMW", 750, 197,
            ).unwrap_err(),
            "request_already_active"
        );
    }

    #[test]
    fn consumed_request_id_cannot_be_replayed() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);
        broker.prepare(
            &transport, &native, 7,
            "e39-dme-me72-module-identity",
            "broker-request-replay",
            "KWP2000_BMW", 750, 197,
        ).unwrap();
        broker.consume(7, "broker-request-replay").unwrap();

        assert_eq!(
            broker.prepare(
                &transport, &native, 7,
                "e39-dme-me72-module-identity",
                "broker-request-replay",
                "KWP2000_BMW", 750, 197,
            ).unwrap_err(),
            "request_id_replay"
        );
    }

    #[test]
    fn policy_divergence_and_stale_epoch_fail_closed() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);

        assert_eq!(
            broker.prepare(
                &transport, &native, 7,
                "e39-dme-me72-module-identity",
                "broker-request-policy",
                "KWP2000_BMW", 1000, 197,
            ).unwrap_err(),
            "request_plan_policy_mismatch"
        );
        assert_eq!(
            broker.prepare(
                &transport, &native, 8,
                "e39-dme-me72-module-identity",
                "broker-request-stale",
                "KWP2000_BMW", 750, 197,
            ).unwrap_err(),
            "stale_epoch"
        );
    }

    #[test]
    fn reset_drops_active_token_and_epoch_state() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);
        broker.prepare(
            &transport, &native, 7,
            "e39-dme-me72-module-identity",
            "broker-request-reset",
            "KWP2000_BMW", 750, 197,
        ).unwrap();
        broker.reset(8);
        let snap = broker.snapshot();
        assert_eq!(snap.epoch, 8);
        assert_eq!(snap.stage, "BROKER_IDLE");
        assert_eq!(snap.attempt_count, 0);
        assert!(!snap.active_request);
        assert!(!snap.writes_enabled);
    }
}
