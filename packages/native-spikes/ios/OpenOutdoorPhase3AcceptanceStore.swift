#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
import Foundation
import UIKit

private struct OpenOutdoorPhase3Environment: Codable {
  let sourceCommit: String
  let deviceModelIdentifier: String
  let systemVersion: String
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

  func environmentJSON() throws -> String {
    let environment = OpenOutdoorPhase3Environment(
      sourceCommit: Bundle.main.object(forInfoDictionaryKey: "OpenOutdoorSourceCommit") as? String
        ?? "unknown",
      deviceModelIdentifier: modelIdentifier(),
      systemVersion: UIDevice.current.systemVersion
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
