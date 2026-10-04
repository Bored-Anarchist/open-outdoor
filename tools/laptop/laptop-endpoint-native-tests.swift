import Foundation

@main
private enum LaptopEndpointTests {
  static func main() throws {
    let accepted = [
      "10.0.0.1", "172.16.0.1", "192.168.1.20", "100.64.0.0", "100.96.1.20",
      "100.127.255.255", "100.63.255.255", "100.128.0.1", "169.254.1.20",
      "198.51.100.20", "203.0.113.20", "172.15.0.1", "172.32.0.1"
    ]
    for host in accepted {
      let address = "http://\(host):8765"
      guard try OpenOutdoorLaptopEndpoint.url(address).absoluteString == address else {
        throw failure("Unexpected endpoint normalization")
      }
    }
    for (input, expected) in [
      ("http://[2001:0DB8:0:0:0:0:0:20]:8765/", "http://[2001:db8::20]:8765"),
      ("http://[fd12:3456::20]:8765", "http://[fd12:3456::20]:8765"),
      ("http://[fe80::20]:8765", "http://[fe80::20%25en0]:8765"),
      ("http://[fe80::20%25en0]:8765", "http://[fe80::20%25en0]:8765"),
      ("http://[64:ff9b::192.0.2.20]:8765", "http://[64:ff9b::c000:214]:8765")
    ] {
      guard try OpenOutdoorLaptopEndpoint.url(input, linkLocalInterface: "en0").absoluteString == expected else {
        throw failure("IPv6 endpoint normalization mismatch")
      }
    }
    let global = try OpenOutdoorLaptopEndpoint.url("http://[2001:db8::20]:8765")
    guard OpenOutdoorLaptopEndpoint.matchesResolvedAddress("2001:0db8:0:0:0:0:0:20", url: global),
      !OpenOutdoorLaptopEndpoint.matchesResolvedAddress("2001:db8::21", url: global),
      !OpenOutdoorLaptopEndpoint.matchesResolvedAddress("192.168.1.20", url: global) else { throw failure("IPv6 discovery mismatch") }
    let scoped = try OpenOutdoorLaptopEndpoint.url("http://[fe80::20]:8765", linkLocalInterface: "en0")
    guard OpenOutdoorLaptopEndpoint.matchesResolvedAddress("fe80::20%en0", url: scoped) else { throw failure("IPv6 scope mismatch") }
    let rejected = [
      "http://0.0.0.0:8765", "http://0.1.2.3:8765", "http://127.0.0.1:8765",
      "http://127.1.2.3:8765", "http://224.0.0.1:8765", "http://239.255.255.255:8765",
      "http://240.0.0.1:8765", "http://255.255.255.255:8765", "http://100.096.1.20:8765",
      "http://100.96.256.1:8765", "http://example.com:8765", "http://010.0.0.1:8765",
      "http://0xc0a80114:8765", "http://[::1]:8765", "https://192.168.1.20:8765",
      "http://user@192.168.1.20:8765", "http://192.168.1.20:80", "http://192.168.1.20:65536",
      "http://192.168.1.20:8765/path", "http://192.168.1.20:8765?code=secret",
      "http://192.168.1.20:8765#fragment",
      "http://[::]:8765", "http://[ff02::1]:8765", "http://[::ffff:127.0.0.1]:8765",
      "http://[::ffff:198.51.100.20]:8765", "http://[::192.168.1.20]:8765",
      "http://2001:db8::20:8765", "http://[example.com]:8765", "http://[2001:db8::20%25en0]:8765",
      "http://[fe80::20%en0]:8765", "http://[fe80::20%25bad%25scope]:8765",
      "http://[fe8::20%25en0]:8765", "http://[2001::db8::20]:8765", "http://[1:2:3:4:5:6:7:8:9]:8765"
    ]
    for address in rejected {
      do {
        _ = try OpenOutdoorLaptopEndpoint.url(address)
      } catch { continue }
      throw failure("Unsafe endpoint accepted: \(address)")
    }
    print("Native laptop endpoint validation passed.")
  }

  private static func failure(_ message: String) -> NSError {
    NSError(domain: "LaptopEndpointTests", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
