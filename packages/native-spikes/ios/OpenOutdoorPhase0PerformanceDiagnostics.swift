#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
import Darwin
import Foundation
import UIKit

private struct OpenOutdoorAcknowledgementInput: Decodable {
  let mode: String
  let startDurationsMs: [Double]
  let stopDurationsMs: [Double]
}

internal struct OpenOutdoorAcknowledgementReport: Codable {
  let mode: String
  let sampleCount: Int
  let startDurationsMs: [Double]
  let stopDurationsMs: [Double]
  let startP95Ms: Double
  let stopP95Ms: Double
  let startMaxMs: Double
  let stopMaxMs: Double
  let thresholdMs: Double
  let passed: Bool
}

internal struct OpenOutdoorMemoryReport: Codable {
  let elapsedSeconds: Double
  let sampleCount: Int
  let samplesBytes: [UInt64]
  let p95ResidentBytes: UInt64
  let maxResidentBytes: UInt64
  let thresholdBytes: UInt64
  let passed: Bool
}

internal struct OpenOutdoorPhysicalDiagnosticReport: Codable {
  let schemaVersion: Int
  let profileId: String
  let generatedAt: Date
  let deviceClass: String
  let systemName: String
  let systemVersion: String
  let memoryProfileActive: Bool
  let acknowledgement: OpenOutdoorAcknowledgementReport?
  let memory: OpenOutdoorMemoryReport?
  let trackingProtection: OpenOutdoorTrackingPolicyReport?

  func json() throws -> String {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return String(decoding: try encoder.encode(self), as: UTF8.self)
  }
}

internal final class OpenOutdoorPhase0PerformanceDiagnostics {
  private static let profileId = "iphone14-ios26.6-phase0-v1"
  private static let acknowledgementThresholdMs = 500.0
  private static let memoryThresholdBytes: UInt64 = 150 * 1_024 * 1_024
  private static let minimumMemoryDurationSeconds = 30.0 * 60.0
  private static let minimumAcknowledgementSamples = 20
  private static let minimumMemorySamples = 20

  private let tracker: OpenOutdoorTrackerSpike
  private let reportProfileId: String
  private var acknowledgementReport: OpenOutdoorAcknowledgementReport?
  private var memoryReport: OpenOutdoorMemoryReport?
  private var trackingProtectionReport: OpenOutdoorTrackingPolicyReport?
  private var memoryStartedAt: Date?
  private var memorySamples: [UInt64] = []
  private var memoryTimer: DispatchSourceTimer?
  private var lastReportJSON: String?

  var isMemoryProfileActive: Bool { memoryTimer != nil }

  init(
    tracker: OpenOutdoorTrackerSpike,
    profileId: String = OpenOutdoorPhase0PerformanceDiagnostics.profileId
  ) throws {
    guard Bundle.main.object(forInfoDictionaryKey: "OpenOutdoorPhase0DiagnosticsEnabled") as? Bool == true else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Phase 0 diagnostics are disabled outside the local feasibility channel"]
      )
    }
    self.tracker = tracker
    self.reportProfileId = profileId
  }

  private static func percentile95(_ samples: [Double]) -> Double {
    let sorted = samples.sorted()
    let index = max(0, Int(ceil(Double(sorted.count) * 0.95)) - 1)
    return sorted[index]
  }

  private static func percentile95(_ samples: [UInt64]) -> UInt64 {
    let sorted = samples.sorted()
    let index = max(0, Int(ceil(Double(sorted.count) * 0.95)) - 1)
    return sorted[index]
  }

  private static func validateDurations(_ samples: [Double], label: String) throws {
    guard samples.count >= minimumAcknowledgementSamples else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "At least 20 \(label) acknowledgement samples are required"]
      )
    }
    guard samples.allSatisfy({ $0.isFinite && $0 >= 0 }) else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Every \(label) acknowledgement sample must be finite and non-negative"]
      )
    }
  }

  private func currentReport() -> OpenOutdoorPhysicalDiagnosticReport {
    OpenOutdoorPhysicalDiagnosticReport(
      schemaVersion: 1,
      profileId: reportProfileId,
      generatedAt: Date(),
      deviceClass: UIDevice.current.model,
      systemName: UIDevice.current.systemName,
      systemVersion: UIDevice.current.systemVersion,
      memoryProfileActive: memoryTimer != nil,
      acknowledgement: acknowledgementReport,
      memory: memoryReport,
      trackingProtection: trackingProtectionReport
    )
  }

  @discardableResult
  private func retainCurrentReport() throws -> String {
    let json = try currentReport().json()
    lastReportJSON = json
    return json
  }

  func recordAcknowledgement(_ inputJSON: String) throws -> String {
    guard memoryTimer == nil else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Finish the memory profile before recording acknowledgements"]
      )
    }
    let input = try JSONDecoder().decode(
      OpenOutdoorAcknowledgementInput.self,
      from: Data(inputJSON.utf8)
    )
    try Self.validateDurations(input.startDurationsMs, label: "Start")
    try Self.validateDurations(input.stopDurationsMs, label: "Stop")
    guard input.startDurationsMs.count == input.stopDurationsMs.count else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "Start and Stop acknowledgement sample counts must match"]
      )
    }

    let startP95 = Self.percentile95(input.startDurationsMs)
    let stopP95 = Self.percentile95(input.stopDurationsMs)
    acknowledgementReport = OpenOutdoorAcknowledgementReport(
      mode: input.mode,
      sampleCount: input.startDurationsMs.count,
      startDurationsMs: input.startDurationsMs,
      stopDurationsMs: input.stopDurationsMs,
      startP95Ms: startP95,
      stopP95Ms: stopP95,
      startMaxMs: input.startDurationsMs.max() ?? 0,
      stopMaxMs: input.stopDurationsMs.max() ?? 0,
      thresholdMs: Self.acknowledgementThresholdMs,
      passed: startP95 <= Self.acknowledgementThresholdMs
        && stopP95 <= Self.acknowledgementThresholdMs
    )
    return try retainCurrentReport()
  }

  private static func residentMemoryBytes() throws -> UInt64 {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
        task_info(
          mach_task_self_,
          task_flavor_t(MACH_TASK_BASIC_INFO),
          rebound,
          &count
        )
      }
    }
    guard result == KERN_SUCCESS else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Unable to read resident memory (Mach error \(result))"]
      )
    }
    return UInt64(info.resident_size)
  }

  private func captureMemorySample() throws {
    memorySamples.append(try Self.residentMemoryBytes())
  }

  func beginMemoryProfile() throws -> String {
    guard tracker.isTracking else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 7,
        userInfo: [NSLocalizedDescriptionKey: "Start native tracking before beginning the memory profile"]
      )
    }
    guard memoryTimer == nil else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 8,
        userInfo: [NSLocalizedDescriptionKey: "A memory profile is already active"]
      )
    }

    memoryReport = nil
    memorySamples = []
    memoryStartedAt = Date()
    try captureMemorySample()
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 5, repeating: 5, leeway: .milliseconds(500))
    timer.setEventHandler { [weak self] in
      guard let self else { return }
      guard self.tracker.isTracking else {
        self.cancelMemoryProfile()
        return
      }
      try? self.captureMemorySample()
    }
    memoryTimer = timer
    timer.resume()
    return try retainCurrentReport()
  }

  func finishMemoryProfile() throws -> String {
    guard let memoryStartedAt, memoryTimer != nil else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 9,
        userInfo: [NSLocalizedDescriptionKey: "No memory profile is active"]
      )
    }
    guard tracker.isTracking else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 10,
        userInfo: [NSLocalizedDescriptionKey: "Tracking stopped before the memory profile was finished"]
      )
    }
    try captureMemorySample()
    let elapsed = Date().timeIntervalSince(memoryStartedAt)
    guard elapsed >= Self.minimumMemoryDurationSeconds else {
      let remaining = Int(ceil(Self.minimumMemoryDurationSeconds - elapsed))
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 11,
        userInfo: [NSLocalizedDescriptionKey: "Keep the screen-off profile running for another \(remaining) seconds"]
      )
    }
    guard memorySamples.count >= Self.minimumMemorySamples else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 12,
        userInfo: [NSLocalizedDescriptionKey: "The profile captured only \(memorySamples.count) resident-memory samples; at least 20 are required"]
      )
    }

    memoryTimer?.cancel()
    memoryTimer = nil
    self.memoryStartedAt = nil
    let p95 = Self.percentile95(memorySamples)
    memoryReport = OpenOutdoorMemoryReport(
      elapsedSeconds: elapsed,
      sampleCount: memorySamples.count,
      samplesBytes: memorySamples,
      p95ResidentBytes: p95,
      maxResidentBytes: memorySamples.max() ?? 0,
      thresholdBytes: Self.memoryThresholdBytes,
      passed: p95 <= Self.memoryThresholdBytes
    )
    memorySamples = []
    return try retainCurrentReport()
  }

  func cancelMemoryProfile() {
    memoryTimer?.cancel()
    memoryTimer = nil
    memoryStartedAt = nil
    memorySamples = []
  }

  func inspectTrackingProtection() throws -> String {
    trackingProtectionReport = try tracker.inspectActiveFilePolicy()

    return try retainCurrentReport()
  }

  func exportLastReport() throws -> String {
    guard let lastReportJSON else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 13,
        userInfo: [NSLocalizedDescriptionKey: "Run a physical diagnostic first"]
      )
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "Phase0PhysicalDiagnosticsExport",
      isDirectory: true
    )
    try OpenOutdoorFilePolicy.prepareDirectory(directory, protection: .complete)
    let reportURL = directory.appendingPathComponent("phase0-physical-report.json")
    try Data(lastReportJSON.utf8).write(to: reportURL, options: .atomic)
    try OpenOutdoorFilePolicy.apply(reportURL, protection: .complete)
    return reportURL.path
  }

  func shareLastReport() throws -> String {
    let path = try exportLastReport()
    let reportURL = URL(fileURLWithPath: path)
    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      throw NSError(
        domain: "OpenOutdoorPhase0PerformanceDiagnostics",
        code: 14,
        userInfo: [NSLocalizedDescriptionKey: "No active window is available to share the report"]
      )
    }
    var presenter = root
    while let presented = presenter.presentedViewController {
      presenter = presented
    }
    presenter.present(
      UIActivityViewController(activityItems: [reportURL], applicationActivities: nil),
      animated: true
    )
    return path
  }
}
#endif
