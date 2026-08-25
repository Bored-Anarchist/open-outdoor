#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
import CoreLocation
import Foundation
import Network
import UIKit

private struct OpenOutdoorPhase1Event: Codable {
  let kind: String
  let recordedAt: Date
  let detail: String?
}

internal struct OpenOutdoorPhase1AccessibilitySnapshot: Codable {
  let voiceOverRunning: Bool
  let preferredContentSizeCategory: String
  let largestAccessibilitySize: Bool
  let boldTextEnabled: Bool
  let increasedContrastEnabled: Bool
  let differentiateWithoutColorEnabled: Bool
  let reduceMotionEnabled: Bool
  let darkModeEnabled: Bool
}

internal struct OpenOutdoorPhase1CheckResult: Codable {
  let passed: Bool
  let checks: [String: Bool]
}

private struct OpenOutdoorPhase1AcceptanceState: Codable {
  var startedAt: Date
  var updatedAt: Date
  var stage: String
  var referenceClimbM: Double
  var crashArmedProcessID: Int32?
  var crashRelaunched: Bool
  var trackerRecovered: Bool
  var authorizationStatuses: [String]
  var permissionLossObserved: Bool
  var permissionSafeStopObserved: Bool
  var permissionRestored: Bool
  var fieldStartedAt: Date?
  var backgroundStartedAt: Date?
  var maximumBackgroundSeconds: Double
  var lastNetworkState: String?
  var networkTransitions: Int
  var weakGPSObserved: Bool
  var explicitStopObserved: Bool
  var memory: OpenOutdoorMemoryReport?
  var measuredAscentM: Double?
  var accessibility: OpenOutdoorPhase1AccessibilitySnapshot?
  var accessibilityUsabilityConfirmed: Bool
  var events: [OpenOutdoorPhase1Event]
}

internal struct OpenOutdoorPhase1AcceptanceReport: Codable {
  let schemaVersion: Int
  let profileId: String
  let generatedAt: Date
  let status: String
  let stage: String
  let deviceClass: String
  let systemName: String
  let systemVersion: String
  let bundleIdentifier: String
  let appVersion: String
  let buildNumber: String
  let startedAt: Date?
  let referenceClimbM: Double?
  let measuredAscentM: Double?
  let elevationAllowedErrorM: Double?
  let authorizationStatuses: [String]
  let maximumBackgroundSeconds: Double
  let networkTransitions: Int
  let accessibility: OpenOutdoorPhase1AccessibilitySnapshot
  let memory: OpenOutdoorMemoryReport?
  let results: [String: OpenOutdoorPhase1CheckResult]
  let events: [OpenOutdoorPhase1Event]

  func json() throws -> String {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return String(decoding: try encoder.encode(self), as: UTF8.self)
  }
}

internal final class OpenOutdoorPhase1AcceptanceCoordinator {
  private static let profileId = "iphone14-ios26.6-phase1-v1"
  private static let minimumBackgroundSeconds = 30.0 * 60.0
  private static let minimumMemorySamples = 20
  private static let memoryThresholdBytes: UInt64 = 150 * 1_024 * 1_024

  private let tracker: OpenOutdoorTrackerSpike
  private let directoryURL: URL
  private let stateURL: URL
  private let networkMonitor = NWPathMonitor()
  private let networkQueue = DispatchQueue(label: "org.openoutdoor.phase1-network")
  private var observers: [NSObjectProtocol] = []
  private var state: OpenOutdoorPhase1AcceptanceState?

  init(tracker: OpenOutdoorTrackerSpike) throws {
    self.tracker = tracker
    let applicationSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    directoryURL = applicationSupport.appendingPathComponent(
      "Diagnostics/Phase1Acceptance",
      isDirectory: true
    )
    stateURL = directoryURL.appendingPathComponent("state.json")
    try OpenOutdoorFilePolicy.prepareDirectory(directoryURL, protection: .complete)
    state = try Self.loadState(from: stateURL)

    if var restored = state,
      let armedProcessID = restored.crashArmedProcessID,
      armedProcessID != ProcessInfo.processInfo.processIdentifier,
      !restored.crashRelaunched
    {
      restored.crashRelaunched = true
      restored.updatedAt = Date()
      restored.events.append(
        OpenOutdoorPhase1Event(
          kind: "process-relaunched-after-crash-arm",
          recordedAt: Date(),
          detail: nil
        )
      )
      state = restored
      try persist()
    }

    observeApplicationLifecycle()
    observeNetwork()
    try captureEnvironment()
  }

  deinit {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    networkMonitor.cancel()
  }

  private static func loadState(from url: URL) throws -> OpenOutdoorPhase1AcceptanceState? {
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(
      OpenOutdoorPhase1AcceptanceState.self,
      from: Data(contentsOf: url)
    )
  }

  private func persist() throws {
    guard let state else {
      if FileManager.default.fileExists(atPath: stateURL.path) {
        try FileManager.default.removeItem(at: stateURL)
      }
      return
    }
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    try encoder.encode(state).write(to: stateURL, options: .atomic)
    try OpenOutdoorFilePolicy.apply(stateURL, protection: .complete)
  }

  private func appendEvent(_ kind: String, detail: String? = nil) {
    guard var state else { return }
    state.updatedAt = Date()
    state.events.append(OpenOutdoorPhase1Event(kind: kind, recordedAt: Date(), detail: detail))
    self.state = state
    try? persist()
  }

  private func observeApplicationLifecycle() {
    observers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in self?.enteredBackground() }
    )
    observers.append(
      NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.enteredForeground()
        try? self?.captureEnvironment()
      }
    )
  }

  private func observeNetwork() {
    networkMonitor.pathUpdateHandler = { [weak self] path in
      DispatchQueue.main.async { self?.recordNetwork(path) }
    }
    networkMonitor.start(queue: networkQueue)
  }

  private func enteredBackground() {
    guard var state, state.fieldStartedAt != nil, state.memory == nil else { return }
    state.backgroundStartedAt = Date()
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(kind: "field-entered-background", recordedAt: Date(), detail: nil)
    )
    self.state = state
    try? persist()
  }

  private func enteredForeground() {
    guard var state, let backgroundStartedAt = state.backgroundStartedAt else { return }
    let elapsed = max(0, Date().timeIntervalSince(backgroundStartedAt))
    state.maximumBackgroundSeconds = max(state.maximumBackgroundSeconds, elapsed)
    state.backgroundStartedAt = nil
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(
        kind: "field-entered-foreground",
        recordedAt: Date(),
        detail: String(format: "%.3f seconds", elapsed)
      )
    )
    self.state = state
    try? persist()
  }

  private func networkDescription(_ path: NWPath) -> String {
    let status: String
    switch path.status {
    case .satisfied: status = "satisfied"
    case .unsatisfied: status = "unsatisfied"
    case .requiresConnection: status = "requires-connection"
    @unknown default: status = "unknown"
    }
    let interfaces: [(NWInterface.InterfaceType, String)] = [
      (.wifi, "wifi"), (.cellular, "cellular"), (.wiredEthernet, "wired"), (.loopback, "loopback")
    ]
    let active = interfaces.compactMap { path.usesInterfaceType($0.0) ? $0.1 : nil }
    return status + ":" + active.joined(separator: ",")
  }

  private func recordNetwork(_ path: NWPath) {
    guard var state, state.fieldStartedAt != nil, state.memory == nil else { return }
    let description = networkDescription(path)
    if let prior = state.lastNetworkState, prior != description {
      state.networkTransitions += 1
      state.events.append(
        OpenOutdoorPhase1Event(
          kind: "field-network-transition",
          recordedAt: Date(),
          detail: prior + " -> " + description
        )
      )
    }
    state.lastNetworkState = description
    state.updatedAt = Date()
    self.state = state
    try? persist()
  }

  private func authorizationDescription() -> String {
    switch CLLocationManager().authorizationStatus {
    case .notDetermined: return "not-determined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways: return "authorized-always"
    case .authorizedWhenInUse: return "authorized-when-in-use"
    @unknown default: return "unknown"
    }
  }

  private func accessibilitySnapshot() -> OpenOutdoorPhase1AccessibilitySnapshot {
    let traitCollection = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })?
      .traitCollection ?? UITraitCollection.current
    let category = traitCollection.preferredContentSizeCategory
    return OpenOutdoorPhase1AccessibilitySnapshot(
      voiceOverRunning: UIAccessibility.isVoiceOverRunning,
      preferredContentSizeCategory: category.rawValue,
      largestAccessibilitySize: category == .accessibilityExtraExtraExtraLarge,
      boldTextEnabled: UIAccessibility.isBoldTextEnabled,
      increasedContrastEnabled: traitCollection.accessibilityContrast == .high,
      differentiateWithoutColorEnabled: UIAccessibility.shouldDifferentiateWithoutColor,
      reduceMotionEnabled: UIAccessibility.isReduceMotionEnabled,
      darkModeEnabled: traitCollection.userInterfaceStyle == .dark
    )
  }

  private func captureEnvironment() throws {
    guard var state else { return }
    let authorization = authorizationDescription()
    let prior = state.authorizationStatuses.last
    if prior != authorization {
      state.authorizationStatuses.append(authorization)
      state.events.append(
        OpenOutdoorPhase1Event(
          kind: "location-authorization",
          recordedAt: Date(),
          detail: authorization
        )
      )
    }
    if authorization != "authorized-always"
      && state.authorizationStatuses.contains("authorized-always")
    {
      state.permissionLossObserved = true
      if !tracker.isTracking { state.permissionSafeStopObserved = true }
    }
    if state.permissionLossObserved && !tracker.isTracking {
      state.permissionSafeStopObserved = true
    }
    if authorization == "authorized-always" && state.permissionLossObserved {
      state.permissionRestored = true
    }
    state.weakGPSObserved = state.weakGPSObserved || tracker.observedWeakGPS
    if state.stage == "permission"
      && state.permissionLossObserved
      && state.permissionSafeStopObserved
      && state.permissionRestored
    {
      state.stage = "field"
      state.events.append(
        OpenOutdoorPhase1Event(
          kind: "permission-test-complete",
          recordedAt: Date(),
          detail: nil
        )
      )
    }
    state.updatedAt = Date()
    self.state = state
    try persist()
  }

  func begin(referenceClimbM: Double) throws -> String {
    guard referenceClimbM.isFinite && referenceClimbM > 0 else {
      throw NSError(
        domain: "OpenOutdoorPhase1Acceptance",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Reference climb must be a positive number of metres"]
      )
    }
    let now = Date()
    state = OpenOutdoorPhase1AcceptanceState(
      startedAt: now,
      updatedAt: now,
      stage: "crash",
      referenceClimbM: referenceClimbM,
      crashArmedProcessID: nil,
      crashRelaunched: false,
      trackerRecovered: false,
      authorizationStatuses: [],
      permissionLossObserved: false,
      permissionSafeStopObserved: false,
      permissionRestored: false,
      fieldStartedAt: nil,
      backgroundStartedAt: nil,
      maximumBackgroundSeconds: 0,
      lastNetworkState: nil,
      networkTransitions: 0,
      weakGPSObserved: false,
      explicitStopObserved: false,
      memory: nil,
      measuredAscentM: nil,
      accessibility: nil,
      accessibilityUsabilityConfirmed: false,
      events: [OpenOutdoorPhase1Event(kind: "acceptance-started", recordedAt: now, detail: nil)]
    )
    try captureEnvironment()
    return try currentReportJSON()
  }

  func armCrashRecovery() throws -> String {
    guard var state, state.stage == "crash", tracker.isTracking else {
      throw NSError(
        domain: "OpenOutdoorPhase1Acceptance",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Start a recording before arming crash recovery"]
      )
    }
    state.crashArmedProcessID = ProcessInfo.processInfo.processIdentifier
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(kind: "crash-recovery-armed", recordedAt: Date(), detail: nil)
    )
    self.state = state
    try persist()
    return try currentReportJSON()
  }

  func recordTrackerRecovery() {
    guard var state, state.crashRelaunched else { return }
    state.trackerRecovered = true
    if state.stage == "crash" { state.stage = "permission" }
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(kind: "tracker-recovered", recordedAt: Date(), detail: nil)
    )
    self.state = state
    try? persist()
  }

  func recordExplicitStop(finalSequence: Int64) {
    guard var state else { return }
    state.explicitStopObserved = true
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(
        kind: "explicit-tracker-stop",
        recordedAt: Date(),
        detail: "final sequence \(finalSequence)"
      )
    )
    self.state = state
    try? persist()
  }

  func beginFieldRun() throws -> String {
    try captureEnvironment()
    guard var state, state.stage == "field", tracker.isTracking else {
      throw NSError(
        domain: "OpenOutdoorPhase1Acceptance",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Complete permission recovery and start a recording first"]
      )
    }
    state.fieldStartedAt = Date()
    state.backgroundStartedAt = nil
    state.maximumBackgroundSeconds = 0
    state.networkTransitions = 0
    state.lastNetworkState = nil
    state.weakGPSObserved = false
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(kind: "combined-field-run-started", recordedAt: Date(), detail: nil)
    )
    self.state = state
    try persist()
    return try currentReportJSON()
  }

  func recordFieldResult(memoryReportJSON: String, measuredAscentM: Double) throws -> String {
    enteredForeground()
    guard measuredAscentM.isFinite && measuredAscentM >= 0 else {
      throw NSError(
        domain: "OpenOutdoorPhase1Acceptance",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Measured ascent is invalid"]
      )
    }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let diagnostic = try decoder.decode(
      OpenOutdoorPhysicalDiagnosticReport.self,
      from: Data(memoryReportJSON.utf8)
    )
    guard var state, state.fieldStartedAt != nil, let memory = diagnostic.memory else {
      throw NSError(
        domain: "OpenOutdoorPhase1Acceptance",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "A completed memory report is required"]
      )
    }
    state.memory = memory
    state.measuredAscentM = measuredAscentM
    state.weakGPSObserved = state.weakGPSObserved || tracker.observedWeakGPS
    state.stage = "accessibility"
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(kind: "combined-field-run-finished", recordedAt: Date(), detail: nil)
    )
    self.state = state
    try persist()
    return try currentReportJSON()
  }

  func confirmAccessibilityUsability(_ usable: Bool) throws -> String {
    guard var state, state.stage == "accessibility" else {
      throw NSError(
        domain: "OpenOutdoorPhase1Acceptance",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Complete the combined field run first"]
      )
    }
    state.accessibility = accessibilitySnapshot()
    state.accessibilityUsabilityConfirmed = usable
    state.stage = "complete"
    state.updatedAt = Date()
    state.events.append(
      OpenOutdoorPhase1Event(
        kind: "accessibility-reviewed",
        recordedAt: Date(),
        detail: usable ? "usable" : "problem-reported"
      )
    )
    self.state = state
    try persist()
    return try currentReportJSON()
  }

  func reset() throws -> String {
    state = nil
    try persist()
    return try currentReportJSON()
  }

  private func resultChecks(for state: OpenOutdoorPhase1AcceptanceState) -> [String: OpenOutdoorPhase1CheckResult] {
    let trackerChecks = [
      "crashRelaunched": state.crashRelaunched,
      "trackerRecovered": state.trackerRecovered,
      "permissionLossObserved": state.permissionLossObserved,
      "permissionSafeStopObserved": state.permissionSafeStopObserved,
      "permissionRestored": state.permissionRestored,
      "screenOffDuration": state.maximumBackgroundSeconds >= Self.minimumBackgroundSeconds,
      "networkTransition": state.networkTransitions >= 1,
      "weakGPSObserved": state.weakGPSObserved,
      "explicitStopObserved": state.explicitStopObserved,
    ]
    let memoryChecks = [
      "duration": (state.memory?.elapsedSeconds ?? 0) >= Self.minimumBackgroundSeconds,
      "sampleCount": (state.memory?.sampleCount ?? 0) >= Self.minimumMemorySamples,
      "residentMemoryP95": (state.memory?.p95ResidentBytes ?? UInt64.max) <= Self.memoryThresholdBytes,
      "nativeResult": state.memory?.passed == true,
    ]
    let accessibility = state.accessibility
    let voiceOverChecks = [
      "voiceOverRunning": accessibility?.voiceOverRunning == true,
      "usabilityConfirmed": state.accessibilityUsabilityConfirmed,
    ]
    let dynamicTypeChecks = [
      "largestAccessibilitySize": accessibility?.largestAccessibilitySize == true,
      "boldText": accessibility?.boldTextEnabled == true,
      "increasedContrast": accessibility?.increasedContrastEnabled == true,
      "differentiateWithoutColor": accessibility?.differentiateWithoutColorEnabled == true,
      "reduceMotion": accessibility?.reduceMotionEnabled == true,
      "darkMode": accessibility?.darkModeEnabled == true,
      "usabilityConfirmed": state.accessibilityUsabilityConfirmed,
    ]
    let allowedElevationError = max(15, state.referenceClimbM * 0.10)
    let elevationChecks = [
      "measured": state.measuredAscentM != nil,
      "withinThreshold": state.measuredAscentM.map {
        abs($0 - state.referenceClimbM) <= allowedElevationError
      } ?? false,
    ]
    let groups = [
      "trackerCorrectness": trackerChecks,
      "memorySmoke": memoryChecks,
      "voiceOver": voiceOverChecks,
      "dynamicType": dynamicTypeChecks,
      "elevation": elevationChecks,
    ]
    return groups.mapValues { checks in
      OpenOutdoorPhase1CheckResult(passed: checks.values.allSatisfy { $0 }, checks: checks)
    }
  }

  private func report() -> OpenOutdoorPhase1AcceptanceReport {
    let currentState = state
    let accessibility = currentState?.accessibility ?? accessibilitySnapshot()
    let results = currentState.map { resultChecks(for: $0) } ?? [:]
    let passed = !results.isEmpty && results.values.allSatisfy { $0.passed }
    let status: String
    if currentState == nil {
      status = "not-started"
    } else if passed {
      status = "passed"
    } else if currentState?.stage == "complete" {
      status = "failed"
    } else {
      status = "in-progress"
    }
    return OpenOutdoorPhase1AcceptanceReport(
      schemaVersion: 1,
      profileId: Self.profileId,
      generatedAt: Date(),
      status: status,
      stage: currentState?.stage ?? "idle",
      deviceClass: UIDevice.current.model,
      systemName: UIDevice.current.systemName,
      systemVersion: UIDevice.current.systemVersion,
      bundleIdentifier: Bundle.main.bundleIdentifier ?? "unknown",
      appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
      buildNumber: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
      startedAt: currentState?.startedAt,
      referenceClimbM: currentState?.referenceClimbM,
      measuredAscentM: currentState?.measuredAscentM,
      elevationAllowedErrorM: currentState.map { max(15, $0.referenceClimbM * 0.10) },
      authorizationStatuses: currentState?.authorizationStatuses ?? [],
      maximumBackgroundSeconds: currentState?.maximumBackgroundSeconds ?? 0,
      networkTransitions: currentState?.networkTransitions ?? 0,
      accessibility: accessibility,
      memory: currentState?.memory,
      results: results,
      events: currentState?.events ?? []
    )
  }

  func currentReportJSON() throws -> String {
    try captureEnvironment()
    return try report().json()
  }

  private func exportCurrentReport() throws -> URL {
    let json = try currentReportJSON()
    let exportDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "Phase1AcceptanceExport",
      isDirectory: true
    )
    try OpenOutdoorFilePolicy.prepareDirectory(exportDirectory, protection: .complete)
    let reportURL = exportDirectory.appendingPathComponent("phase1-physical-report.json")
    try Data(json.utf8).write(to: reportURL, options: .atomic)
    try OpenOutdoorFilePolicy.apply(reportURL, protection: .complete)
    return reportURL
  }

  func shareCurrentReport() throws -> String {
    let reportURL = try exportCurrentReport()
    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      throw NSError(
        domain: "OpenOutdoorPhase1Acceptance",
        code: 7,
        userInfo: [NSLocalizedDescriptionKey: "No active window is available to share the report"]
      )
    }
    var presenter = root
    while let presented = presenter.presentedViewController { presenter = presented }
    presenter.present(
      UIActivityViewController(activityItems: [reportURL], applicationActivities: nil),
      animated: true
    )
    return reportURL.path
  }
}
#endif
