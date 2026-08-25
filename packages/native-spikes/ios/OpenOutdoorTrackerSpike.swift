import CoreLocation
import CoreMotion
import Foundation

internal enum OpenOutdoorTrackingMode: String, Codable {
  case balanced
  case endurance
  case highAccuracy = "high-accuracy"
}

internal enum OpenOutdoorTrackerError: LocalizedError {
  case alreadyTracking
  case alreadyPaused
  case notPaused
  case notTracking
  case recoverableSessionExists
  case noRecoverableSession
  case invalidSpool(String)

  var errorDescription: String? {
    switch self {
    case .alreadyTracking:
      return "A tracking session is already active"
    case .alreadyPaused:
      return "The tracking session is already paused"
    case .notPaused:
      return "The tracking session is not paused"
    case .notTracking:
      return "No tracking session is active"
    case .recoverableSessionExists:
      return "Recover or discard the existing interrupted session before starting another"
    case .noRecoverableSession:
      return "No interrupted tracking session is available"
    case .invalidSpool(let reason):
      return "The interrupted tracking spool is invalid: \(reason)"
    }
  }
}

private struct OpenOutdoorSpoolObservation: Codable {
  let sequence: Int64
  let recordedAt: Date
  let longitude: Double
  let latitude: Double
  let horizontalAccuracyM: Double
  let verticalAccuracyM: Double?
  let altitudeM: Double
  let pressureKPa: Double?
  let segment: Int?
  let paused: Bool?
}

private struct OpenOutdoorBridgeObservation: Codable {
  let sequence: Int64
  let coordinate: [Double]
  let recordedAt: Date
  let horizontalAccuracyM: Double
  let verticalAccuracyM: Double?
  let altitudeM: Double
  let pressureKPa: Double?
  let segment: Int
  let paused: Bool
}

private struct OpenOutdoorTrackingBatchPayload: Codable {
  let sessionId: String
  let mode: String
  let firstSequence: Int64
  let createdAt: Date
  let observations: [OpenOutdoorBridgeObservation]
}

private struct OpenOutdoorActiveSessionManifest: Codable {
  let version: Int
  let sessionID: UUID
  let mode: OpenOutdoorTrackingMode
  let spoolFileName: String
  let startedAt: Date
}

internal struct OpenOutdoorTrackingInspection: Codable {
  let sessionId: String
  let mode: String
  let highestSequence: Int64
  let validObservationCount: Int
  let highestSegment: Int
  let tornFinalLineIgnored: Bool
  let spoolFileName: String
  let recording: Bool

  func json() throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(self), as: UTF8.self)
  }
}

internal struct OpenOutdoorTrackingPolicyReport: Codable {
  let expectedProtection: String
  let expectedExcludedFromBackup: Bool
  let artifacts: [OpenOutdoorFilePolicySnapshot]
  let passed: Bool
}

private final class OpenOutdoorActiveSpool {
  private static let manifestFileName = "active-session.json"

  private let directory: URL
  private let fileURL: URL
  private let manifest: OpenOutdoorActiveSessionManifest
  private var fileHandle: FileHandle

  private static func activeDirectory() throws -> URL {
    let applicationSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = applicationSupport
      .appendingPathComponent("Tracking", isDirectory: true)
      .appendingPathComponent("Active", isDirectory: true)
    try OpenOutdoorFilePolicy.prepareDirectory(
      directory,
      protection: .completeUntilFirstUserAuthentication
    )
    return directory
  }

  private static func manifestURL(in directory: URL) -> URL {
    directory.appendingPathComponent(manifestFileName)
  }

  private static func writeManifest(
    _ manifest: OpenOutdoorActiveSessionManifest,
    in directory: URL
  ) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let url = manifestURL(in: directory)
    try encoder.encode(manifest).write(to: url, options: .atomic)
    try OpenOutdoorFilePolicy.apply(
      url,
      protection: .completeUntilFirstUserAuthentication
    )
  }

  private static func readManifest(in directory: URL) throws -> OpenOutdoorActiveSessionManifest? {
    let url = manifestURL(in: directory)
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    let manifest = try JSONDecoder().decode(
      OpenOutdoorActiveSessionManifest.self,
      from: Data(contentsOf: url)
    )
    guard manifest.version == 1 else {
      throw OpenOutdoorTrackerError.invalidSpool("unsupported manifest version")
    }
    guard
      URL(fileURLWithPath: manifest.spoolFileName).lastPathComponent == manifest.spoolFileName,
      manifest.spoolFileName == "\(manifest.sessionID.uuidString).jsonl"
    else {
      throw OpenOutdoorTrackerError.invalidSpool("manifest spool path is unsafe")
    }
    return manifest
  }

  private static func inspect(
    manifest: OpenOutdoorActiveSessionManifest,
    directory: URL,
    recording: Bool
  ) throws -> OpenOutdoorTrackingInspection {
    let spoolURL = directory.appendingPathComponent(manifest.spoolFileName)
    guard FileManager.default.fileExists(atPath: spoolURL.path) else {
      throw OpenOutdoorTrackerError.invalidSpool("manifest spool is missing")
    }

    let data = try Data(contentsOf: spoolURL)
    let endsInNewline = data.isEmpty || data.last == 0x0A
    let lines = data.split(separator: 0x0A, omittingEmptySubsequences: true)
    var expectedSequence: Int64 = 1
    var validCount = 0
    var highestSegment = 1
    var tornFinalLineIgnored = false

    for (index, line) in lines.enumerated() {
      do {
        let observation = try JSONDecoder().decode(
          OpenOutdoorSpoolObservation.self,
          from: Data(line)
        )
        guard observation.sequence == expectedSequence else {
          throw OpenOutdoorTrackerError.invalidSpool(
            "expected sequence \(expectedSequence), found \(observation.sequence)"
          )
        }
        expectedSequence += 1
        validCount += 1
        highestSegment = max(highestSegment, observation.segment ?? 1)
      } catch {
        if index == lines.count - 1 && !endsInNewline {
          tornFinalLineIgnored = true
          break
        }
        if let trackerError = error as? OpenOutdoorTrackerError {
          throw trackerError
        }
        throw OpenOutdoorTrackerError.invalidSpool(
          "observation \(index + 1) cannot be decoded"
        )
      }
    }

    return OpenOutdoorTrackingInspection(
      sessionId: manifest.sessionID.uuidString,
      mode: manifest.mode.rawValue,
      highestSequence: Int64(validCount),
      highestSegment: highestSegment,
      validObservationCount: validCount,
      tornFinalLineIgnored: tornFinalLineIgnored,
      spoolFileName: manifest.spoolFileName,
      recording: recording
    )
  }

  init(sessionID: UUID, mode: OpenOutdoorTrackingMode) throws {
    directory = try Self.activeDirectory()
    guard try Self.readManifest(in: directory) == nil else {
      throw OpenOutdoorTrackerError.recoverableSessionExists
    }

    fileURL = directory.appendingPathComponent("\(sessionID.uuidString).jsonl")
    if !FileManager.default.fileExists(atPath: fileURL.path) {
      guard FileManager.default.createFile(atPath: fileURL.path, contents: nil) else {
        throw CocoaError(.fileWriteUnknown)
      }
    }
    try OpenOutdoorFilePolicy.apply(
      fileURL,
      protection: .completeUntilFirstUserAuthentication
    )

    manifest = OpenOutdoorActiveSessionManifest(
      version: 1,
      sessionID: sessionID,
      mode: mode,
      spoolFileName: fileURL.lastPathComponent,
      startedAt: Date()
    )
    try Self.writeManifest(manifest, in: directory)
    fileHandle = try FileHandle(forWritingTo: fileURL)
    try fileHandle.seekToEnd()
  }

  private init(
    directory: URL,
    manifest: OpenOutdoorActiveSessionManifest
  ) throws {
    self.directory = directory
    self.manifest = manifest
    fileURL = directory.appendingPathComponent(manifest.spoolFileName)
    try OpenOutdoorFilePolicy.apply(
      fileURL,
      protection: .completeUntilFirstUserAuthentication
    )
    fileHandle = try FileHandle(forWritingTo: fileURL)
    try fileHandle.seekToEnd()
  }

  static func latestInspection(recording: Bool = false) throws -> OpenOutdoorTrackingInspection? {
    let directory = try activeDirectory()
    guard let manifest = try readManifest(in: directory) else { return nil }
    return try inspect(manifest: manifest, directory: directory, recording: recording)
  }

  static func batchJSON(afterSequence: Int64) throws -> String? {
    guard afterSequence >= 0 else {
      throw OpenOutdoorTrackerError.invalidSpool("committed sequence cannot be negative")
    }
    let directory = try activeDirectory()
    guard let manifest = try readManifest(in: directory) else {
      throw OpenOutdoorTrackerError.noRecoverableSession
    }
    let spoolURL = directory.appendingPathComponent(manifest.spoolFileName)
    let data = try Data(contentsOf: spoolURL)
    let endsInNewline = data.isEmpty || data.last == 0x0A
    let lines = data.split(separator: 0x0A, omittingEmptySubsequences: true)
    var observations: [OpenOutdoorBridgeObservation] = []
    for (index, line) in lines.enumerated() {
      do {
        let observation = try JSONDecoder().decode(
          OpenOutdoorSpoolObservation.self,
          from: Data(line)
        )
        if observation.sequence > afterSequence {
          observations.append(
            OpenOutdoorBridgeObservation(
              sequence: observation.sequence,
              coordinate: [observation.longitude, observation.latitude],
              recordedAt: observation.recordedAt,
              horizontalAccuracyM: observation.horizontalAccuracyM,
              verticalAccuracyM: observation.verticalAccuracyM,
              altitudeM: observation.altitudeM,
              pressureKPa: observation.pressureKPa,
              segment: observation.segment ?? 1,
              paused: observation.paused ?? false
            )
          )
          if observations.count >= 256 { break }
        }
      } catch {
        if index == lines.count - 1 && !endsInNewline { break }
        throw OpenOutdoorTrackerError.invalidSpool(
          "observation \(index + 1) cannot be decoded for batch delivery"
        )
      }
    }
    guard let first = observations.first else { return nil }
    let payload = OpenOutdoorTrackingBatchPayload(
      sessionId: manifest.sessionID.uuidString,
      mode: manifest.mode.rawValue,
      firstSequence: first.sequence,
      createdAt: Date(),
      observations: observations
    )
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(payload), as: UTF8.self)
  }

  static func activePolicyReport() throws -> OpenOutdoorTrackingPolicyReport {
    let directory = try activeDirectory()
    guard let manifest = try readManifest(in: directory) else {
      throw OpenOutdoorTrackerError.noRecoverableSession
    }
    let applicationSupport = directory.deletingLastPathComponent().deletingLastPathComponent()
    let expectedProtection = FileProtectionType.completeUntilFirstUserAuthentication.rawValue
    let artifacts = try [
      OpenOutdoorFilePolicy.inspect(directory, relativeTo: applicationSupport),
      OpenOutdoorFilePolicy.inspect(manifestURL(in: directory), relativeTo: applicationSupport),
      OpenOutdoorFilePolicy.inspect(
        directory.appendingPathComponent(manifest.spoolFileName),
        relativeTo: applicationSupport
      ),
    ]
    return OpenOutdoorTrackingPolicyReport(
      expectedProtection: expectedProtection,
      expectedExcludedFromBackup: true,
      artifacts: artifacts,
      passed: artifacts.allSatisfy {
        $0.exists && $0.protection == expectedProtection && $0.excludedFromBackup == true
      }
    )
  }
  static func recover() throws -> (OpenOutdoorActiveSpool, OpenOutdoorTrackingInspection, OpenOutdoorTrackingMode) {

    let directory = try activeDirectory()
    guard let manifest = try readManifest(in: directory) else {
      throw OpenOutdoorTrackerError.noRecoverableSession
    }
    let inspection = try inspect(manifest: manifest, directory: directory, recording: true)
    return (
      try OpenOutdoorActiveSpool(directory: directory, manifest: manifest),
      inspection,
      manifest.mode
    )
  }

  static func discardRecovery() throws -> OpenOutdoorTrackingInspection {
    let directory = try activeDirectory()
    guard let manifest = try readManifest(in: directory) else {
      throw OpenOutdoorTrackerError.noRecoverableSession
    }
    let inspection = try inspect(manifest: manifest, directory: directory, recording: false)
    try FileManager.default.removeItem(at: directory.appendingPathComponent(manifest.spoolFileName))
    try FileManager.default.removeItem(at: manifestURL(in: directory))
    return inspection
  }
  static func seal(sessionID: String, throughSequence: Int64) throws {
    let directory = try activeDirectory()
    guard let manifest = try readManifest(in: directory) else {
      throw OpenOutdoorTrackerError.noRecoverableSession
    }
    let inspection = try inspect(manifest: manifest, directory: directory, recording: false)
    guard manifest.sessionID.uuidString == sessionID, inspection.highestSequence == throughSequence else {
      throw OpenOutdoorTrackerError.invalidSpool("seal checkpoint does not cover the complete session")
    }
    try FileManager.default.removeItem(at: directory.appendingPathComponent(manifest.spoolFileName))
    try FileManager.default.removeItem(at: manifestURL(in: directory))
  }

  func append(_ observation: OpenOutdoorSpoolObservation) throws {
    var encoded = try JSONEncoder().encode(observation)
    encoded.append(0x0A)
    try fileHandle.write(contentsOf: encoded)
    try fileHandle.synchronize()
    try OpenOutdoorFilePolicy.apply(
      fileURL,
      protection: .completeUntilFirstUserAuthentication
    )
  }

  func close(clearManifest: Bool) throws {
    try fileHandle.synchronize()
    try fileHandle.close()
    if clearManifest {
      let url = Self.manifestURL(in: directory)
      if FileManager.default.fileExists(atPath: url.path) {
        try FileManager.default.removeItem(at: url)
      }
    }
  }
}

internal final class OpenOutdoorTrackerSpike: NSObject, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let altimeter = CMAltimeter()
  private var spool: OpenOutdoorActiveSpool?
  private var sequence: Int64 = 0
  private var currentPressureKPa: Double?
  private var segment = 1
  private(set) var currentSessionID: UUID?
  private(set) var currentMode: OpenOutdoorTrackingMode?
  private(set) var isPaused = false
  private(set) var lastError: String?
  private(set) var observedWeakGPS = false

  var isTracking: Bool {
    spool != nil
  }

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.activityType = .fitness
    locationManager.allowsBackgroundLocationUpdates = true
    locationManager.pausesLocationUpdatesAutomatically = false
    locationManager.showsBackgroundLocationIndicator = true
    do {
      _ = try OpenOutdoorActiveSpool.latestInspection()
    } catch {
      lastError = error.localizedDescription
    }
  }

  private func requireAlwaysAuthorization() throws {
    guard locationManager.authorizationStatus == .authorizedAlways else {
      throw NSError(
        domain: "OpenOutdoorTracker",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Always location authorization is required"]
      )
    }
  }

  private func startSensors(mode: OpenOutdoorTrackingMode) {
    isPaused = false
    switch mode {
    case .endurance:
      locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
      locationManager.distanceFilter = 25
    case .balanced:
      locationManager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
      locationManager.distanceFilter = 10
    case .highAccuracy:
      locationManager.desiredAccuracy = kCLLocationAccuracyBest
      locationManager.distanceFilter = kCLDistanceFilterNone
    }

    locationManager.startUpdatingLocation()
    if CMAltimeter.isRelativeAltitudeAvailable() {
      altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, _ in
        self?.currentPressureKPa = data?.pressure.doubleValue
      }
    }
  }

  private func stopSensors() {
    locationManager.stopUpdatingLocation()
    altimeter.stopRelativeAltitudeUpdates()
  }

  func requestAlwaysAuthorization() {
    locationManager.requestAlwaysAuthorization()
  }

  func start(mode: OpenOutdoorTrackingMode, sessionID: UUID = UUID()) throws -> String {
    guard spool == nil else { throw OpenOutdoorTrackerError.alreadyTracking }
    try requireAlwaysAuthorization()

    sequence = 0
    segment = 1
    lastError = nil
    observedWeakGPS = false
    spool = try OpenOutdoorActiveSpool(sessionID: sessionID, mode: mode)
    currentSessionID = sessionID
    currentMode = mode
    startSensors(mode: mode)
    return sessionID.uuidString
  }

  func inspectLatestSession() throws -> String? {
    if let currentSessionID, let currentMode {
      let inspection = try OpenOutdoorActiveSpool.latestInspection(recording: true)
      guard
        inspection?.sessionId == currentSessionID.uuidString,
        inspection?.mode == currentMode.rawValue
      else {
        throw OpenOutdoorTrackerError.invalidSpool("active state does not match its manifest")
      }
      return try inspection?.json()
    }
    return try OpenOutdoorActiveSpool.latestInspection()?.json()
  }

  func readBatch(afterSequence: Int64) throws -> String? {
    try OpenOutdoorActiveSpool.batchJSON(afterSequence: afterSequence)
  }

  func inspectActiveFilePolicy() throws -> OpenOutdoorTrackingPolicyReport {
    guard isTracking else {
      throw OpenOutdoorTrackerError.notTracking
    }
    return try OpenOutdoorActiveSpool.activePolicyReport()
  }

  func recover() throws -> String {
    guard spool == nil else { throw OpenOutdoorTrackerError.alreadyTracking }
    try requireAlwaysAuthorization()

    let recovered = try OpenOutdoorActiveSpool.recover()
    spool = recovered.0
    sequence = recovered.1.highestSequence
    segment = recovered.1.highestSegment + 1
    currentSessionID = UUID(uuidString: recovered.1.sessionId)
    currentMode = recovered.2
    lastError = nil
    observedWeakGPS = false
    startSensors(mode: recovered.2)
    return try recovered.1.json()
  }

  func discardRecovery() throws -> String {
    guard spool == nil else { throw OpenOutdoorTrackerError.alreadyTracking }
    return try OpenOutdoorActiveSpool.discardRecovery().json()
  }

  func seal(sessionID: String, throughSequence: Int64) throws {
    try OpenOutdoorActiveSpool.seal(sessionID: sessionID, throughSequence: throughSequence)
  }

  func pause() throws -> Int64 {
    guard spool != nil else { throw OpenOutdoorTrackerError.notTracking }
    guard !isPaused else { throw OpenOutdoorTrackerError.alreadyPaused }
    stopSensors()
    isPaused = true
    return sequence
  }

  func resume() throws -> Int64 {
    guard spool != nil, let currentMode else { throw OpenOutdoorTrackerError.notTracking }
    guard isPaused else { throw OpenOutdoorTrackerError.notPaused }
    segment += 1
    startSensors(mode: currentMode)
    return sequence
  }

  func stop() throws -> Int64 {
    guard spool != nil else { throw OpenOutdoorTrackerError.notTracking }
    stopSensors()
    defer {
      spool = nil
      currentPressureKPa = nil
      currentSessionID = nil
      currentMode = nil
      isPaused = false
    }
    do {
      try spool?.close(clearManifest: false)
    } catch {
      lastError = error.localizedDescription
      throw error
    }
    return sequence
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    for location in locations where location.horizontalAccuracy >= 0 {
      if location.horizontalAccuracy > 50 { observedWeakGPS = true }
      sequence += 1
      let observation = OpenOutdoorSpoolObservation(
        sequence: sequence,
        recordedAt: location.timestamp,
        longitude: location.coordinate.longitude,
        latitude: location.coordinate.latitude,
        horizontalAccuracyM: location.horizontalAccuracy,
        verticalAccuracyM: location.verticalAccuracy >= 0 ? location.verticalAccuracy : nil,
        altitudeM: location.altitude,
        pressureKPa: currentPressureKPa,
        segment: segment,
        paused: false
      )
      do {
        try spool?.append(observation)
      } catch {
        lastError = error.localizedDescription
        stopSensors()
        try? spool?.close(clearManifest: false)
        spool = nil
        currentPressureKPa = nil
        currentSessionID = nil
        currentMode = nil
        isPaused = false
      }
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard isTracking else { return }
    guard manager.authorizationStatus == .authorizedAlways else {
      lastError = "Always location authorization was lost during recording"
      stopSensors()
      try? spool?.close(clearManifest: false)
      spool = nil
      currentPressureKPa = nil
      currentSessionID = nil
      currentMode = nil
      isPaused = false
      return
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    lastError = error.localizedDescription
    if let locationError = error as? CLError, locationError.code == .locationUnknown {
      observedWeakGPS = true
      return
    }
    stopSensors()
  }
}
