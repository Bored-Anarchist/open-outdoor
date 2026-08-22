import ExpoModulesCore
import Foundation

public final class OpenOutdoorNativeSpikesModule: Module {
  private lazy var tracker = OpenOutdoorTrackerSpike()
#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
  private var phase0DiagnosticsInstance: OpenOutdoorPhase0Diagnostics?

  private func phase0Diagnostics() throws -> OpenOutdoorPhase0Diagnostics {
    if let phase0DiagnosticsInstance { return phase0DiagnosticsInstance }
    let diagnostics = try OpenOutdoorPhase0Diagnostics()
    phase0DiagnosticsInstance = diagnostics
    return diagnostics
  }
#endif

  public func definition() -> ModuleDefinition {
    Name("OpenOutdoorNativeSpikes")

    Constant("policyVersion") {
      2
    }

#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
    Constant("phase0DiagnosticsEnabled") {
      Bundle.main.bundleIdentifier == "org.openoutdoor.local"
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

    AsyncFunction("stopTracking") { () -> Int64 in
      try self.tracker.stop()
    }.runOnQueue(.main)

    AsyncFunction("inspectTrackingSession") { () -> String? in
      try self.tracker.inspectLatestSession()
    }.runOnQueue(.main)

    AsyncFunction("recoverTrackingSession") { () -> String in
      try self.tracker.recover()
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
#endif
  }
}
