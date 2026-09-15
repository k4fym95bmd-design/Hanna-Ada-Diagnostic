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

        if validFrameCount == 0 {
            if sawTruncatedPositive { throw OBDParserError.truncatedResponse(clean(raw)) }
            throw OBDParserError.noPositiveResponse(clean(raw))
        }

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
        if matches.count == 1 { return matches[0] }
        if matches.isEmpty && truncated { throw OBDParserError.truncatedResponse(clean(raw)) }
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

    static func dtcs(from raw: String, responseService: UInt8 = 0x43) throws -> [String] {
        try validateNoAdapterError(raw)
        var codes = Set<String>()
        var sawPositive = false
        for bytes in responseLines(raw) {
            guard let marker = bytes.firstIndex(of: responseService) else { continue }
            sawPositive = true
            var index = marker + 1
            while index + 1 < bytes.count {
                let a = bytes[index], b = bytes[index + 1]
                if a != 0 || b != 0 { codes.insert(dtcCode(a, b)) }
                index += 2
            }
        }
        guard sawPositive else { throw OBDParserError.noPositiveResponse(clean(raw)) }
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
