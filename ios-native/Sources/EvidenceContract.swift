import Foundation

enum EvidenceStage: String, CaseIterable {
    case noCable = "NO_CABLE"
    case usbSeen = "USB_SEEN"
    case hardwareBound = "HARDWARE_BOUND"
    case portOpen = "PORT_OPEN"
    case rxActivity = "RX_ACTIVITY"
    case frameCandidate = "FRAME_CANDIDATE"
    case readOnlyIdentityVerified = "READ_ONLY_IDENTITY_VERIFIED"
}

enum EvidenceContract {
    static let version = 1
    static let transportMaximumStage: EvidenceStage = .frameCandidate
}
