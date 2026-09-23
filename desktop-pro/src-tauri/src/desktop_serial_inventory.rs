use serde::Serialize;
use serialport::{SerialPortInfo, SerialPortType};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSerialCandidate {
    pub port_name: String,
    pub kind: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub candidate_family: Option<&'static str>,
    pub usb_identity_only: bool,
    pub transport_verified: bool,
    pub ecu_verified: bool,
    pub writes_enabled: bool,
}

fn candidate_family(vid: u16, pid: u16) -> Option<&'static str> {
    match (vid, pid) {
        (0x0403, 0x6001) | (0x0403, 0x6010) => Some("FTDI"),
        (0x10C4, 0xEA60) => Some("CP210X"),
        (0x1A86, 0x7523) => Some("CH34X"),
        (0x067B, 0x2303) => Some("PL2303"),
        _ => None,
    }
}

fn sanitize(port: SerialPortInfo) -> DesktopSerialCandidate {
    match port.port_type {
        SerialPortType::UsbPort(info) => DesktopSerialCandidate {
            port_name: port.port_name,
            kind: "usb".into(),
            vid: Some(info.vid),
            pid: Some(info.pid),
            manufacturer: info.manufacturer,
            product: info.product,
            candidate_family: candidate_family(info.vid, info.pid),
            usb_identity_only: true,
            transport_verified: false,
            ecu_verified: false,
            writes_enabled: false,
        },
        SerialPortType::BluetoothPort => DesktopSerialCandidate {
            port_name: port.port_name,
            kind: "bluetooth".into(),
            vid: None,
            pid: None,
            manufacturer: None,
            product: None,
            candidate_family: None,
            usb_identity_only: false,
            transport_verified: false,
            ecu_verified: false,
            writes_enabled: false,
        },
        SerialPortType::PciPort => DesktopSerialCandidate {
            port_name: port.port_name,
            kind: "pci".into(),
            vid: None,
            pid: None,
            manufacturer: None,
            product: None,
            candidate_family: None,
            usb_identity_only: false,
            transport_verified: false,
            ecu_verified: false,
            writes_enabled: false,
        },
        SerialPortType::Unknown => DesktopSerialCandidate {
            port_name: port.port_name,
            kind: "unknown".into(),
            vid: None,
            pid: None,
            manufacturer: None,
            product: None,
            candidate_family: None,
            usb_identity_only: false,
            transport_verified: false,
            ecu_verified: false,
            writes_enabled: false,
        },
    }
}

pub fn list_sanitized_ports() -> Result<Vec<DesktopSerialCandidate>, String> {
    let ports = serialport::available_ports().map_err(|_| "serial_inventory_failed".to_string())?;
    Ok(ports.into_iter().map(sanitize).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_usb_ids_are_candidates_not_proof() {
        let item = sanitize(SerialPortInfo {
            port_name: "COM7".into(),
            port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                vid: 0x0403,
                pid: 0x6001,
                serial_number: Some("must-not-leak".into()),
                manufacturer: Some("FTDI".into()),
                product: Some("USB Serial".into()),
            }),
        });
        assert_eq!(item.port_name, "COM7");
        assert_eq!(item.candidate_family, Some("FTDI"));
        assert!(item.usb_identity_only);
        assert!(!item.transport_verified);
        assert!(!item.ecu_verified);
        assert!(!item.writes_enabled);
    }

    #[test]
    fn unknown_usb_identity_is_never_guessed() {
        let item = sanitize(SerialPortInfo {
            port_name: "COM9".into(),
            port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                vid: 0x1234,
                pid: 0x5678,
                serial_number: Some("private".into()),
                manufacturer: None,
                product: None,
            }),
        });
        assert_eq!(item.candidate_family, None);
        assert!(!item.transport_verified);
    }
}
