import ExpoModulesCore
import Foundation
import CoreLocation

public final class OpenOutdoorNativeSpikesModule: Module {
  private lazy var tracker: OpenOutdoorTrackerSpike = {
    let tracker = OpenOutdoorTrackerSpike()
    tracker.onLocationPermissionChange = { [weak self] status in
      self?.sendEvent("onLocationPermissionChange", ["status": status])
    }
    return tracker
  }()
  private lazy var privateStore = try? OpenOutdoorStorageCoordinatorSpike()
  private lazy var mapDatasetPicker = OpenOutdoorMapDatasetPicker()
  private let mapDatasetQueue = DispatchQueue(label: "org.openoutdoor.map-datasets")
  private let statePackageStore = OpenOutdoorStatePackages()
  private let statePackageQueue = DispatchQueue(label: "org.openoutdoor.state-packages")
  private lazy var statePackagePicker = OpenOutdoorStatePackagePicker(store: statePackageStore, queue: statePackageQueue)
  private lazy var laptopPackages = OpenOutdoorLaptopPackages(store: statePackageStore, queue: statePackageQueue)
  private lazy var laptopDiscovery = OpenOutdoorLaptopDiscovery()
  private lazy var laptopQrScanner = OpenOutdoorLaptopQrScanner()
#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
  private var phase0DiagnosticsInstance: OpenOutdoorPhase0Diagnostics?
  private var phase0PerformanceInstance: OpenOutdoorPhase0PerformanceDiagnostics?
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

#endif

  public func definition() -> ModuleDefinition {
    Name("OpenOutdoorNativeSpikes")
    Events("onLocationPermissionChange")
    Constant("laptopUpdatesEnabled") { self.statePackageStore.laptopUpdatesEnabled }

    AsyncFunction("loadStatePackages") { (registry: String) -> String in
      try self.statePackageStore.load(registry)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("pickStatePackage") { (promise: Promise) in
      self.statePackagePicker.pick(promise)
    }.runOnQueue(.main)
    AsyncFunction("changeStatePackage") { (state: String, action: String) -> String in
      try self.statePackageStore.change(state, action)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("searchStatePackages") { (query: String, filter: String) -> String in
      try self.statePackageStore.search(query, category: filter)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("statePackageDetail") { (id: String) -> String? in
      try self.statePackageStore.detail(id)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("statePackagePlaces") { (bounds: [Double]) -> String in
      try self.statePackageStore.places(bounds)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("connectLaptopPackages") { (address: String, code: String, promise: Promise) in
      self.laptopPackages.connect(address, code: code, promise: promise)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("connectLaptopUpdates") { (address: String, code: String, fingerprint: String, promise: Promise) in
      self.laptopPackages.connect(address, code: code, fingerprint: fingerprint, promise: promise)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("approveLaptopUpdates") { (promise: Promise) in self.laptopPackages.approveSigner(promise) }.runOnQueue(statePackageQueue)
    AsyncFunction("revokeLaptopUpdates") { (promise: Promise) in self.laptopPackages.revokeSigner(promise) }.runOnQueue(statePackageQueue)
    AsyncFunction("refreshLaptopPackages") { (promise: Promise) in self.laptopPackages.refresh(promise) }.runOnQueue(statePackageQueue)
    AsyncFunction("trustedLaptopSigners") { () -> String in
      let values = try self.statePackageStore.trust().trustedFingerprints()
      return String(data: try JSONEncoder().encode(values), encoding: .utf8)!
    }.runOnQueue(statePackageQueue)
    AsyncFunction("revokeStateUpdateSigner") { (fingerprint: String) in
      try self.statePackageStore.trust().revoke(fingerprint)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("downloadLaptopPackage") { (state: String, promise: Promise) in
      self.laptopPackages.download(state, promise: promise)
    }.runOnQueue(statePackageQueue)
    AsyncFunction("laptopPackageProgress") { () -> String in
      try self.laptopPackages.progress()
    }.runOnQueue(statePackageQueue)
    AsyncFunction("cancelLaptopPackage") {
      self.laptopPackages.cancel()
    }.runOnQueue(statePackageQueue)
    AsyncFunction("disconnectLaptopPackages") {
      self.laptopPackages.disconnect()
    }.runOnQueue(statePackageQueue)
    OnDestroy {
      self.statePackageQueue.async { self.laptopPackages.disconnect() }
      DispatchQueue.main.async { self.laptopDiscovery.cancel(); self.laptopQrScanner.cancel() }
    }
    AsyncFunction("discoverLaptopPackages") { (promise: Promise) in
      self.laptopDiscovery.discover(promise)
    }.runOnQueue(.main)
    AsyncFunction("cancelLaptopDiscovery") { self.laptopDiscovery.cancel() }.runOnQueue(.main)
    AsyncFunction("scanLaptopPairingQr") { (promise: Promise) in
      self.laptopQrScanner.scan(promise)
    }.runOnQueue(.main)
    AsyncFunction("cancelLaptopPairingQr") { self.laptopQrScanner.cancel() }.runOnQueue(.main)

    AsyncFunction("pickMapDataset") { (promise: Promise) in
      self.mapDatasetPicker.pick(promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("loadMapDatasets") { () -> String? in
      try OpenOutdoorMapDatasetStore.load()
    }.runOnQueue(mapDatasetQueue)

    AsyncFunction("saveMapDatasets") { (payload: String) in
      try OpenOutdoorMapDatasetStore.save(payload)
    }.runOnQueue(mapDatasetQueue)

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

    AsyncFunction("locationPermission") { (promise: Promise) in
      let status = self.tracker.locationPermission
      // Checking the global service switch may contact locationd; keep it off the UI queue.
      DispatchQueue.global(qos: .userInitiated).async {
        promise.resolve(CLLocationManager.locationServicesEnabled() ? status : "services-disabled")
      }
    }.runOnQueue(.main)

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

#endif
  }
}
