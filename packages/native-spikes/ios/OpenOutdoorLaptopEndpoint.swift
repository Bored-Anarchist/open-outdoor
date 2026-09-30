import Foundation

internal enum OpenOutdoorLaptopEndpoint {
  static func url(_ input: String) throws -> URL {
    guard input.utf8.count <= 80, let parts = URLComponents(string: input), parts.scheme == "http",
      let host = parts.host, let port = parts.port, (1024...65535).contains(port),
      parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
      parts.path.isEmpty || parts.path == "/" else {
      throw NSError(domain: "OpenOutdoorLaptop", code: 1, userInfo: [NSLocalizedDescriptionKey: "Enter the laptop address shown in its terminal, such as http://192.168.1.20:8765."])
    }
    let octets = host.split(separator: ".", omittingEmptySubsequences: false)
    guard octets.count == 4, octets.allSatisfy({ value in
      value.range(of: "^(0|[1-9][0-9]{0,2})$", options: .regularExpression) != nil && (Int(value) ?? 256) <= 255
    }) else { throw NSError(domain: "OpenOutdoorLaptop", code: 1, userInfo: [NSLocalizedDescriptionKey: "Use the laptop's private IPv4 address shown in its terminal."]) }
    let a = Int(octets[0])!, b = Int(octets[1])!
    guard a == 10 || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168),
      let url = URL(string: "http://\(host):\(port)") else {
      throw NSError(domain: "OpenOutdoorLaptop", code: 1, userInfo: [NSLocalizedDescriptionKey: "Connect to a laptop on your local Wi-Fi using its private IPv4 address."])
    }
    return url
  }
}
