use crate::desktop_serial_inventory::DesktopSerialCandidate;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopTransportSnapshot {
    pub version: u8,
    pub stage: &'static str,
    pub epoch: u64,
    pub port_name: Option<String>,
    pub kind: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub candidate_family: Option<&'static str>,
    pub transport_open: bool,
    pub configured: bool,
    pub ecu_verified: bool,
    pub writes_enabled: bool,
}

#[derive(Default)]
pub struct DesktopTransportCoordinator {
    epoch: u64,
    selected: Option<DesktopSerialCandidate>,
}

impl DesktopTransportCoordinator {
    pub fn snapshot(&self) -> DesktopTransportSnapshot {
        match &self.selected {
            Some(item) => DesktopTransportSnapshot {
                version: 1,
                stage: if item.kind == "usb" {
                    "USB_CANDIDATE_BOUND"
                } else {
                    "SERIAL_CANDIDATE_BOUND"
                },
                epoch: self.epoch,
                port_name: Some(item.port_name.clone()),
                kind: Some(item.kind.clone()),
                vid: item.vid,
                pid: item.pid,
                candidate_family: item.candidate_family,
                transport_open: false,
                configured: false,
                ecu_verified: false,
                writes_enabled: false,
            },
            None => DesktopTransportSnapshot {
                version: 1,
                stage: "NO_CANDIDATE",
                epoch: self.epoch,
                port_name: None,
                kind: None,
                vid: None,
                pid: None,
                candidate_family: None,
                transport_open: false,
                configured: false,
                ecu_verified: false,
                writes_enabled: false,
            },
        }
    }

    pub fn bind_from_inventory(
        &mut self,
        inventory: &[DesktopSerialCandidate],
        port_name: &str,
    ) -> Result<DesktopTransportSnapshot, String> {
        if port_name.is_empty() || port_name.len() > 96 {
            return Err("invalid_port_name".into());
        }

        let candidate = inventory
            .iter()
            .find(|item| item.port_name == port_name)
            .cloned()
            .ok_or_else(|| "port_not_in_current_inventory".to_string())?;

        if candidate.transport_verified || candidate.ecu_verified || candidate.writes_enabled {
            return Err("unsafe_inventory_state".into());
        }

        self.epoch = if self.epoch == u64::MAX { 1 } else { self.epoch + 1 };
        self.selected = Some(candidate);
        Ok(self.snapshot())
    }

    pub fn clear(&mut self) -> DesktopTransportSnapshot {
        self.epoch = if self.epoch == u64::MAX { 1 } else { self.epoch + 1 };
        self.selected = None;
        self.snapshot()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(name: &str, family: Option<&'static str>) -> DesktopSerialCandidate {
        DesktopSerialCandidate {
            port_name: name.into(),
            kind: "usb".into(),
            vid: Some(0x0403),
            pid: Some(0x6001),
            manufacturer: Some("FTDI".into()),
            product: Some("USB Serial".into()),
            candidate_family: family,
            usb_identity_only: true,
            transport_verified: false,
            ecu_verified: false,
            writes_enabled: false,
        }
    }

    #[test]
    fn binding_is_epoch_scoped_and_never_opens_transport() {
        let inventory = vec![candidate("COM7", Some("FTDI")), candidate("COM8", None)];
        let mut state = DesktopTransportCoordinator::default();

        let first = state.bind_from_inventory(&inventory, "COM7").unwrap();
        assert_eq!(first.epoch, 1);
        assert_eq!(first.port_name.as_deref(), Some("COM7"));
        assert_eq!(first.candidate_family, Some("FTDI"));
        assert!(!first.transport_open);
        assert!(!first.configured);
        assert!(!first.ecu_verified);
        assert!(!first.writes_enabled);

        let second = state.bind_from_inventory(&inventory, "COM8").unwrap();
        assert_eq!(second.epoch, 2);
        assert_eq!(second.port_name.as_deref(), Some("COM8"));
        assert_eq!(second.candidate_family, None);
    }

    #[test]
    fn unknown_port_is_rejected_and_clear_invalidates_epoch() {
        let inventory = vec![candidate("COM7", Some("FTDI"))];
        let mut state = DesktopTransportCoordinator::default();

        assert_eq!(
            state.bind_from_inventory(&inventory, "COM404").unwrap_err(),
            "port_not_in_current_inventory"
        );
        let bound = state.bind_from_inventory(&inventory, "COM7").unwrap();
        let cleared = state.clear();
        assert_eq!(cleared.stage, "NO_CANDIDATE");
        assert!(cleared.epoch > bound.epoch);
        assert!(!cleared.transport_open);
        assert!(!cleared.writes_enabled);
    }
}
