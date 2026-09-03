#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
import CryptoKit
import Darwin
import Foundation
import UIKit

private struct OpenOutdoorPhase3Environment: Codable {
  let sourceCommit: String
  let deviceModelIdentifier: String
  let systemVersion: String
  let binarySha256: String
  let residentMemoryMiB: Double
  let encryptedBackupRoundTripPassed: Bool
  let wrongSecretRejected: Bool
}

internal final class OpenOutdoorPhase3AcceptanceStore {
  private let stateURL: URL

  init() throws {
    let applicationSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = applicationSupport.appendingPathComponent(
      "Diagnostics/Phase3Acceptance",
      isDirectory: true
    )
    try OpenOutdoorFilePolicy.prepareDirectory(directory, protection: .complete)
    stateURL = directory.appendingPathComponent("guided-state.json")
  }

  private func modelIdentifier() -> String {
    var systemInfo = utsname()
    uname(&systemInfo)
    return withUnsafeBytes(of: &systemInfo.machine) { rawBuffer in
      guard let baseAddress = rawBuffer.bindMemory(to: CChar.self).baseAddress else {
        return "unknown"
      }
      return String(cString: baseAddress)
    }
  }

  private func executableSHA256() throws -> String {
    guard let url = Bundle.main.executableURL else {
      throw NSError(
        domain: "OpenOutdoorPhase3Acceptance",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "The installed executable is unavailable"]
      )
    }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var digest = SHA256()
    while true {
      let data = try handle.read(upToCount: 1_048_576) ?? Data()
      if data.isEmpty { break }
      digest.update(data: data)
    }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private func residentMemoryMiB() throws -> Double {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), rebound, &count)
      }
    }
    guard result == KERN_SUCCESS else {
      throw NSError(domain: "OpenOutdoorPhase3Acceptance", code: 6)
    }
    return Double(info.resident_size) / 1_048_576
  }

  private func encryptedRoundTrip() throws -> (restored: Bool, wrongSecretRejected: Bool) {
    let payload = Data("phase3-coordinate-free-backup".utf8)
    let key = SymmetricKey(data: SHA256.hash(data: Data("phase3-automatic-secret".utf8)))
    let wrongKey = SymmetricKey(data: SHA256.hash(data: Data("phase3-wrong-secret".utf8)))
    guard let sealed = try AES.GCM.seal(payload, using: key).combined else {
      return (false, false)
    }
    let url = stateURL.deletingLastPathComponent()
      .appendingPathComponent("automatic-backup-roundtrip.bin")
    defer { try? FileManager.default.removeItem(at: url) }
    try sealed.write(to: url, options: [.atomic, .completeFileProtection])
    try OpenOutdoorFilePolicy.apply(url, protection: .complete)
    let values = try url.resourceValues(forKeys: [.fileProtectionKey, .isExcludedFromBackupKey])
    let box = try AES.GCM.SealedBox(combined: Data(contentsOf: url))
    let restored =
      try AES.GCM.open(box, using: key) == payload
      && values.fileProtection == .complete
      && values.isExcludedFromBackup == true
    let wrongSecretRejected: Bool
    do {
      _ = try AES.GCM.open(box, using: wrongKey)
      wrongSecretRejected = false
    } catch {
      wrongSecretRejected = true
    }
    return (restored, wrongSecretRejected)
  }

  func environmentJSON() throws -> String {
    let backup = try encryptedRoundTrip()
    let environment = OpenOutdoorPhase3Environment(
      sourceCommit: Bundle.main.object(forInfoDictionaryKey: "OpenOutdoorSourceCommit") as? String
        ?? "unknown",
      deviceModelIdentifier: modelIdentifier(),
      systemVersion: UIDevice.current.systemVersion,
      binarySha256: try executableSHA256(),
      residentMemoryMiB: try residentMemoryMiB(),
      encryptedBackupRoundTripPassed: backup.restored,
      wrongSecretRejected: backup.wrongSecretRejected
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(environment), as: UTF8.self)
  }

  func loadState() throws -> String? {
    guard FileManager.default.fileExists(atPath: stateURL.path) else { return nil }
    return String(decoding: try Data(contentsOf: stateURL), as: UTF8.self)
  }

  func saveState(_ stateJSON: String) throws -> String {
    guard let bytes = stateJSON.data(using: .utf8), bytes.count <= 1_000_000 else {
      throw NSError(
        domain: "OpenOutdoorPhase3Acceptance",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Phase 3 state is empty or too large"]
      )
    }
    guard
      let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      root["schemaVersion"] as? Int == 1
    else {
      throw NSError(
        domain: "OpenOutdoorPhase3Acceptance",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Phase 3 state is not a supported JSON object"]
      )
    }
    try bytes.write(to: stateURL, options: [.atomic, .completeFileProtection])
    try OpenOutdoorFilePolicy.apply(stateURL, protection: .complete)
    return stateJSON
  }

  func reset() throws {
    if FileManager.default.fileExists(atPath: stateURL.path) {
      try FileManager.default.removeItem(at: stateURL)
    }
  }

  func shareReport(_ reportJSON: String) throws -> String {
    guard
      let bytes = reportJSON.data(using: .utf8),
      let root = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      root["schemaVersion"] as? Int == 1,
      root["profileId"] as? String == "iphone14-ios26.6-phase3-v1"
    else {
      throw NSError(
        domain: "OpenOutdoorPhase3Acceptance",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Phase 3 report is invalid"]
      )
    }
    let exportDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "Phase3AcceptanceExport",
      isDirectory: true
    )
    try OpenOutdoorFilePolicy.prepareDirectory(exportDirectory, protection: .complete)
    let reportURL = exportDirectory.appendingPathComponent("phase3-physical-report.json")
    try bytes.write(to: reportURL, options: [.atomic, .completeFileProtection])
    try OpenOutdoorFilePolicy.apply(reportURL, protection: .complete)

    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
      let rootController = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      throw NSError(
        domain: "OpenOutdoorPhase3Acceptance",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "No active window is available to share the report"]
      )
    }
    var presenter = rootController
    while let presented = presenter.presentedViewController { presenter = presented }
    presenter.present(
      UIActivityViewController(activityItems: [reportURL], applicationActivities: nil),
      animated: true
    )
    return reportURL.path
  }
}
#endif
