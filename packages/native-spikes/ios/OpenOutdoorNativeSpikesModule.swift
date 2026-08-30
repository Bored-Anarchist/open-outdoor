import ExpoModulesCore
import Foundation

public final class OpenOutdoorNativeSpikesModule: Module {
  private lazy var tracker = OpenOutdoorTrackerSpike()
  private lazy var privateStore = try? OpenOutdoorStorageCoordinatorSpike()
#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
  private var phase0DiagnosticsInstance: OpenOutdoorPhase0Diagnostics?
  private var phase0PerformanceInstance: OpenOutdoorPhase0PerformanceDiagnostics?
  private var phase1AcceptanceInstance: OpenOutdoorPhase1AcceptanceCoordinator?

  private func phase0Diagnostics() throws -> OpenOutdoorPhase0Diagnostics {
    if let phase0DiagnosticsInstance { return phase0DiagnosticsInstance }
    let diagnostics = try OpenOutdoorPhase0Diagnostics()
    phase0DiagnosticsInstance = diagnostics
    return diagnostics
  }

  private func phase0Performance() throws -> OpenOutdoorPhase0PerformanceDiagnostics {
    if let phase0PerformanceInstance { return phase0PerformanceInstance }
    let diagnostics = try OpenOutdoorPhase0PerformanceDiagnostics(
      tracker: tracker,
      profileId: "iphone14-ios26.6-phase1-v1"
    )
    phase0PerformanceInstance = diagnostics
    return diagnostics
  }

  private func phase1Acceptance() throws -> OpenOutdoorPhase1AcceptanceCoordinator {
    if let phase1AcceptanceInstance { return phase1AcceptanceInstance }
    let coordinator = try OpenOutdoorPhase1AcceptanceCoordinator(tracker: tracker)
    phase1AcceptanceInstance = coordinator
    return coordinator
  }
#endif

  public func definition() -> ModuleDefinition {
    Name("OpenOutdoorNativeSpikes")

    Constant("policyVersion") {
      2
    }

#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
    Constant("phase0DiagnosticsEnabled") {
      Bundle.main.object(forInfoDictionaryKey: "OpenOutdoorPhase0DiagnosticsEnabled") as? Bool == true
    }
#else
    Constant("phase0DiagnosticsEnabled") {
      false
    }
#endif

    AsyncFunction("requestAlwaysAuthorization") {
      self.tracker.requestAlwaysAuthorization()
    }.runOnQueue(.main)

    AsyncFunction("startTracking") { (modeValue: String) -> String in
      guard let mode = OpenOutdoorTrackingMode(rawValue: modeValue) else {
        throw NSError(
          domain: "OpenOutdoorTracker",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Unknown tracking mode"]
        )
      }
      return try self.tracker.start(mode: mode)
    }.runOnQueue(.main)

    AsyncFunction("pauseTracking") { () -> Int64 in
      try self.tracker.pause()
    }.runOnQueue(.main)

    AsyncFunction("resumeTracking") { () -> Int64 in
      try self.tracker.resume()
    }.runOnQueue(.main)

    AsyncFunction("stopTracking") { () -> Int64 in
      let finalSequence = try self.tracker.stop()
#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
      self.phase1AcceptanceInstance?.recordExplicitStop(finalSequence: finalSequence)
      self.phase0PerformanceInstance?.cancelMemoryProfile()
#endif
      return finalSequence
    }.runOnQueue(.main)

    AsyncFunction("sealTrackingSession") { (sessionID: String, highestSequence: Int64) in
      try self.tracker.seal(sessionID: sessionID, throughSequence: highestSequence)
    }.runOnQueue(.main)

    AsyncFunction("readTrackingBatch") { (afterSequence: Int64) -> String? in
      try self.tracker.readBatch(afterSequence: afterSequence)
    }.runOnQueue(.main)

    AsyncFunction("inspectTrackingSession") { () -> String? in
      try self.tracker.inspectLatestSession()
    }.runOnQueue(.main)

    AsyncFunction("recoverTrackingSession") { () -> String in
      let inspection = try self.tracker.recover()
#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
      self.phase1AcceptanceInstance?.recordTrackerRecovery()
#endif
      return inspection
    }.runOnQueue(.main)

    AsyncFunction("discardRecoverableTrackingSession") { () -> String in
      try self.tracker.discardRecovery()
    }.runOnQueue(.main)

    AsyncFunction("isTracking") { () -> Bool in
      self.tracker.isTracking
    }.runOnQueue(.main)

    AsyncFunction("currentSessionId") { () -> String? in
      self.tracker.currentSessionID?.uuidString
    }.runOnQueue(.main)

    AsyncFunction("lastTrackingError") { () -> String? in
      self.tracker.lastError
    }.runOnQueue(.main)

    AsyncFunction("loadPrivateSnapshot") { () -> String? in
      guard let store = self.privateStore else {
        throw NSError(domain: "OpenOutdoorStorage", code: 1)
      }
      return try store.loadPrivateSnapshot()
    }.runOnQueue(.main)

    AsyncFunction("commitPrivateSnapshot") { (snapshotJSON: String) in
      guard let store = self.privateStore else {
        throw NSError(domain: "OpenOutdoorStorage", code: 1)
      }
      try store.commitPrivateSnapshot(snapshotJSON)
    }.runOnQueue(.main)

    AsyncFunction("commitTrackingSnapshot") {
      (snapshotJSON: String, sessionID: String, highestSequence: Int64) in
      guard let store = self.privateStore else {
        throw NSError(domain: "OpenOutdoorStorage", code: 1)
      }
      try store.commitTrackingSnapshot(
        snapshotJSON,
        sessionID: sessionID,
        highestSequence: highestSequence
      )
    }.runOnQueue(.main)

    AsyncFunction("trackingCheckpoint") { (sessionID: String) -> Int64 in
      guard let store = self.privateStore else {
        throw NSError(domain: "OpenOutdoorStorage", code: 1)
      }
      return try store.trackingCheckpoint(sessionID: sessionID)
    }.runOnQueue(.main)

#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
    AsyncFunction("seedPhase0FixtureA") { () -> String in
      try self.phase0Diagnostics().seedVersionA()
    }.runOnQueue(.main)

    AsyncFunction("applyPhase0FixtureB") { (checkpoint: String?) -> String in
      try self.phase0Diagnostics().applyVersionB(interruptAt: checkpoint)
    }.runOnQueue(.main)

    AsyncFunction("inspectPhase0Fixture") { () -> String in
      try self.phase0Diagnostics().inspectCurrent()
    }.runOnQueue(.main)

    AsyncFunction("sharePhase0DiagnosticReport") { () -> String in
      try self.phase0Diagnostics().shareLastReport()
    }.runOnQueue(.main)

    AsyncFunction("recordAcknowledgementBenchmark") { (inputJSON: String) -> String in
      try self.phase0Performance().recordAcknowledgement(inputJSON)
    }.runOnQueue(.main)

    AsyncFunction("beginMemoryProfile") { () -> String in
      try self.phase0Performance().beginMemoryProfile()
    }.runOnQueue(.main)

    AsyncFunction("isMemoryProfileActive") { () -> Bool in
      try self.phase0Performance().isMemoryProfileActive
    }.runOnQueue(.main)

    AsyncFunction("finishMemoryProfile") { () -> String in
      try self.phase0Performance().finishMemoryProfile()
    }.runOnQueue(.main)

    AsyncFunction("inspectTrackingProtection") { () -> String in
      try self.phase0Performance().inspectTrackingProtection()
    }.runOnQueue(.main)

    AsyncFunction("sharePhysicalDiagnosticReport") { () -> String in
      try self.phase0Performance().shareLastReport()
    }.runOnQueue(.main)

    AsyncFunction("beginPhase1Acceptance") { (referenceClimbM: Double) -> String in
      try self.phase1Acceptance().begin(referenceClimbM: referenceClimbM)
    }.runOnQueue(.main)

    AsyncFunction("currentPhase1Acceptance") { () -> String in
      try self.phase1Acceptance().currentReportJSON()
    }.runOnQueue(.main)

    AsyncFunction("armPhase1CrashRecovery") { () -> String in
      try self.phase1Acceptance().armCrashRecovery()
    }.runOnQueue(.main)

    AsyncFunction("beginPhase1FieldRun") { () -> String in
      try self.phase1Acceptance().beginFieldRun()
    }.runOnQueue(.main)

    AsyncFunction("recordPhase1FieldResult") { (memoryReportJSON: String, measuredAscentM: Double) -> String in
      try self.phase1Acceptance().recordFieldResult(
        memoryReportJSON: memoryReportJSON,
        measuredAscentM: measuredAscentM
      )
    }.runOnQueue(.main)

    AsyncFunction("confirmPhase1Accessibility") { (usable: Bool) -> String in
      try self.phase1Acceptance().confirmAccessibilityUsability(usable)
    }.runOnQueue(.main)

    AsyncFunction("resetPhase1Acceptance") { () -> String in
      try self.phase1Acceptance().reset()
    }.runOnQueue(.main)

    AsyncFunction("sharePhase1AcceptanceReport") { () -> String in
      try self.phase1Acceptance().shareCurrentReport()
    }.runOnQueue(.main)
#endif
  }
}
