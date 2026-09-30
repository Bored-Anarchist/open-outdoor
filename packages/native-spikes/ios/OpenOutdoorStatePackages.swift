import CryptoKit
import ExpoModulesCore
import Foundation
import SQLite3
import UIKit
import UniformTypeIdentifiers

/// Build-pinned or independently laptop-authorized public catalogs. Never writes user data.
internal final class OpenOutdoorStatePackages {
  struct Pin: Codable {
    let state: String
    let name: String
    let sha256: String
    let bytes: Int64
    let installedBytes: Int64
    let tilesBytes: Int64
    let tilesSha256: String
    var update: OpenOutdoorStateUpdateTrust.Ticket? = nil
  }
  struct Entry: Codable {
    var current: Pin
    var previous: Pin?
    var visible: Bool
    var quarantined: Bool?
  }
  private var allowed: [Pin] = []
  private var updateTrust: OpenOutdoorStateUpdateTrust?
  var laptopUpdatesEnabled: Bool { Bundle.main.bundleIdentifier == "org.openoutdoor.local" }
  func approveUpdateSigner(_ publicKey: String, fingerprint: String) throws {
    guard laptopUpdatesEnabled else { throw failure("Laptop-owned update trust is available in the local app build. Production catalog trust uses its separately provisioned release keyring.") }
    try trust().approve(publicKey, expectedFingerprint: fingerprint)
  }
  func trust() throws -> OpenOutdoorStateUpdateTrust {
    if let updateTrust { return updateTrust }
    let next = try OpenOutdoorStateUpdateTrust()
    updateTrust = next
    return next
  }
  func updatePin(_ ticket: OpenOutdoorStateUpdateTrust.Ticket, publicKey: String, requireTrusted: Bool) throws -> Pin {
    guard laptopUpdatesEnabled else { throw failure("This app build does not accept laptop-owned update signatures.") }
    let manifest = try trust().inspect(ticket, publicKey: publicKey, requireTrusted: requireTrusted)
    guard allowed.contains(where: { $0.state == manifest.state }) else { throw failure("This app does not support that state.") }
    var pin = try JSONDecoder().decode(Pin.self, from: JSONEncoder().encode(manifest))
    pin.update = ticket
    return pin
  }
  private func verifyUpdate(_ pin: Pin, installed: Bool = false) throws {
    guard let ticket = pin.update else { return }
    guard installed || laptopUpdatesEnabled else { throw failure("This app build does not accept laptop-owned update signatures.") }
    let manifest = try trust().verify(ticket, installed: installed)
    guard manifest.state == pin.state, manifest.sha256 == pin.sha256, manifest.bytes == pin.bytes,
      manifest.installedBytes == pin.installedBytes, manifest.tilesBytes == pin.tilesBytes,
      manifest.tilesSha256 == pin.tilesSha256, manifest.name == pin.name else { throw failure("State update identity does not match its signature.") }
  }
  private var registryRecovered = false
  private let manager = FileManager.default
  private let baselineReserve: Int64 = 1024 * 1024 * 1024
  private let ceiling: Int64 = 3 * 1024 * 1024 * 1024
  private let reserve: Int64 = 2 * 1024 * 1024 * 1024
  private let registryLimit = 1024 * 1024 // Up to fifty current/previous signed proofs; still bounded.

  private func failure(_ message: String) -> NSError {
    NSError(domain: "OpenOutdoorStatePackage", code: 1,
      userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func root() throws -> URL {
    let support = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask,
      appropriateFor: nil, create: true)
    let url = support.appendingPathComponent("PublicStatePackages", isDirectory: true)
    try OpenOutdoorFilePolicy.prepareDirectory(url, protection: .completeUntilFirstUserAuthentication)
    return url
  }
  private func file(_ pin: Pin, _ suffix: String) throws -> URL {
    guard pin.state.range(of: "^[A-Z]{2}$", options: .regularExpression) != nil,
      pin.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
      throw failure("Invalid state package identity.")
    }
    return try root().appendingPathComponent("\(pin.state)-\(pin.sha256).\(suffix)")
  }
  private func decodeEntries(_ data: Data) throws -> [Entry] {
    guard data.count <= registryLimit else { throw failure("State package registry is invalid.") }
    let decoded = try JSONDecoder().decode([Entry].self, from: data)
    guard decoded.count <= 50 else { throw failure("State package registry is invalid.") }
    return decoded
  }
  private func entries() throws -> [Entry] {
    let url = try root().appendingPathComponent("active.json")
    let backup = try root().appendingPathComponent("active.previous.json")
    guard manager.fileExists(atPath: url.path) || manager.fileExists(atPath: backup.path) else { return [] }
    do {
      return try decodeEntries(Data(contentsOf: url))
    } catch {
      let restored = try decodeEntries(Data(contentsOf: backup))
      registryRecovered = true
      return restored
    }
  }
  private func save(_ entries: [Entry]) throws {
    let payload = try JSONEncoder().encode(entries)
    _ = try decodeEntries(payload) // Reject an oversized registry before changing either pointer.
    let url = try root().appendingPathComponent("active.json")
    if let old = try? Data(contentsOf: url), (try? decodeEntries(old)) != nil {
      let backup = try root().appendingPathComponent("active.previous.json")
      try old.write(to: backup, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      try OpenOutdoorFilePolicy.apply(backup, protection: .completeUntilFirstUserAuthentication)
    }
    try payload.write(to: url,
      options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    try OpenOutdoorFilePolicy.apply(url, protection: .completeUntilFirstUserAuthentication)
    let backup = try root().appendingPathComponent("active.previous.json")
    if !manager.fileExists(atPath: backup.path) {
      try payload.write(to: backup, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      try OpenOutdoorFilePolicy.apply(backup, protection: .completeUntilFirstUserAuthentication)
    }
    registryRecovered = false
  }
  private func hash(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    while let data = try handle.read(upToCount: 1024 * 1024), !data.isEmpty {
      hasher.update(data: data)
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }
  private func open(_ url: URL) throws -> OpaquePointer {
    var db: OpaquePointer?
    guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK,
      let db else { if let db { sqlite3_close(db) }; throw failure("Cannot open state catalog.") }
    sqlite3_limit(db, SQLITE_LIMIT_LENGTH, 1024 * 1024 * 1024)
    sqlite3_limit(db, SQLITE_LIMIT_SQL_LENGTH, 4096)
    sqlite3_exec(db, "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-4096", nil, nil, nil)
    return db
  }
  private func rows(_ db: OpaquePointer, _ sql: String, _ values: [String] = []) throws -> [[String]] {
    var prepared: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &prepared, nil) == SQLITE_OK, let prepared else {
      throw failure("State catalog query failed: \(String(cString: sqlite3_errmsg(db)))")
    }
    defer { sqlite3_finalize(prepared) }
    let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    for (i, value) in values.enumerated() {
      guard sqlite3_bind_text(prepared, Int32(i + 1), value, -1, transient) == SQLITE_OK else {
        throw failure("State query binding failed.")
      }
    }
    var result: [[String]] = []
    while true {
      let status = sqlite3_step(prepared)
      if status == SQLITE_DONE { return result }
      guard status == SQLITE_ROW else { throw failure("State catalog query did not complete.") }
      result.append((0..<sqlite3_column_count(prepared)).map { column in
        sqlite3_column_text(prepared, column).map { String(cString: $0) } ?? ""
      })
    }
  }
  private func metadata(_ pin: Pin) throws -> [String: Any] {
    let db = try open(file(pin, "sqlite"))
    defer { sqlite3_close(db) }
    guard let value = try rows(db, "SELECT value FROM metadata WHERE key='manifest' AND length(value)<=1048576 LIMIT 1").first?.first,
      let object = try JSONSerialization.jsonObject(with: Data(value.utf8)) as? [String: Any],
      object["channel"] as? String == "public", object["schemaVersion"] as? Int == 1,
      object["state"] as? String == pin.state,
      object["classification"] as? String == "SOURCE_REDISTRIBUTABLE",
      object["tilesSha256"] as? String == pin.tilesSha256 else {
      throw failure("State catalog compatibility or classification failed.")
    }
    if let ticket = pin.update {
      let manifest = try trust().verify(ticket, installed: true)
      guard object["generatedAt"] as? String == manifest.generatedAt, object["name"] as? String == manifest.name else { throw failure("State update name or packaging date does not match its signature.") }
    }
    return object
  }
  private func valid(_ pin: Pin) -> Bool {
    do {
      try verifyUpdate(pin, installed: true)
      guard pin.bytes > 0, pin.bytes <= ceiling, pin.tilesBytes > 127, pin.tilesBytes <= ceiling, pin.installedBytes == pin.bytes + pin.tilesBytes,
        pin.installedBytes <= ceiling else { return false }
      guard try hash(file(pin, "sqlite")) == pin.sha256,
        try hash(file(pin, "pmtiles")) == pin.tilesSha256 else { return false }
      return try metadata(pin)["state"] as? String == pin.state
    } catch { return false }
  }
  private func pruneUnreferenced(_ active: [Entry]) throws {
    let pins: [Pin] = active.flatMap { entry in [entry.current, entry.previous].compactMap { $0 } }
    let retained: Set<String> = Set(pins.flatMap { pin in
      ["\(pin.state)-\(pin.sha256).sqlite", "\(pin.state)-\(pin.sha256).pmtiles"]
    })
    for url in try manager.contentsOfDirectory(at: root(), includingPropertiesForKeys: [.isRegularFileKey]) {
      let name = url.lastPathComponent
      if name.range(of: "^[A-Z]{2}-[a-f0-9]{64}\\.(sqlite|pmtiles)(\\.staging)?$",
        options: .regularExpression) != nil && !retained.contains(name),
        try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
        try? manager.removeItem(at: url)
      }
    }
  }
  private func extractTiles(_ pin: Pin) throws {
    let db = try open(file(pin, "sqlite"))
    defer { sqlite3_close(db) }
    guard try rows(db, "PRAGMA application_id").first?.first == "1330590548",
      try rows(db, "PRAGMA user_version").first?.first == "1",
      try rows(db, "PRAGMA quick_check").first?.first == "ok" else {
      throw failure("State catalog integrity check failed.")
    }
    _ = try metadata(pin)
    var blob: OpaquePointer?
    guard sqlite3_blob_open(db, "main", "assets", "data", 1, 0, &blob) == SQLITE_OK, let blob else {
      throw failure("State map tiles are missing.")
    }
    defer { sqlite3_blob_close(blob) }
    let count = sqlite3_blob_bytes(blob)
    guard Int64(count) == pin.tilesBytes else { throw failure("State map size mismatch.") }
    let target = try file(pin, "pmtiles")
    let temp = target.appendingPathExtension("staging")
    manager.createFile(atPath: temp.path, contents: nil,
      attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
    let handle = try FileHandle(forWritingTo: temp)
    var succeeded = false
    defer { try? handle.close(); if !succeeded { try? manager.removeItem(at: temp) } }
    var offset: Int32 = 0
    while offset < count {
      var bytes = [UInt8](repeating: 0, count: Int(min(1024 * 1024, count - offset)))
      let length = Int32(bytes.count)
      let status = bytes.withUnsafeMutableBytes {
        sqlite3_blob_read(blob, $0.baseAddress, length, offset)
      }
      guard status == SQLITE_OK else { throw failure("Cannot extract local map tiles.") }
      try handle.write(contentsOf: Data(bytes))
      offset += Int32(bytes.count)
    }
    try handle.synchronize()
    try handle.close()
    guard try hash(temp) == pin.tilesSha256 else { throw failure("Map tile checksum mismatch.") }
    if manager.fileExists(atPath: target.path) { try manager.removeItem(at: target) }
    try manager.moveItem(at: temp, to: target)
    try OpenOutdoorFilePolicy.apply(target, protection: .completeUntilFirstUserAuthentication)
    succeeded = true
  }
  func load(_ registryJSON: String) throws -> String {
    guard registryJSON.utf8.count < 256 * 1024 else { throw failure("Package allowlist is invalid.") }
    allowed = try JSONDecoder().decode([Pin].self, from: Data(registryJSON.utf8))
    var active = try entries()
    var recovered = registryRecovered
    for i in active.indices {
      if let previous = active[i].previous, !valid(previous) {
        active[i].previous = nil
        recovered = true
      }
      if !valid(active[i].current) {
        if let previous = active[i].previous, valid(previous) {
          active[i].current = previous
          active[i].previous = nil
          active[i].quarantined = false
        } else {
          active[i].visible = false
          active[i].quarantined = true
        }
        recovered = true
      }
    }
    if recovered { try save(active) }
    let payload = try list()
    try pruneUnreferenced(active)
    return payload
  }
  func list() throws -> String {
    let result = try entries().map { entry -> [String: Any] in
      if entry.quarantined == true {
        return ["schemaVersion": 1, "channel": "public", "state": entry.current.state,
          "name": entry.current.name, "sha256": entry.current.sha256, "featureCount": 0,
          "installedBytes": entry.current.installedBytes, "generatedAt": "", "maximumZoom": 10,
          "bounds": [-180, -85, 180, 85], "visible": false, "canRollback": false,
          "tilesUri": "", "attribution": "", "notices": "Integrity check failed. Reinstall or remove this state. Your notes and recordings are kept.",
          "integrityError": true]
      }
      var value = try metadata(entry.current)
      value["sha256"] = entry.current.sha256
      value["installedBytes"] = entry.current.installedBytes
      value["visible"] = entry.visible
      value["canRollback"] = entry.previous != nil
      if let ticket = entry.current.update { value["revision"] = ticket.envelope.antiReplayVersion }
      value["tilesUri"] = try file(entry.current, "pmtiles").absoluteString
      return value
    }
    return String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!
  }
  func supportedPins() -> [Pin] { allowed }
  func preflight(_ pin: Pin, download: Bool = false) throws {
    guard pin.update != nil || allowed.contains(where: { $0.state == pin.state && $0.sha256 == pin.sha256 && $0.bytes == pin.bytes }) else {
      throw failure("This state requires a newer supported app build.")
    }
    let active = try entries()
    if let ticket = pin.update {
      try verifyUpdate(pin)
      let manifest = try trust().verify(ticket)
      if let current = active.first(where: { $0.current.state == pin.state }), current.quarantined != true,
        let currentDate = try metadata(current.current)["generatedAt"] as? String,
        let previousDate = OpenOutdoorStateUpdateTrust.date(currentDate),
        let incomingDate = OpenOutdoorStateUpdateTrust.date(manifest.generatedAt) {
        guard incomingDate >= previousDate else { throw failure("An older state snapshot was rejected. Use explicit rollback instead.") }
      }
    } else if try trust().hasAcceptedUpdate(pin.state) {
      throw failure("Use a signed state update or explicit rollback instead of installing an older build-pinned file.")
    }
    let current = active.reduce(baselineReserve) { $0 + $1.current.installedBytes }
    let replaced = active.first(where: { $0.current.state == pin.state })
    let incomingCombined = current - (replaced?.current.installedBytes ?? 0) + pin.installedBytes
    guard incomingCombined <= ceiling else {
      throw failure("Installed reference catalogs exceed 3 GiB. Remove a state package first.")
    }
    let rollback = active.reduce(Int64(0)) { $0 + ($1.previous?.installedBytes ?? 0) }
    let required = current + rollback + incomingCombined + max(baselineReserve, incomingCombined / 4) + reserve + (download ? pin.bytes : 0)
    let free = (try manager.attributesOfFileSystem(forPath: root().path)[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
    guard free >= required else { throw failure("Not enough free space for this state, rollback and reserve. Remove a state package or free storage first.") }
  }
  func install(_ source: URL, authorizedPin: Pin? = nil) throws -> String {
    let size = try source.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard size.isRegularFile == true, let bytes = size.fileSize, bytes > 0, Int64(bytes) <= ceiling else {
      throw failure("Select a valid state SQLite package within the 3 GiB reference budget.")
    }
    let checksum = try hash(source)
    guard let pin = authorizedPin ?? allowed.first(where: { $0.sha256 == checksum && $0.bytes == Int64(bytes) }),
      pin.sha256 == checksum, pin.bytes == Int64(bytes),
      pin.installedBytes == pin.bytes + pin.tilesBytes, pin.tilesBytes > 127 else {
      throw failure("This file does not match a state package supported by this app build.")
    }
    var active = try entries()
    if active.contains(where: { $0.current.sha256 == pin.sha256 && $0.quarantined != true }) && valid(pin) { return try list() }
    let replaced = active.first(where: { $0.current.state == pin.state })
    try preflight(pin)
    let target = try file(pin, "sqlite")
    var activated = false
    defer {
      if !activated, let latest = try? entries(), !latest.contains(where: { $0.current.sha256 == pin.sha256 || $0.previous?.sha256 == pin.sha256 }) {
        try? manager.removeItem(at: target)
        if let tiles = try? file(pin, "pmtiles") { try? manager.removeItem(at: tiles) }
      }
    }
    let temporary = target.appendingPathExtension("staging")
    if manager.fileExists(atPath: temporary.path) { try manager.removeItem(at: temporary) }
    try manager.copyItem(at: source, to: temporary)
    defer { try? manager.removeItem(at: temporary) }
    guard try hash(temporary) == pin.sha256 else { throw failure("Copied state checksum mismatch.") }
    if manager.fileExists(atPath: target.path) { try manager.removeItem(at: target) }
    try manager.moveItem(at: temporary, to: target)
    try OpenOutdoorFilePolicy.apply(target, protection: .completeUntilFirstUserAuthentication)
    try extractTiles(pin)
    guard valid(pin) else { throw failure("State activation verification failed.") }
    if let ticket = pin.update { try trust().accept(ticket) }
    let prior = replaced?.current.sha256 == pin.sha256 ? replaced?.previous : replaced?.current
    let next = Entry(current: pin, previous: prior.flatMap { valid($0) ? $0 : nil },
      visible: replaced?.quarantined == true ? true : replaced?.visible ?? true, quarantined: false)
    active.removeAll { $0.current.state == pin.state }
    active.append(next)
    try save(active) // Atomic publication after every validation and extraction succeeds.
    activated = true
    let payload = try list()
    try pruneUnreferenced(active)
    return payload
  }
  func change(_ state: String, _ action: String) throws -> String {
    var active = try entries()
    guard let index = active.firstIndex(where: { $0.current.state == state }) else {
      throw failure("State package is not installed.")
    }
    if action == "remove" {
      let entry = active.remove(at: index)
      try save(active)
      for pin in [entry.current, entry.previous].compactMap({ $0 }) {
        for ext in ["sqlite", "pmtiles"] { try? manager.removeItem(at: file(pin, ext)) }
      }
    } else if action == "rollback" {
      guard let previous = active[index].previous, valid(previous) else {
        throw failure("No verified previous version is available.")
      }
      let current = active[index].current
      active[index].current = previous
      active[index].previous = current
      active[index].quarantined = false
      try save(active)
    } else if action == "visibility" {
      guard active[index].quarantined != true else { throw failure("Reinstall this state before showing it.") }
      active[index].visible.toggle()
      try save(active)
    } else { throw failure("Unsupported state package action.") }
    return try list()
  }
  func search(_ query: String) throws -> String {
    let tokens = query.prefix(200).split(whereSeparator: { !$0.isLetter && !$0.isNumber })
    guard !tokens.isEmpty else { return "[]" }
    let expression = tokens.prefix(8).map { "\"\($0)\"*" }.joined(separator: " AND ")
    var found: [[String: Any]] = []
    var ids = Set<String>()
    var payloadBytes = 0
    for entry in try entries().filter({ $0.visible && $0.quarantined != true }) {
      let db = try open(file(entry.current, "sqlite"))
      defer { sqlite3_close(db) }
      for row in try rows(db, "SELECT f.summary FROM search JOIN features f ON f.ordinal=search.rowid WHERE search MATCH ? ORDER BY rank LIMIT 30", [expression]) {
        payloadBytes += row[0].utf8.count
        if payloadBytes > 2 * 1024 * 1024 { break }
        if let value = try JSONSerialization.jsonObject(with: Data(row[0].utf8)) as? [String: Any],
          let id = value["id"] as? String, ids.insert(id).inserted { found.append(value) }
        if found.count == 30 { break }
      }
      if found.count == 30 || payloadBytes > 2 * 1024 * 1024 { break }
    }
    return String(data: try JSONSerialization.data(withJSONObject: found), encoding: .utf8)!
  }
  func detail(_ id: String) throws -> String? {
    guard id.utf8.count <= 512 else { throw failure("Feature identity is too long.") }
    for entry in try entries().filter({ $0.visible && $0.quarantined != true }) {
      let db = try open(file(entry.current, "sqlite"))
      defer { sqlite3_close(db) }
      // Geometry crosses the bridge only for one selection, with a bounded payload.
      if let row = try rows(db, "SELECT summary,CASE WHEN length(geometry)<=2097152 THEN geometry ELSE 'null' END FROM features WHERE id=? AND length(summary)<=1048576 LIMIT 1", [id]).first {
        return "{\"summary\":\(row[0]),\"geometry\":\(row[1]),\"geometryLimited\":\(row[1] == "null" ? "true" : "false")}"
      }
    }
    return nil
  }
}

internal final class OpenOutdoorStatePackagePicker: NSObject, UIDocumentPickerDelegate {
  private var pending: Promise?
  private let store: OpenOutdoorStatePackages
  private let queue: DispatchQueue
  init(store: OpenOutdoorStatePackages, queue: DispatchQueue) { self.store = store; self.queue = queue }
  func pick(_ promise: Promise) {
    guard pending == nil else { promise.reject("STATE_BUSY", "A state picker is already open."); return }
    guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
      .first(where: { $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
      promise.reject("NO_WINDOW", "No active window is available."); return
    }
    var presenter = root
    while let presented = presenter.presentedViewController { presenter = presented }
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: false)
    picker.delegate = self
    picker.allowsMultipleSelection = false
    pending = promise
    presenter.present(picker, animated: true)
  }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pending?.resolve(nil as String?); pending = nil
  }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let promise = pending, let url = urls.first else { return }
    pending = nil
    queue.async {
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      var coordinationError: NSError?
      var installError: Error?
      var result: String?
      NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readable in
        do { result = try self.store.install(readable) } catch { installError = error }
      }
      if let error = coordinationError {
        promise.reject("STATE_INSTALL_FAILED", error.localizedDescription)
      } else if let error = installError {
        promise.reject("STATE_INSTALL_FAILED", error.localizedDescription)
      } else { promise.resolve(result) }
    }
  }
}
