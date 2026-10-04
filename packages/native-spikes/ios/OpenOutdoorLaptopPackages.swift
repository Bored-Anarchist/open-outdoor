import ExpoModulesCore
import Foundation

/// Foreground-only transfer. Credentials and the connection remain in memory.
/// All methods and URLSession callbacks share the state-package serial queue.
internal final class OpenOutdoorLaptopPackages: NSObject, URLSessionDataDelegate, URLSessionDownloadDelegate {
  private let store: OpenOutdoorStatePackages
  private let queue: DispatchQueue
  private var session: URLSession?
  private var task: URLSessionTask?
  private var pending: Promise?
  private var baseURL: URL?
  private var pairingCode = ""
  private var expectedFingerprint = ""
  private var signingPublicKey = ""
  private var catalogCache: Data?
  private var offered: [OpenOutdoorStatePackages.Pin] = []
  private var incoming: OpenOutdoorStatePackages.Pin?
  private var catalogData = Data()
  private var received: Int64 = 0
  private var failureReason: String?
  private var phase = "idle"
  private let catalogLimit = 64 * 1024

  init(store: OpenOutdoorStatePackages, queue: DispatchQueue) {
    self.store = store
    self.queue = queue
  }
  private func failure(_ message: String) -> NSError {
    NSError(domain: "OpenOutdoorLaptop", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func start(path: String, promise: Promise, download: Bool) throws {
    guard pending == nil, let baseURL else { throw failure("Connect to the laptop before downloading a state.") }
    let config = URLSessionConfiguration.ephemeral
    config.allowsCellularAccess = false
    config.waitsForConnectivity = true
    config.urlCache = nil
    config.httpCookieStorage = nil
    config.urlCredentialStorage = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 30
    config.timeoutIntervalForResource = download ? 900 : 30
    let delegates = OperationQueue()
    delegates.maxConcurrentOperationCount = 1
    delegates.underlyingQueue = queue
    let next = URLSession(configuration: config, delegate: self, delegateQueue: delegates)
    var request = URLRequest(url: baseURL.appendingPathComponent(path))
    request.setValue("Bearer \(pairingCode)", forHTTPHeaderField: "Authorization")
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    request.httpShouldHandleCookies = false
    request.allowsCellularAccess = false
    session = next
    pending = promise
    failureReason = nil
    received = 0
    catalogData = Data()
    phase = download ? "downloading" : "connecting"
    task = download ? next.downloadTask(with: request) : next.dataTask(with: request)
    task?.resume()
  }
  func connect(_ input: String, code: String, fingerprint: String = "", promise: Promise) {
    guard pending == nil else { promise.reject(OpenOutdoorLaptopException("LAPTOP_BUSY", "Wait for the current transfer or cancel it.")); return }
    disconnect()
    do {
      baseURL = try OpenOutdoorLaptopEndpoint.url(input)
      guard code.utf8.count == 32, code.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil else {
        throw failure("Paste the 32-character pairing code shown in the laptop terminal.")
      }
      pairingCode = code
      guard fingerprint.isEmpty || fingerprint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil && fingerprint.utf8.count == 64 else { throw failure("Use the signing fingerprint shown on the laptop pairing page.") }
      expectedFingerprint = fingerprint
      try start(path: "v1/catalog", promise: promise, download: false)
    } catch { disconnect(); promise.reject(OpenOutdoorLaptopException("LAPTOP_CONNECT_FAILED", error.localizedDescription)) }
  }
  func download(_ state: String, promise: Promise) {
    guard pending == nil else { promise.reject(OpenOutdoorLaptopException("LAPTOP_BUSY", "Wait for the current transfer or cancel it.")); return }
    do {
      guard let pin = offered.first(where: { $0.state == state }) else {
        throw failure("Reconnect to the laptop and choose an available state.")
      }
      try store.preflight(pin, download: true)
      incoming = pin
      try start(path: "v1/packages/\(pin.state)", promise: promise, download: true)
    } catch { incoming = nil; promise.reject(OpenOutdoorLaptopException("LAPTOP_DOWNLOAD_FAILED", error.localizedDescription)) }
  }
  func progress() throws -> String {
    let value: [String: Any] = ["phase": phase, "receivedBytes": received, "totalBytes": incoming?.bytes ?? 0]
    return String(data: try JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
  }
  func cancel() {
    guard pending != nil else { return }
    let wasConnecting = incoming == nil
    task?.cancel()
    finish(error: "Transfer cancelled. Installed states and your notes are kept.")
    if wasConnecting { baseURL = nil; pairingCode = ""; offered = [] }
  }
  func disconnect() {
    cancel()
    baseURL = nil
    pairingCode = ""
    offered = []
    expectedFingerprint = ""
    signingPublicKey = ""
    catalogCache = nil
  }
  func refresh(_ promise: Promise) {
    do { try start(path: "v1/catalog", promise: promise, download: false) }
    catch { promise.reject(OpenOutdoorLaptopException("LAPTOP_REFRESH_FAILED", error.localizedDescription)) }
  }
  func approveSigner(_ promise: Promise) {
    guard pending == nil, let cache = catalogCache, !expectedFingerprint.isEmpty, !signingPublicKey.isEmpty else { promise.reject(OpenOutdoorLaptopException("LAPTOP_TRUST_FAILED", "Scan the current laptop QR code or enter its signing fingerprint before approving updates.")); return }
    do {
      // The independent QR/manual fingerprint must match before an API key can be enrolled.
      _ = try catalogResult(cache)
      try store.approveUpdateSigner(signingPublicKey, fingerprint: expectedFingerprint)
      promise.resolve(try catalogResult(cache))
    } catch { promise.reject(OpenOutdoorLaptopException("LAPTOP_TRUST_FAILED", error.localizedDescription)) }
  }
  func revokeSigner(_ promise: Promise) {
    guard pending == nil, let cache = catalogCache, !signingPublicKey.isEmpty else { promise.reject(OpenOutdoorLaptopException("LAPTOP_TRUST_FAILED", "Connect to the laptop before changing update trust.")); return }
    do {
      try store.trust().revoke(OpenOutdoorStateUpdateTrust.fingerprint(signingPublicKey))
      promise.resolve(try catalogResult(cache))
    } catch { promise.reject(OpenOutdoorLaptopException("LAPTOP_TRUST_FAILED", error.localizedDescription)) }
  }
  private func finish(value: String? = nil, error: String? = nil) {
    let promise = pending
    pending = nil
    task = nil
    incoming = nil
    catalogData = Data()
    phase = "idle"
    session?.invalidateAndCancel()
    session = nil
    if let error { promise?.reject(OpenOutdoorLaptopException("LAPTOP_TRANSFER_FAILED", error)) }
    else { promise?.resolve(value) }
  }
  private func responseError(_ response: URLResponse?) -> String? {
    guard let response = response as? HTTPURLResponse else { return "The laptop returned an invalid response." }
    if response.statusCode == 401 { return "Pairing code rejected. Reconnect using the code currently shown on the laptop." }
    if response.statusCode != 200 { return "The state package is unavailable. Check the laptop server and reconnect." }
    if let pin = incoming, response.expectedContentLength != pin.bytes {
      return "State download size does not match this app's supported package."
    }
    return nil
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    if self.session === session { failureReason = "The laptop redirected the connection. Use the address shown in its terminal." }
    completionHandler(nil) // Never forward the pairing header to another destination.
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard self.session === session else { completionHandler(.cancel); return }
    failureReason = responseError(response)
    if response.expectedContentLength > Int64(catalogLimit) { failureReason = "The laptop's state list is too large." }
    completionHandler(failureReason == nil ? .allow : .cancel)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard self.session === session else { return }
    guard catalogData.count + data.count <= catalogLimit else {
      failureReason = "The laptop's state list is too large."
      dataTask.cancel()
      return
    }
    catalogData.append(data)
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                  totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    guard self.session === session, let pin = incoming else { return }
    received = totalBytesWritten
    if let error = responseError(downloadTask.response) { failureReason = error; downloadTask.cancel() }
    else if totalBytesWritten > pin.bytes { failureReason = "State download exceeded its supported size."; downloadTask.cancel() }
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard self.session === session, let pin = incoming else { return }
    defer { try? FileManager.default.removeItem(at: location) }
    do {
      if let message = failureReason ?? responseError(downloadTask.response) { throw failure(message) }
      guard (try location.resourceValues(forKeys: [.fileSizeKey])).fileSize == Int(pin.bytes) else {
        throw failure("The state download was incomplete. Reconnect and retry.")
      }
      phase = "verifying"
      let result = try store.install(location, authorizedPin: pin) // Reuses signed/build authorization, disk checks and atomic activation.
      finish(value: result)
    } catch { finish(error: error.localizedDescription) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard self.session === session else { return }
    if let message = failureReason { finish(error: message); return }
    if let error {
      if incoming == nil { baseURL = nil; pairingCode = ""; offered = [] }
      finish(error: OpenOutdoorLaptopException.connectionMessage(error))
      return
    }
    guard incoming == nil else { finish(error: "The state download was incomplete. Reconnect and retry."); return }
    do {
      let result = try catalogResult(catalogData)
      catalogCache = catalogData
      finish(value: result)
    } catch {
      baseURL = nil; pairingCode = ""; offered = []; signingPublicKey = ""; catalogCache = nil
      finish(error: error.localizedDescription)
    }
  }
  private func catalogResult(_ data: Data) throws -> String {
      guard let catalog = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let packages = catalog["packages"] as? [[String: Any]], packages.count <= 50 else { throw failure("The laptop's state list is not supported.") }
      if catalog["schemaVersion"] as? Int == 2 {
        guard let identity = catalog["signingKey"] as? [String: String], let publicKey = identity["publicKey"],
          let id = identity["keyId"], try OpenOutdoorStateUpdateTrust.fingerprint(publicKey) == id,
          expectedFingerprint.isEmpty || expectedFingerprint == id else { throw failure("The laptop signing key does not match its pairing page. Scan the current QR code.") }
        let trust = try store.trust()
        let trusted = trust.isTrusted(publicKey)
        var seen = Set<String>()
        var accepted: [OpenOutdoorStatePackages.Pin] = []
        var values: [[String: Any]] = []
        var blocked = 0
        for entry in packages {
          let ticket = try JSONDecoder().decode(OpenOutdoorStateUpdateTrust.Ticket.self, from: JSONSerialization.data(withJSONObject: entry))
          // Invalid signatures abort the entire list. Stale but valid snapshots are counted separately.
          let manifest = try trust.inspect(ticket, publicKey: publicKey, requireTrusted: false, checkReplay: false)
          guard seen.insert(manifest.state).inserted else { throw failure("The laptop's state list contains duplicate states.") }
          do {
            let pin = try store.updatePin(ticket, publicKey: publicKey, requireTrusted: false)
            let pinned = store.supportedPins().first(where: { $0.state == pin.state && $0.sha256 == pin.sha256 && $0.bytes == pin.bytes && $0.tilesSha256 == pin.tilesSha256 && $0.installedBytes == pin.installedBytes })
            if trusted { accepted.append(pin) }
            else if let pinned, !trust.hasAcceptedUpdate(pin.state) { accepted.append(pinned) }
            var value: [String: Any] = ["state": manifest.state, "name": manifest.name, "sha256": manifest.sha256,
              "bytes": manifest.bytes, "installedBytes": manifest.installedBytes, "generatedAt": manifest.generatedAt,
              "revision": manifest.revision, "requiresTrust": !trusted && (pinned == nil || trust.hasAcceptedUpdate(pin.state))]
            value["signed"] = true
            values.append(value)
          } catch { blocked += 1 }
        }
        signingPublicKey = publicKey
        offered = accepted
        let result: [String: Any] = ["packages": values, "unsupportedCount": 0, "blockedCount": blocked,
          "signerFingerprint": id, "signerTrusted": trusted, "canTrustSigner": expectedFingerprint == id]
        return String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!
      }
      guard expectedFingerprint.isEmpty,
        catalog["schemaVersion"] as? Int == 1, let packages = catalog["packages"] as? [[String: Any]],
        packages.count <= 50 else { throw failure("The laptop's state list is not supported.") }
      var seen = Set<String>()
      var accepted: [OpenOutdoorStatePackages.Pin] = []
      for entry in packages {
        guard let state = entry["state"] as? String, state.range(of: "^[A-Z]{2}$", options: .regularExpression) != nil,
          seen.insert(state).inserted else { throw failure("The laptop's state list contains invalid or duplicate states.") }
        if let pin = store.supportedPins().first(where: { $0.state == state && $0.sha256 == entry["sha256"] as? String && $0.bytes == (entry["bytes"] as? NSNumber)?.int64Value }) {
          accepted.append(pin)
        }
      }
      offered = accepted
      let values = try JSONSerialization.jsonObject(with: JSONEncoder().encode(accepted))
      let result: [String: Any] = ["packages": values, "unsupportedCount": packages.count - accepted.count]
      signingPublicKey = ""
      return String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!
  }
}
