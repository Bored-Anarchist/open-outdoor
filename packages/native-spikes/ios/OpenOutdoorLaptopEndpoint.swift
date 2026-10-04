import Foundation
import Darwin

internal enum OpenOutdoorLaptopEndpoint {
  static func url(_ input: String, linkLocalInterface: String? = nil) throws -> URL {
    let pattern = "^http://(\\[[^\\]]+\\]|[0-9]+(?:\\.[0-9]+){3}):([0-9]{4,5})/?$"
    guard input.utf8.count <= 160, let expression = try? NSRegularExpression(pattern: pattern),
      let match = expression.firstMatch(in: input, range: NSRange(input.startIndex..., in: input)),
      let hostRange = Range(match.range(at: 1), in: input), let portRange = Range(match.range(at: 2), in: input),
      let port = Int(input[portRange]), (1024...65535).contains(port) else { throw failure() }
    let raw = String(input[hostRange])
    let host: String
    if raw.hasPrefix("[") {
      let parts = String(raw.dropFirst().dropLast()).components(separatedBy: "%25")
      guard parts.count <= 2, let bytes = ipv6Bytes(parts[0]), bytes[0] != 0xff,
        !bytes.prefix(12).allSatisfy({ $0 == 0 }),
        !(bytes.prefix(10).allSatisfy({ $0 == 0 }) && bytes[10] == 0xff && bytes[11] == 0xff) else { throw failure() }
      let linkLocal = bytes[0] == 0xfe && bytes[1] & 0xc0 == 0x80
      guard parts.count == 1 || linkLocal && parts[1].range(of: "^[A-Za-z0-9_.-]{1,32}$", options: .regularExpression) != nil else { throw failure() }
      var buffer = [CChar](repeating: 0, count: Int(INET6_ADDRSTRLEN))
      let normalized = bytes.withUnsafeBytes { inet_ntop(AF_INET6, $0.baseAddress!, &buffer, socklen_t(buffer.count)) }
      guard normalized != nil else { throw failure() }
      // Scope IDs identify interfaces on the receiving device, never the laptop's adapter.
      let zone = linkLocal ? "%25\(linkLocalInterface ?? (parts.count == 2 ? parts[1] : "en0"))" : ""
      host = "[\(String(cString: buffer))\(zone)]"
    } else {
      let octets = raw.split(separator: ".", omittingEmptySubsequences: false)
      guard octets.count == 4, octets.allSatisfy({ value in
        value.range(of: "^(0|[1-9][0-9]{0,2})$", options: .regularExpression) != nil && (Int(value) ?? 256) <= 255
      }), let first = Int(octets[0]), first != 0, first != 127, first < 224 else { throw failure() }
      host = raw
    }
    guard let url = URL(string: "http://\(host):\(port)") else { throw failure() }
    return url
  }

  static func matchesResolvedAddress(_ address: String, url: URL) -> Bool {
    guard let host = url.host else { return false }
    let expected = host.trimmingCharacters(in: CharacterSet(charactersIn: "[]")).components(separatedBy: "%")[0]
    let resolved = address.components(separatedBy: "%")[0]
    if expected.contains(":") {
      guard let a = ipv6Bytes(expected), let b = ipv6Bytes(resolved) else { return false }
      return a == b
    }
    return expected == resolved
  }

  private static func ipv6Bytes(_ input: String) -> [UInt8]? {
    guard input.range(of: "^[0-9a-fA-F:.]+$", options: .regularExpression) != nil else { return nil }
    var bytes = [UInt8](repeating: 0, count: 16)
    let result = bytes.withUnsafeMutableBytes { inet_pton(AF_INET6, input, $0.baseAddress!) }
    return result == 1 ? bytes : nil
  }

  private static func failure() -> NSError {
    NSError(domain: "OpenOutdoorLaptop", code: 1, userInfo: [NSLocalizedDescriptionKey: "Enter the laptop's IPv4 or bracketed IPv6 address shown on its pairing page."])
  }
}
