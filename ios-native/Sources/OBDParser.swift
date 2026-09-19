import Foundation

enum OBDParserError: LocalizedError, Equatable {
    case adapterError(String)
    case noPositiveResponse(String)
    case truncatedResponse(String)

    var errorDescription: String? {
        switch self {
        case .adapterError(let raw): return "Adapter/ECU error: \(raw)"
        case .noPositiveResponse(let raw): return "No valid ECU response. RAW: \(raw)"
        case .truncatedResponse(let raw): return "Incomplete ECU response. RAW: \(raw)"
        }
    }
}

enum OBDParser {
    static func clean(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: "\0", with: "")
            .replacingOccurrences(of: "SEARCHING...", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: ">", with: "")
            .replacingOccurrences(of: "\r", with: "\n")
            .split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }

    static func validateNoAdapterError(_ raw: String) throws {
        let upper = raw.uppercased()
        let errors = ["NO DATA", "UNABLE TO CONNECT", "BUS ERROR", "CAN ERROR", "BUFFER FULL", "STOPPED", "?"]
        if errors.contains(where: upper.contains) {
            throw OBDParserError.adapterError(clean(raw))
        }
    }

    static func lineBytes(_ line: String) -> [UInt8] {
        let normalized = line.uppercased().replacingOccurrences(of: ">", with: " ")
        let tokens = normalized.split { $0.isWhitespace }
        var output: [UInt8] = []

        if tokens.count <= 1 {
            let compact = normalized.filter { $0.isHexDigit }
            guard compact.count.isMultiple(of: 2) else { return [] }
            var index = compact.startIndex
            while index < compact.endIndex {
                let next = compact.index(index, offsetBy: 2)
                if let byte = UInt8(compact[index..<next], radix: 16) { output.append(byte) }
                index = next
            }
            return output
        }

        for tokenSub in tokens {
            let token = String(tokenSub).filter { $0.isHexDigit }
            if token.count == 2, let byte = UInt8(token, radix: 16) {
                output.append(byte)
            } else if token.count > 2, token.count.isMultiple(of: 2) {
                var index = token.startIndex
                while index < token.endIndex {
                    let next = token.index(index, offsetBy: 2)
                    if let byte = UInt8(token[index..<next], radix: 16) { output.append(byte) }
                    index = next
                }
            }
        }
        return output
    }

    static func responseLines(_ raw: String) -> [[UInt8]] {
        clean(raw)
            .split(separator: "\n")
            .map(String.init)
            .map(lineBytes)
            .filter { !$0.isEmpty }
    }

    static func supportedPIDs01to20(from raw: String) throws -> Set<Int> {
        try validateNoAdapterError(raw)
        var bitmap = [UInt8](repeating: 0, count: 4)
        var validFrameCount = 0
        var sawTruncatedPositive = false

        for bytes in responseLines(raw) {
            guard bytes.count >= 2 else { continue }
            for index in 0..<(bytes.count - 1) where bytes[index] == 0x41 && bytes[index + 1] == 0x00 {
                guard bytes.count >= index + 6 else {
                    sawTruncatedPositive = true
                    continue
                }
                validFrameCount += 1
                for offset in 0..<4 {
                    bitmap[offset] |= bytes[index + 2 + offset]
                }
            }
        }

        // One truncated responder must not be masked by a complete response from another ECU.
        if sawTruncatedPositive { throw OBDParserError.truncatedResponse(clean(raw)) }
        if validFrameCount == 0 { throw OBDParserError.noPositiveResponse(clean(raw)) }

        var result = Set<Int>()
        for bitIndex in 0..<32 {
            let byteIndex = bitIndex / 8
            let bitInByte = 7 - (bitIndex % 8)
            if bitmap[byteIndex] & (1 << bitInByte) != 0 {
                result.insert(bitIndex + 1)
            }
        }
        return result
    }

    static func payload(for pid: UInt8, in raw: String, minimumBytes: Int) throws -> [UInt8] {
        try validateNoAdapterError(raw)
        var matches: [[UInt8]] = []
        var truncated = false
        for bytes in responseLines(raw) {
            guard bytes.count >= 2 else { continue }
            for index in 0..<(bytes.count - 1) where bytes[index] == 0x41 && bytes[index + 1] == pid {
                let start = index + 2
                guard bytes.count >= start + minimumBytes else {
                    truncated = true
                    continue
                }
                matches.append(Array(bytes[start..<bytes.count]))
            }
        }
        if truncated { throw OBDParserError.truncatedResponse(clean(raw)) }
        if matches.count == 1 { return matches[0] }
        throw OBDParserError.noPositiveResponse(clean(raw))
    }

    static func rpm(from raw: String) throws -> Double {
        let p = try payload(for: 0x0C, in: raw, minimumBytes: 2)
        return Double(Int(p[0]) * 256 + Int(p[1])) / 4.0
    }

    static func coolant(from raw: String) throws -> Double {
        let p = try payload(for: 0x05, in: raw, minimumBytes: 1)
        return Double(Int(p[0]) - 40)
    }

    // Returns the declared payload for an explicitly addressed ISO-TP CAN single frame.
    // This removes both PCI and bus padding. Multi-frame DTC responses are rejected
    // rather than interpreted as an incomplete or incorrect single-frame result.
    private static func canSingleFrame(_ line: String, raw: String) throws -> [UInt8]? {
        let tokens = line.split { $0.isWhitespace }.map(String.init)
        guard tokens.count >= 3 else { return nil }
        let header = tokens[0]
        guard (header.count == 3 || header.count == 8), header.allSatisfy(\.isHexDigit),
              tokens[1].count == 2, let pci = UInt8(tokens[1], radix: 16) else { return nil }
        let bytes = lineBytes(tokens.dropFirst().joined(separator: " "))
        guard !bytes.isEmpty else { throw OBDParserError.truncatedResponse(raw) }
        guard pci >> 4 == 0 else {
            throw OBDParserError.adapterError("ISO-TP multi-frame/unsupported CAN payload; RAW: \(raw)")
        }
        let declared = Int(pci & 0x0F)
        guard declared > 0, bytes.count >= declared + 1 else {
            throw OBDParserError.truncatedResponse(raw)
        }
        return Array(bytes[1...declared])
    }

    static func dtcs(from raw: String, responseService: UInt8 = 0x43) throws -> [String] {
        try validateNoAdapterError(raw)
        let cleaned = clean(raw)
        var codes = Set<String>()
        var sawPositive = false

        for line in cleaned.split(separator: "\n").map(String.init) {
            let framed = try canSingleFrame(line, raw: cleaned)
            let bytes = framed ?? lineBytes(line)
            guard let marker = bytes.firstIndex(of: responseService) else { continue }
            sawPositive = true
            let payload = Array(bytes[(marker + 1)...])
            let dtcBytes: [UInt8]

            if framed != nil {
                // ISO 15765-4: 43, count, two bytes for each DTC.
                guard let count = payload.first, payload.count >= 1 + Int(count) * 2 else {
                    throw OBDParserError.truncatedResponse(cleaned)
                }
                let end = 1 + Int(count) * 2
                guard payload[end...].allSatisfy({ $0 == 0 }) else {
                    throw OBDParserError.truncatedResponse(cleaned)
                }
                dtcBytes = Array(payload[1..<end])
            } else if payload.count >= 2 && payload.count.isMultiple(of: 2) {
                // Legacy ISO 9141/KWP/J1850: no count byte; padded zero DTC pairs.
                dtcBytes = payload
            } else if payload.count >= 3, let count = payload.first, count > 0,
                      payload.count >= 1 + Int(count) * 2,
                      payload[(1 + Int(count) * 2)...].allSatisfy({ $0 == 0 }) {
                // ELM with headers off can produce an unframed CAN count + DTC pairs.
                // Never accept an unframed count-only zero reply as confirmed no faults.
                dtcBytes = Array(payload[1..<(1 + Int(count) * 2)])
            } else {
                throw OBDParserError.truncatedResponse(cleaned)
            }

            for index in stride(from: 0, to: dtcBytes.count, by: 2) {
                let a = dtcBytes[index], b = dtcBytes[index + 1]
                if a != 0 || b != 0 { codes.insert(dtcCode(a, b)) }
            }
        }
        guard sawPositive else { throw OBDParserError.noPositiveResponse(cleaned) }
        return codes.sorted()
    }

    static func dtcCode(_ a: UInt8, _ b: UInt8) -> String {
        let families = ["P", "C", "B", "U"]
        let family = families[Int((a >> 6) & 0x03)]
        let d1 = String((a >> 4) & 0x03, radix: 16).uppercased()
        let d2 = String(a & 0x0F, radix: 16).uppercased()
        return "\(family)\(d1)\(d2)\(String(format: "%02X", b))"
    }

    static func misfireCylinder(from code: String) -> Int? {
        guard code.count == 5, code.hasPrefix("P030"), let cylinder = Int(code.suffix(1)), (1...8).contains(cylinder) else { return nil }
        return cylinder
    }
}
