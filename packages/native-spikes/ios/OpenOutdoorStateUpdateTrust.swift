import CryptoKit
import Foundation
import Security

internal protocol OpenOutdoorUpdateTrustPersistence {
  func read() throws -> Data?
  func write(_ data: Data) throws
}

/// The independently enrolled public keys and replay floors survive package removal/rollback.
/// Keychain data is device-only, not synchronized or included in ordinary app-container backups.
internal final class OpenOutdoorUpdateTrustKeychain: OpenOutdoorUpdateTrustPersistence {
  private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "org.openoutdoor.state-updates", kSecAttrAccount as String: "paired-laptop-v1"] }
  func read() throws -> Data? {
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else { throw OpenOutdoorStateUpdateTrust.failure("Update trust is unavailable. Unlock the phone and retry.") }
    return data
  }
  func write(_ data: Data) throws {
    let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
      var request = query
      request[kSecValueData as String] = data
      request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      request[kSecAttrSynchronizable as String] = false
      guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else { throw OpenOutdoorStateUpdateTrust.failure("Could not save update trust. Existing maps are kept.") }
    } else if status != errSecSuccess { throw OpenOutdoorStateUpdateTrust.failure("Could not save update trust. Existing maps are kept.") }
  }
}

internal final class OpenOutdoorStateUpdateTrust {
  struct Envelope: Codable {
    let schemaVersion: Int
    let algorithm: String
    let channel: String
    let trustRoot: String
    let keyId: String
    let antiReplayVersion: Int64
    let manifestSha256: String
    let signedAt: String
    let signature: String
  }
  struct Ticket: Codable { let manifestBase64: String; let envelope: Envelope }
  struct Manifest: Codable {
    let schemaVersion: Int
    let channel: String
    let classification: String
    let state: String
    let name: String
    let sha256: String
    let bytes: Int64
    let installedBytes: Int64
    let tilesBytes: Int64
    let tilesSha256: String
    let generatedAt: String
    let packageSchema: Int
    let minAppMajor: Int
    let maxAppMajor: Int
    let revision: Int64
  }
  private struct Key: Codable { let publicKey: String; var active: Bool }
  private struct Floor: Codable { let revision: Int64; let digest: String; let generatedAt: String }
  private struct Registry: Codable {
    var schemaVersion = 1
    var keys: [String: Key] = [:]
    var floors: [String: Floor] = [:]
  }
  private let persistence: OpenOutdoorUpdateTrustPersistence
  private var registry: Registry
  init(persistence: OpenOutdoorUpdateTrustPersistence = OpenOutdoorUpdateTrustKeychain()) throws {
    self.persistence = persistence
    if let data = try persistence.read() {
      guard data.count <= 64 * 1024 else { throw Self.failure("Update trust registry is invalid.") }
      registry = try JSONDecoder().decode(Registry.self, from: data)
      guard registry.schemaVersion == 1, registry.keys.count <= 8, registry.floors.count <= 50,
        registry.keys.allSatisfy({ (try? Self.fingerprint($0.value.publicKey)) == $0.key }),
        registry.floors.allSatisfy({ Self.matches($0.key, "^[A-Z]{2}$") && $0.value.revision > 0 && Self.matches($0.value.digest, "^[a-f0-9]{64}$") && Self.date($0.value.generatedAt) != nil }) else {
        throw Self.failure("Update trust registry is invalid.")
      }
    } else { registry = Registry() }
  }
  static func failure(_ message: String) -> NSError {
    NSError(domain: "OpenOutdoorStateUpdate", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private static func matches(_ value: String, _ pattern: String) -> Bool { value.range(of: pattern, options: .regularExpression) != nil }
  static func date(_ value: String) -> Date? {
    guard matches(value, "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,3})?Z$") else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = value.contains(".") ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
    guard let date = formatter.date(from: value), formatter.string(from: date).prefix(19) == value.prefix(19) else { return nil }
    return date
  }
  static func fingerprint(_ publicKey: String) throws -> String {
    guard let raw = Data(base64Encoded: publicKey), raw.count == 32, raw.base64EncodedString() == publicKey else { throw failure("Laptop signing key is invalid.") }
    return SHA256.hash(data: raw).map { String(format: "%02x", $0) }.joined()
  }
  func isTrusted(_ publicKey: String) -> Bool {
    guard let id = try? Self.fingerprint(publicKey) else { return false }
    return registry.keys[id]?.active == true && registry.keys[id]?.publicKey == publicKey
  }
  func hasAcceptedUpdate(_ state: String) -> Bool { registry.floors[state] != nil }
  func trustedFingerprints() -> [String] { registry.keys.filter { $0.value.active }.map { $0.key }.sorted() }
  private func save(_ next: Registry) throws {
    try persistence.write(JSONEncoder().encode(next))
    registry = next // Never mutate in-memory authorization before durable persistence succeeds.
  }
  func approve(_ publicKey: String, expectedFingerprint: String) throws {
    let id = try Self.fingerprint(publicKey)
    guard id == expectedFingerprint else { throw Self.failure("The laptop key does not match its pairing page. Scan the current QR code.") }
    guard registry.keys[id] != nil || registry.keys.count < 8 else { throw Self.failure("The trusted laptop limit is reached.") }
    var next = registry
    next.keys[id] = Key(publicKey: publicKey, active: true)
    try save(next)
  }
  func revoke(_ keyId: String) throws {
    guard registry.keys[keyId] != nil else { return }
    var next = registry
    next.keys[keyId]?.active = false
    try save(next)
  }
  func inspect(_ ticket: Ticket, publicKey: String, requireTrusted: Bool = true, checkReplay: Bool = true) throws -> Manifest {
    let envelope = ticket.envelope
    let id = try Self.fingerprint(publicKey)
    guard (!requireTrusted || isTrusted(publicKey)), envelope.schemaVersion == 1,
      envelope.algorithm == "Ed25519", envelope.channel == "public", envelope.trustRoot == "paired-laptop-v1",
      envelope.keyId == id, envelope.antiReplayVersion > 0, envelope.antiReplayVersion <= 9007199254740991,
      Self.date(envelope.signedAt) != nil,
      let bytes = Data(base64Encoded: ticket.manifestBase64), bytes.count <= 4096,
      bytes.base64EncodedString() == ticket.manifestBase64,
      SHA256.hash(data: bytes).map({ String(format: "%02x", $0) }).joined() == envelope.manifestSha256,
      let signature = Data(base64Encoded: envelope.signature), signature.count == 64,
      signature.base64EncodedString() == envelope.signature,
      let rawKey = Data(base64Encoded: publicKey) else { throw Self.failure("State update signature or laptop trust is invalid.") }
    let payload: [Any] = ["open-outdoor-catalog-signature-v1", envelope.schemaVersion, envelope.algorithm,
      envelope.channel, envelope.trustRoot, envelope.keyId, envelope.antiReplayVersion, envelope.manifestSha256, envelope.signedAt]
    let message = try JSONSerialization.data(withJSONObject: payload, options: [.withoutEscapingSlashes])
    guard try Curve25519.Signing.PublicKey(rawRepresentation: rawKey).isValidSignature(signature, for: message) else { throw Self.failure("State update signature is invalid.") }
    let manifest = try JSONDecoder().decode(Manifest.self, from: bytes)
    guard manifest.schemaVersion == 1, manifest.channel == "public", manifest.classification == "SOURCE_REDISTRIBUTABLE",
      Self.matches(manifest.state, "^[A-Z]{2}$"), manifest.name.utf8.count <= 80, !manifest.name.isEmpty,
      manifest.name.rangeOfCharacter(from: .controlCharacters) == nil,
      Self.matches(manifest.sha256, "^[a-f0-9]{64}$"), Self.matches(manifest.tilesSha256, "^[a-f0-9]{64}$"),
      manifest.bytes > 0, manifest.bytes <= 3 * 1024 * 1024 * 1024, manifest.tilesBytes > 127,
      manifest.tilesBytes <= 3 * 1024 * 1024 * 1024,
      manifest.installedBytes == manifest.bytes + manifest.tilesBytes, manifest.installedBytes <= 3 * 1024 * 1024 * 1024,
      manifest.packageSchema == 1, manifest.minAppMajor > 0, manifest.minAppMajor <= 1, manifest.maxAppMajor >= 1,
      manifest.revision == envelope.antiReplayVersion, Self.date(manifest.generatedAt) != nil else {
      throw Self.failure("State update is incompatible or its public package manifest is invalid.")
    }
    if checkReplay, let floor = registry.floors[manifest.state] {
      guard manifest.revision >= floor.revision,
        manifest.revision != floor.revision || envelope.manifestSha256 == floor.digest,
        Self.date(manifest.generatedAt)! >= Self.date(floor.generatedAt)! else {
        throw Self.failure("An older or conflicting state update was rejected. Use explicit rollback for the previous installed version.")
      }
    }
    return manifest
  }
  func verify(_ ticket: Ticket, installed: Bool = false) throws -> Manifest {
    guard let key = registry.keys[ticket.envelope.keyId], installed || key.active else { throw Self.failure("The state update laptop is not trusted.") }
    return try inspect(ticket, publicKey: key.publicKey, requireTrusted: !installed, checkReplay: !installed)
  }
  func accept(_ ticket: Ticket) throws {
    let manifest = try verify(ticket)
    var next = registry
    next.floors[manifest.state] = Floor(revision: manifest.revision, digest: ticket.envelope.manifestSha256, generatedAt: manifest.generatedAt)
    try save(next)
  }
}
