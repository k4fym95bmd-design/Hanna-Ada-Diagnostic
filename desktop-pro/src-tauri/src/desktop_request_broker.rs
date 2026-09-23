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
    receive_receipt: Option<u64>,
    received_bytes: usize,
    identity_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopEvidencedAttempt {
    pub operation_id: &'static str,
    pub request_id: String,
    pub native_receive_receipt: u64,
    pub native_identity_fingerprint: Option<String>,
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
    pub evidenced_attempt_count: usize,
    pub evidenced_attempts: Vec<DesktopEvidencedAttempt>,
    pub max_attempts: usize,
    pub active_receive_receipt: Option<u64>,
    pub active_received_bytes: usize,
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
    receipt_sequence: u64,
    evidenced_attempt_count: usize,
    evidenced_attempts: Vec<DesktopEvidencedAttempt>,
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
        self.evidenced_attempt_count = 0;
        self.evidenced_attempts.clear();
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
            receive_receipt: None,
            received_bytes: 0,
            identity_fingerprint: None,
        });
        Ok(self.snapshot())
    }

    pub fn authorize_native_execution(
        &mut self,
        epoch: u64,
        request_id: &str,
        operation_id: &str,
        protocol: &str,
    ) -> Result<(), String> {
        self.expire_if_needed();
        if self.epoch != epoch {
            return Err("stale_epoch".into());
        }
        let active = self.active.as_ref().ok_or_else(|| "no_active_request".to_string())?;
        if active.request_id != request_id {
            return Err("request_correlation_mismatch".into());
        }
        if active.operation_id != operation_id {
            return Err("operation_not_active".into());
        }
        if active.protocol != protocol {
            return Err("native_protocol_mismatch".into());
        }
        if active.receive_receipt.is_some() || active.received_bytes != 0 {
            return Err("request_already_received_bytes".into());
        }
        Ok(())
    }

    pub fn record_receive(
        &mut self,
        epoch: u64,
        protocol: &str,
        received_bytes: usize,
    ) -> Result<u64, String> {
        self.expire_if_needed();
        if self.epoch != epoch {
            return Err("stale_epoch".into());
        }
        if received_bytes == 0 {
            return Err("receive_bytes_required".into());
        }

        let (active_protocol, current_bytes, max_bytes, existing_receipt) = {
            let active = self.active.as_ref().ok_or_else(|| "no_active_request".to_string())?;
            (
                active.protocol,
                active.received_bytes,
                active.max_response_bytes,
                active.receive_receipt,
            )
        };
        if active_protocol != protocol {
            return Err("receive_protocol_mismatch".into());
        }
        if current_bytes > max_bytes.saturating_sub(received_bytes) {
            self.active = None;
            return Err("receive_response_overflow".into());
        }

        let receipt = match existing_receipt {
            Some(value) => value,
            None => {
                self.receipt_sequence = if self.receipt_sequence == u64::MAX {
                    1
                } else {
                    self.receipt_sequence + 1
                };
                self.receipt_sequence
            }
        };

        let active = self.active.as_mut().ok_or_else(|| "no_active_request".to_string())?;
        if active.receive_receipt.is_none() {
            active.receive_receipt = Some(receipt);
        }
        active.received_bytes += received_bytes;
        Ok(receipt)
    }

    pub fn record_identity_receive(
        &mut self,
        epoch: u64,
        protocol: &str,
        received_bytes: usize,
        fingerprint: &str,
    ) -> Result<u64, String> {
        if fingerprint.len() < 8 || fingerprint.len() > 128
            || !fingerprint.bytes().all(|b|
                b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-')) {
            return Err("invalid_native_identity_fingerprint".into());
        }
        {
            let active = self.active.as_ref().ok_or_else(|| "no_active_request".to_string())?;
            if active.operation_id != "e39-dme-me72-module-identity" {
                return Err("identity_fingerprint_not_allowed_for_operation".into());
            }
        }
        let receipt = self.record_receive(epoch, protocol, received_bytes)?;
        let fingerprint_conflicts = {
            let active = self.active.as_ref().ok_or_else(|| "no_active_request".to_string())?;
            matches!(
                active.identity_fingerprint.as_deref(),
                Some(existing) if existing != fingerprint
            )
        };
        if fingerprint_conflicts {
            self.active = None;
            return Err("native_identity_fingerprint_changed_within_request".into());
        }

        let active = self.active.as_mut().ok_or_else(|| "no_active_request".to_string())?;
        if active.identity_fingerprint.is_none() {
            active.identity_fingerprint = Some(fingerprint.to_string());
        }
        Ok(receipt)
    }

    pub fn consume(
        &mut self,
        epoch: u64,
        request_id: &str,
        native_receive_receipt: u64,
    ) -> Result<DesktopRequestBrokerSnapshot, String> {
        self.expire_if_needed();
        if self.epoch != epoch {
            return Err("stale_epoch".into());
        }
        let active = self.active.as_ref().ok_or_else(|| "no_active_request".to_string())?;
        if active.request_id != request_id {
            return Err("request_correlation_mismatch".into());
        }
        if native_receive_receipt == 0
            || active.receive_receipt != Some(native_receive_receipt)
            || active.received_bytes == 0 {
            return Err("native_receive_receipt_required".into());
        }
        let evidenced_operation_id = active.operation_id;
        let evidenced_request_id = active.request_id.clone();
        let native_identity_fingerprint = active.identity_fingerprint.clone();
        self.active = None;
        self.evidenced_attempt_count += 1;
        self.evidenced_attempts.push(DesktopEvidencedAttempt {
            operation_id: evidenced_operation_id,
            request_id: evidenced_request_id,
            native_receive_receipt,
            native_identity_fingerprint,
        });
        Ok(self.snapshot())
    }

    pub fn cancel(
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
            evidenced_attempt_count: self.evidenced_attempt_count,
            evidenced_attempts: self.evidenced_attempts.clone(),
            max_attempts: MAX_ATTEMPTS,
            active_receive_receipt: active.and_then(|r| r.receive_receipt),
            active_received_bytes: active.map(|r| r.received_bytes).unwrap_or(0),
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
        let receipt = broker.record_identity_receive(
            7, "KWP2000_BMW", 12,
            "PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021"
        ).unwrap();
        broker.consume(7, "broker-request-replay", receipt).unwrap();

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
    fn native_execution_requires_exact_active_request() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);
        broker.prepare(
            &transport, &native, 7,
            "e39-dme-me72-module-identity",
            "broker-request-native",
            "KWP2000_BMW", 750, 197,
        ).unwrap();

        broker.authorize_native_execution(
            7, "broker-request-native",
            "e39-dme-me72-module-identity",
            "KWP2000_BMW"
        ).unwrap();

        assert_eq!(
            broker.authorize_native_execution(
                7, "wrong-request-id",
                "e39-dme-me72-module-identity",
                "KWP2000_BMW"
            ).unwrap_err(),
            "request_correlation_mismatch"
        );
        assert_eq!(
            broker.authorize_native_execution(
                7, "broker-request-native",
                "e39-legacy-module-identity",
                "KWP2000_BMW"
            ).unwrap_err(),
            "operation_not_active"
        );
    }

    #[test]
    fn consume_requires_native_receive_receipt_and_tracks_evidenced_attempts() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);
        broker.prepare(
            &transport, &native, 7,
            "e39-dme-me72-module-identity",
            "broker-request-receipt",
            "KWP2000_BMW", 750, 197,
        ).unwrap();

        assert_eq!(
            broker.consume(7, "broker-request-receipt", 1).unwrap_err(),
            "native_receive_receipt_required"
        );

        let first = broker.record_identity_receive(
            7, "KWP2000_BMW", 4,
            "PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021"
        ).unwrap();
        let second = broker.record_identity_receive(
            7, "KWP2000_BMW", 5,
            "PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021"
        ).unwrap();
        assert_eq!(first, second);
        let active = broker.snapshot();
        assert_eq!(active.active_receive_receipt, Some(first));
        assert_eq!(active.active_received_bytes, 9);
        assert_eq!(active.evidenced_attempt_count, 0);

        let done = broker.consume(7, "broker-request-receipt", first).unwrap();
        assert_eq!(done.stage, "BROKER_IDLE");
        assert_eq!(done.evidenced_attempt_count, 1);
        assert_eq!(done.evidenced_attempts.len(), 1);
        assert_eq!(done.evidenced_attempts[0].operation_id, "e39-dme-me72-module-identity");
        assert_eq!(done.evidenced_attempts[0].request_id, "broker-request-receipt");
        assert_eq!(done.evidenced_attempts[0].native_receive_receipt, first);
        assert_eq!(
            done.evidenced_attempts[0].native_identity_fingerprint.as_deref(),
            Some("PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021")
        );
        assert_eq!(done.active_receive_receipt, None);
        assert_eq!(done.active_received_bytes, 0);
    }

    #[test]
    fn fingerprint_conflict_drops_active_request_fail_closed() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);
        broker.prepare(
            &transport, &native, 7,
            "e39-dme-me72-module-identity",
            "broker-request-fingerprint-conflict",
            "KWP2000_BMW", 750, 197,
        ).unwrap();

        broker.record_identity_receive(
            7, "KWP2000_BMW", 8,
            "PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021"
        ).unwrap();

        assert_eq!(
            broker.record_identity_receive(
                7, "KWP2000_BMW", 8,
                "PN9999999-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021"
            ).unwrap_err(),
            "native_identity_fingerprint_changed_within_request"
        );
        let snapshot = broker.snapshot();
        assert_eq!(snapshot.stage, "BROKER_IDLE");
        assert!(!snapshot.active_request);
        assert_eq!(snapshot.evidenced_attempt_count, 0);
    }

    #[test]
    fn receive_overflow_drops_active_request_fail_closed() {
        let (transport, native) = configured_transport();
        let mut broker = DesktopReadOnlyRequestBroker::default();
        broker.reset(7);
        broker.prepare(
            &transport, &native, 7,
            "e39-dme-me72-module-identity",
            "broker-request-overflow",
            "KWP2000_BMW", 750, 197,
        ).unwrap();
        broker.record_receive(7, "KWP2000_BMW", 190).unwrap();
        assert_eq!(
            broker.record_receive(7, "KWP2000_BMW", 8).unwrap_err(),
            "receive_response_overflow"
        );
        assert!(!broker.snapshot().active_request);
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
        assert_eq!(snap.evidenced_attempt_count, 0);
        assert!(snap.evidenced_attempts.is_empty());
        assert!(!snap.active_request);
        assert!(!snap.writes_enabled);
    }
}
