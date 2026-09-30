import ExpoModulesCore
import Foundation
import Darwin

/// Main-run-loop Bonjour search, bounded to five seconds and twenty resolving services.
internal final class OpenOutdoorLaptopDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  private var browser: NetServiceBrowser?
  private var pending: Promise?
  private var timer: Timer?
  private var services: [NetService] = []
  private var found: [[String: String]] = []

  func discover(_ promise: Promise) {
    cancel()
    pending = promise
    let next = NetServiceBrowser()
    browser = next
    next.delegate = self
    next.searchForServices(ofType: "_openoutdoor._tcp.", inDomain: "local.")
    timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in self?.cancel() }
  }
  func cancel() {
    let promise = pending
    pending = nil
    timer?.invalidate(); timer = nil
    browser?.delegate = nil; browser?.stop(); browser = nil
    for service in services { service.delegate = nil; service.stop() }
    services = []
    let result = found
    found = []
    let data = try? JSONSerialization.data(withJSONObject: result)
    promise?.resolve(data.flatMap { String(data: $0, encoding: .utf8) } ?? "[]")
  }
  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    guard self.browser === browser, pending != nil, services.count < 20,
      !services.contains(where: { $0.name == service.name && $0.domain == service.domain }) else { return }
    services.append(service)
    service.delegate = self
    service.resolve(withTimeout: 3)
  }
  func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    guard self.browser === browser else { return }
    if let current = services.first(where: { $0.name == service.name && $0.domain == service.domain }) {
      current.delegate = nil; current.stop()
      found.removeAll { $0["name"] == current.name }
      services.removeAll { $0 === current }
    }
  }
  func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
    guard self.browser === browser else { return }
    cancel()
  }
  func netServiceDidResolveAddress(_ sender: NetService) {
    guard pending != nil, services.contains(where: { $0 === sender }),
      sender.name.utf8.count <= 80, sender.name.rangeOfCharacter(from: .controlCharacters) == nil,
      let data = sender.txtRecordData(), data.count <= 512 else { return }
    let txt = NetService.dictionary(fromTXTRecord: data)
    guard let version = txt["v"], String(data: version, encoding: .utf8) == "1",
      let addressData = txt["address"], let address = String(data: addressData, encoding: .utf8),
      let url = try? OpenOutdoorLaptopEndpoint.url(address), url.port == sender.port,
      sender.addresses?.contains(where: { data in
        data.withUnsafeBytes { bytes -> Bool in
          guard let pointer = bytes.baseAddress, data.count >= MemoryLayout<sockaddr_in>.size else { return false }
          let socket = pointer.assumingMemoryBound(to: sockaddr.self)
          guard socket.pointee.sa_family == sa_family_t(AF_INET) else { return false }
          var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          guard getnameinfo(socket, socklen_t(data.count), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { return false }
          return String(cString: host) == url.host
        }
      }) == true, !found.contains(where: { $0["address"] == url.absoluteString }) else { return }
    found.append(["name": sender.name, "address": url.absoluteString])
  }
}
