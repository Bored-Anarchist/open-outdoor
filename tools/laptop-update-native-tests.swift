import Foundation

private final class MemoryTrust: OpenOutdoorUpdateTrustPersistence {
  var data: Data?
  var failWrites = false
  func read() throws -> Data? { data }
  func write(_ data: Data) throws {
    if failWrites { throw OpenOutdoorStateUpdateTrust.failure("Synthetic persistence failure") }
    self.data = data
  }
}

@main
private enum UpdateTrustTests {
  private struct Vectors: Decodable {
    let publicKey: String
    let fingerprint: String
    let first: OpenOutdoorStateUpdateTrust.Ticket
    let second: OpenOutdoorStateUpdateTrust.Ticket
    let otherState: OpenOutdoorStateUpdateTrust.Ticket
    let oldDate: OpenOutdoorStateUpdateTrust.Ticket
    let incompatible: OpenOutdoorStateUpdateTrust.Ticket
    let conflicting: OpenOutdoorStateUpdateTrust.Ticket
    let oversized: OpenOutdoorStateUpdateTrust.Ticket
    let privateManifest: OpenOutdoorStateUpdateTrust.Ticket
  }
  private static func rejects(_ label: String, _ action: () throws -> Void) throws {
    do { try action() } catch { return }
    throw OpenOutdoorStateUpdateTrust.failure("Expected rejection: \(label)")
  }
  static func main() throws {
    let vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
    let memory = MemoryTrust()
    let trust = try OpenOutdoorStateUpdateTrust(persistence: memory)
    guard try OpenOutdoorStateUpdateTrust.fingerprint(vectors.publicKey) == vectors.fingerprint else { fatalError("Node/Swift public key digest mismatch") }
    _ = try trust.inspect(vectors.first, publicKey: vectors.publicKey, requireTrusted: false)
    try rejects("unenrolled signing key") { _ = try trust.verify(vectors.first) }
    try rejects("unverified fingerprint") { try trust.approve(vectors.publicKey, expectedFingerprint: String(repeating: "0", count: 64)) }
    memory.failWrites = true
    try rejects("failed trust save") { try trust.approve(vectors.publicKey, expectedFingerprint: vectors.fingerprint) }
    guard !trust.isTrusted(vectors.publicKey) else { fatalError("Failed persistence enrolled a key") }
    memory.failWrites = false
    try trust.approve(vectors.publicKey, expectedFingerprint: vectors.fingerprint)
    try trust.accept(vectors.first)
    try trust.accept(vectors.second)
    try trust.accept(vectors.otherState) // Independent per-state floors, even in the same publication.
    try rejects("older signed revision") { try trust.accept(vectors.first) }
    try rejects("new revision with old package date") { try trust.accept(vectors.oldDate) }
    try rejects("incompatible app interval") { _ = try trust.verify(vectors.incompatible) }
    try rejects("conflicting bytes at the same signed revision") { _ = try trust.verify(vectors.conflicting) }
    try rejects("oversized signed manifest") { _ = try trust.verify(vectors.oversized) }
    try rejects("private signed manifest") { _ = try trust.verify(vectors.privateManifest) }
    _ = try trust.verify(vectors.first, installed: true) // Explicit offline rollback preserves its original authorization.
    try trust.accept(vectors.second) // Exact retry/reinstall after rollback remains legal.
    let reloaded = try OpenOutdoorStateUpdateTrust(persistence: memory)
    try rejects("persistent replay floor") { try reloaded.accept(vectors.first) }
    let before = memory.data
    memory.failWrites = true
    try rejects("failed floor save") { try reloaded.accept(vectors.second) }
    guard memory.data == before else { fatalError("Failure mutated durable trust") }
    memory.failWrites = false
    try reloaded.revoke(vectors.fingerprint)
    try rejects("revoked key") { try reloaded.accept(vectors.second) }
    _ = try reloaded.verify(vectors.first, installed: true) // Revocation keeps last known-good installed maps usable.
    try reloaded.approve(vectors.publicKey, expectedFingerprint: vectors.fingerprint)
    try rejects("reapproval preserves replay history") { try reloaded.accept(vectors.first) }
    let corrupted = OpenOutdoorStateUpdateTrust.Ticket(manifestBase64: Data("{}".utf8).base64EncodedString(), envelope: vectors.second.envelope)
    try rejects("manifest digest tampering") { _ = try reloaded.verify(corrupted) }
    var value = try JSONSerialization.jsonObject(with: JSONEncoder().encode(vectors.second)) as! [String: Any]
    var envelope = value["envelope"] as! [String: Any]
    envelope["signature"] = Data(repeating: 0, count: 64).base64EncodedString()
    value["envelope"] = envelope
    let invalidSignature = try JSONDecoder().decode(OpenOutdoorStateUpdateTrust.Ticket.self, from: JSONSerialization.data(withJSONObject: value))
    try rejects("invalid Ed25519 signature") { _ = try reloaded.verify(invalidSignature) }
    envelope["channel"] = "private"; value["envelope"] = envelope
    let wrongChannel = try JSONDecoder().decode(OpenOutdoorStateUpdateTrust.Ticket.self, from: JSONSerialization.data(withJSONObject: value))
    try rejects("private channel") { _ = try reloaded.verify(wrongChannel) }
    memory.data = Data("{}".utf8)
    try rejects("corrupt keychain registry") { _ = try OpenOutdoorStateUpdateTrust(persistence: memory) }
    print("Native update trust tests passed: Node/Swift signatures, enrollment, persistence, replay, dates, compatibility, revocation and rollback/retry.")
  }
}
