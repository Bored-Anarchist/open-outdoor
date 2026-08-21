import CoreLocation
import CoreMotion
import Foundation

internal enum OpenOutdoorTrackingMode: String, Codable {
  case balanced
  case endurance
  case highAccuracy = "high-accuracy"
}

internal enum OpenOutdoorTrackerError: Error {
  case alreadyTracking
  case notTracking
}

private struct OpenOutdoorSpoolObservation: Codable {
  let sequence: Int64
  let recordedAt: Date
  let longitude: Double
  let latitude: Double
  let horizontalAccuracyM: Double
  let altitudeM: Double
  let pressureKPa: Double?
}

private final class OpenOutdoorActiveSpool {
  private let fileURL: URL
  private var fileHandle: FileHandle

  init(sessionID: UUID) throws {
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
    fileHandle = try FileHandle(forWritingTo: fileURL)
    try fileHandle.seekToEnd()
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

  func close() throws {
    try fileHandle.synchronize()
    try fileHandle.close()
  }
}

internal final class OpenOutdoorTrackerSpike: NSObject, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let altimeter = CMAltimeter()
  private var spool: OpenOutdoorActiveSpool?
  private var sequence: Int64 = 0
  private var currentPressureKPa: Double?
  private(set) var currentSessionID: UUID?
  private(set) var lastError: String?

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
  }

  func requestAlwaysAuthorization() {
    locationManager.requestAlwaysAuthorization()
  }

  func start(mode: OpenOutdoorTrackingMode, sessionID: UUID = UUID()) throws -> String {
    guard spool == nil else { throw OpenOutdoorTrackerError.alreadyTracking }
    guard locationManager.authorizationStatus == .authorizedAlways else {
      throw NSError(
        domain: "OpenOutdoorTracker",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Always location authorization is required"]
      )
    }

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

    sequence = 0
    lastError = nil
    spool = try OpenOutdoorActiveSpool(sessionID: sessionID)
    currentSessionID = sessionID
    locationManager.startUpdatingLocation()
    if CMAltimeter.isRelativeAltitudeAvailable() {
      altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, _ in
        self?.currentPressureKPa = data?.pressure.doubleValue
      }
    }
    return sessionID.uuidString
  }

  func stop() throws -> Int64 {
    guard spool != nil else { throw OpenOutdoorTrackerError.notTracking }
    locationManager.stopUpdatingLocation()
    altimeter.stopRelativeAltitudeUpdates()
    defer {
      spool = nil
      currentPressureKPa = nil
      currentSessionID = nil
    }
    do {
      try spool?.close()
    } catch {
      lastError = error.localizedDescription
      throw error
    }
    return sequence
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    for location in locations where location.horizontalAccuracy >= 0 {
      sequence += 1
      let observation = OpenOutdoorSpoolObservation(
        sequence: sequence,
        recordedAt: location.timestamp,
        longitude: location.coordinate.longitude,
        latitude: location.coordinate.latitude,
        horizontalAccuracyM: location.horizontalAccuracy,
        altitudeM: location.altitude,
        pressureKPa: currentPressureKPa
      )
      do {
        try spool?.append(observation)
      } catch {
        lastError = error.localizedDescription
        manager.stopUpdatingLocation()
        altimeter.stopRelativeAltitudeUpdates()
        try? spool?.close()
        spool = nil
        currentPressureKPa = nil
        currentSessionID = nil
      }
    }
  }
}
