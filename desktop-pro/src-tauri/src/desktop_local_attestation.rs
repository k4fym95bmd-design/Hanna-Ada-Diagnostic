use crate::desktop_native_serial::DesktopNativeSerialSnapshot;
use crate::desktop_request_broker::{DesktopEvidencedAttempt, DesktopRequestBrokerSnapshot};
use crate::desktop_transport_coordinator::DesktopTransportSnapshot;
use serde::Serialize;

#[derive(Default)]
pub struct DesktopLocalAttestationState {
    sequence: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLocalAttestation {
    pub version: u8,
    pub evidence_contract_version: u8,
    pub stage: &'static str,
    pub host: &'static str,
    pub epoch: u64,
    pub sequence: u64,
    pub protocol: &'static str,
    pub transport_configured: bool,
    pub broker_idle: bool,
    pub broker_attempt_count: usize,
    pub broker_evidenced_attempt_count: usize,
    pub broker_evidenced_attempts: Vec<DesktopEvidencedAttempt>,
    pub raw_serial_write_exposed: bool,
    pub identity_verified: bool,
    pub ecu_verified: bool,
    pub writes_enabled: bool,
    pub flash_enabled: bool,
}

impl DesktopLocalAttestationState {
    pub fn attest(
        &mut self,
        transport: &DesktopTransportSnapshot,
        native: &DesktopNativeSerialSnapshot,
        broker: &DesktopRequestBrokerSnapshot,
        epoch: u64,
        protocol: &str,
    ) -> Result<DesktopLocalAttestation, String> {
        if transport.epoch != epoch || native.epoch != epoch || broker.epoch != epoch {
            return Err("attestation_epoch_mismatch".into());
        }
        if !transport.transport_open || !transport.configured
            || !native.transport_open || !native.configured {
            return Err("attestation_transport_not_configured".into());
        }
        if native.protocol != Some(protocol) {
            return Err("attestation_protocol_mismatch".into());
        }
        if broker.active_request || broker.stage != "BROKER_IDLE" {
            return Err("attestation_request_still_active".into());
        }
        if broker.evidenced_attempt_count < 2 {
            return Err("attestation_requires_two_evidenced_attempts".into());
        }
        if broker.evidenced_attempts.len() != broker.evidenced_attempt_count {
            return Err("attestation_evidence_ledger_mismatch".into());
        }

        self.sequence = if self.sequence == u64::MAX { 1 } else { self.sequence + 1 };

        let protocol_static = match protocol {
            "DS2" => "DS2",
            "KWP2000_BMW" => "KWP2000_BMW",
            _ => return Err("attestation_protocol_unsupported".into()),
        };

        Ok(DesktopLocalAttestation {
            version: 1,
            evidence_contract_version: 1,
            stage: "LOCAL_HOST_ATTESTED",
            host: "native-desktop",
            epoch,
            sequence: self.sequence,
            protocol: protocol_static,
            transport_configured: true,
            broker_idle: true,
            broker_attempt_count: broker.attempt_count,
            broker_evidenced_attempt_count: broker.evidenced_attempt_count,
            broker_evidenced_attempts: broker.evidenced_attempts.clone(),
            raw_serial_write_exposed: false,
            identity_verified: false,
            ecu_verified: false,
            writes_enabled: false,
            flash_enabled: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transport(epoch: u64) -> DesktopTransportSnapshot {
        DesktopTransportSnapshot {
            version: 1,
            evidence_contract_version: 1,
            stage: "PORT_CONFIGURED",
            evidence_stage: "PORT_OPEN",
            epoch,
            port_name: Some("COM7".into()),
            kind: Some("usb".into()),
            vid: Some(0x0403),
            pid: Some(0x6001),
            candidate_family: Some("FTDI"),
            transport_open: true,
            configured: true,
            ecu_verified: false,
            writes_enabled: false,
        }
    }

    fn native(epoch: u64) -> DesktopNativeSerialSnapshot {
        DesktopNativeSerialSnapshot {
            version: 1,
            evidence_contract_version: 1,
            evidence_stage: "PORT_OPEN",
            stage: "PORT_CONFIGURED",
            epoch,
            port_name: Some("COM7".into()),
            protocol: Some("KWP2000_BMW"),
            baud_rate: Some(10400),
            transport_open: true,
            configured: true,
            ecu_verified: false,
            writes_enabled: false,
        }
    }

    fn broker(epoch: u64, attempts: usize, evidenced: usize, active: bool) -> DesktopRequestBrokerSnapshot {
        DesktopRequestBrokerSnapshot {
            version: 1,
            evidence_contract_version: 1,
            stage: if active { "REQUEST_ACTIVE" } else { "BROKER_IDLE" },
            epoch,
            active_request: active,
            active_request_id: if active { Some("request-active".into()) } else { None },
            operation_id: None,
            protocol: None,
            timeout_ms: None,
            max_response_bytes: None,
            attempt_count: attempts,
            evidenced_attempt_count: evidenced,
            evidenced_attempts: (0..evidenced).map(|i| DesktopEvidencedAttempt {
                request_id: format!("evidenced-request-{}", i + 1),
                native_receive_receipt: (i + 1) as u64,
            }).collect(),
            max_attempts: 32,
            active_receive_receipt: if active { Some(1) } else { None },
            active_received_bytes: if active { 4 } else { 0 },
            tx_bytes_exposed: false,
            write_like: false,
            ecu_verified: false,
            writes_enabled: false,
            flash_enabled: false,
        }
    }

    #[test]
    fn attestation_requires_configured_idle_same_epoch_and_two_attempts() {
        let mut state = DesktopLocalAttestationState::default();

        assert_eq!(
            state.attest(&transport(7), &native(7), &broker(7, 2, 1, false), 7, "KWP2000_BMW").unwrap_err(),
            "attestation_requires_two_evidenced_attempts"
        );
        assert_eq!(
            state.attest(&transport(7), &native(7), &broker(7, 2, 2, true), 7, "KWP2000_BMW").unwrap_err(),
            "attestation_request_still_active"
        );

        let attested = state.attest(
            &transport(7), &native(7), &broker(7, 2, 2, false), 7, "KWP2000_BMW"
        ).unwrap();
        assert_eq!(attested.stage, "LOCAL_HOST_ATTESTED");
        assert_eq!(attested.sequence, 1);
        assert!(attested.transport_configured);
        assert!(attested.broker_idle);
        assert_eq!(attested.broker_evidenced_attempt_count, 2);
        assert_eq!(attested.broker_evidenced_attempts.len(), 2);
        assert_eq!(attested.broker_evidenced_attempts[0].native_receive_receipt, 1);
        assert!(!attested.raw_serial_write_exposed);
        assert!(!attested.identity_verified);
        assert!(!attested.ecu_verified);
        assert!(!attested.writes_enabled);
        assert!(!attested.flash_enabled);
    }

    #[test]
    fn attestation_rejects_epoch_and_protocol_mismatch() {
        let mut state = DesktopLocalAttestationState::default();
        assert_eq!(
            state.attest(&transport(7), &native(7), &broker(7, 2, 2, false), 8, "KWP2000_BMW").unwrap_err(),
            "attestation_epoch_mismatch"
        );
        assert_eq!(
            state.attest(&transport(7), &native(7), &broker(7, 2, 2, false), 7, "DS2").unwrap_err(),
            "attestation_protocol_mismatch"
        );
    }
}
