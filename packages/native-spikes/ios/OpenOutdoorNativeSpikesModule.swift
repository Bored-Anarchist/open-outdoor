import ExpoModulesCore
import Foundation

public final class OpenOutdoorNativeSpikesModule: Module {
  private lazy var tracker = OpenOutdoorTrackerSpike()

  public func definition() -> ModuleDefinition {
    Name("OpenOutdoorNativeSpikes")

    Constant("policyVersion") {
      1
    }

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

    AsyncFunction("isTracking") { () -> Bool in
      self.tracker.isTracking
    }.runOnQueue(.main)

    AsyncFunction("currentSessionId") { () -> String? in
      self.tracker.currentSessionID?.uuidString
    }.runOnQueue(.main)

    AsyncFunction("lastTrackingError") { () -> String? in
      self.tracker.lastError
    }.runOnQueue(.main)
  }
}