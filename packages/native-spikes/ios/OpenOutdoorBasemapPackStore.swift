import CryptoKit
import Foundation

private struct OpenOutdoorBasemapFormat: Codable {
  let type: String
  let specVersion: Int
  let minZoom: Int
  let maxZoom: Int
}

private struct OpenOutdoorBasemapCoverage: Codable {
  let bounds: [Double]
}

private struct OpenOutdoorBasemapCompatibility: Codable {
  let minimumAppVersion: String
  let styleSchemaVersion: Int
}

private struct OpenOutdoorBasemapPackManifest: Codable {
  let schemaVersion: Int
  let kind: String
  let packId: String
  let version: String
  let displayName: String
  let fileName: String
  let byteLength: Int
  let sha256: String
  let format: OpenOutdoorBasemapFormat
  let coverage: OpenOutdoorBasemapCoverage
  let compatibility: OpenOutdoorBasemapCompatibility
  let attribution: [String]
}

private struct OpenOutdoorActiveBasemapPointer: Codable {
  let manifest: OpenOutdoorBasemapPackManifest
  let relativeDirectory: String
}

private struct OpenOutdoorBasemapVerification: Codable {
  let bytes: Int
  let sha256: String
}

private struct OpenOutdoorInstalledBasemap: Codable {
  let uri: String
  let manifest: OpenOutdoorBasemapPackManifest
  let verification: OpenOutdoorBasemapVerification
}

internal final class OpenOutdoorBasemapPackStore {
  private let fileManager = FileManager.default
  private let root: URL
  private let installed: URL
  private let staging: URL
  private let pointer: URL
  private let protection = FileProtectionType.completeUntilFirstUserAuthentication
  private let reserveBytes = 256 * 1024 * 1024

  init() throws {
    let applicationSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    root = applicationSupport.appendingPathComponent("Basemaps", isDirectory: true)
    installed = root.appendingPathComponent("Installed", isDirectory: true)
    staging = root.appendingPathComponent("Staging", isDirectory: true)
    pointer = root.appendingPathComponent("active.json", isDirectory: false)
    try OpenOutdoorFilePolicy.prepareDirectory(root, protection: protection)
    try OpenOutdoorFilePolicy.prepareDirectory(installed, protection: protection)
    try OpenOutdoorFilePolicy.prepareDirectory(staging, protection: protection)
    try clearAbandonedStaging()
  }

  func activePackJSON() throws -> String? {
    guard fileManager.fileExists(atPath: pointer.path) else { return nil }
    let active = try JSONDecoder().decode(
      OpenOutdoorActiveBasemapPointer.self,
      from: Data(contentsOf: pointer)
    )
    let archive = archiveURL(for: active)
    guard isChild(archive, of: installed) else {
      throw error(14, "Stored basemap pointer is invalid.")
    }
    guard fileManager.fileExists(atPath: archive.path) else { return nil }
    let verification = try verifyArchive(archive, manifest: active.manifest)
    return try encode(
      OpenOutdoorInstalledBasemap(
        uri: archive.absoluteString,
        manifest: active.manifest,
        verification: verification
      )
    )
  }

  func importPack(sourceURI: String, manifestJSON: String) throws -> String {
    guard let source = URL(string: sourceURI), source.isFileURL else {
      throw error(2, "Detailed basemap imports must be local files.")
    }
    let values = try source.resourceValues(forKeys: [.isRegularFileKey])
    guard values.isRegularFile == true, source.lastPathComponent.hasSuffix(".pmtiles") else {
      throw error(3, "Select the raw .pmtiles detailed basemap file.")
    }

    let manifest = try decodeAndValidateManifest(manifestJSON)
    try requireFreeSpace(for: manifest.byteLength)

    let stagingDirectory = staging.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try OpenOutdoorFilePolicy.prepareDirectory(stagingDirectory, protection: protection)
    var committed = false
    defer {
      if !committed { try? fileManager.removeItem(at: stagingDirectory) }
    }

    let stagedArchive = stagingDirectory.appendingPathComponent(manifest.fileName)
    try copyAndVerify(source, to: stagedArchive, manifest: manifest)
    try OpenOutdoorFilePolicy.apply(stagedArchive, protection: protection)

    let baseDirectoryName = "\(manifest.packId)-\(manifest.version)-\(manifest.sha256.prefix(12))"
    var installedDirectory = installed.appendingPathComponent(baseDirectoryName, isDirectory: true)
    if fileManager.fileExists(atPath: installedDirectory.path) {
      let existingArchive = installedDirectory.appendingPathComponent(manifest.fileName)
      if (try? verifyArchive(existingArchive, manifest: manifest)) != nil {
        try fileManager.removeItem(at: stagingDirectory)
      } else {
        installedDirectory = installed.appendingPathComponent(
          "\(baseDirectoryName)-\(UUID().uuidString)",
          isDirectory: true
        )
        try fileManager.moveItem(at: stagingDirectory, to: installedDirectory)
      }
    } else {
      try fileManager.moveItem(at: stagingDirectory, to: installedDirectory)
    }
    committed = true
    try OpenOutdoorFilePolicy.apply(installedDirectory, protection: protection)

    let active = OpenOutdoorActiveBasemapPointer(
      manifest: manifest,
      relativeDirectory: installedDirectory.lastPathComponent
    )
    try JSONEncoder().encode(active).write(to: pointer, options: .atomic)
    try OpenOutdoorFilePolicy.apply(pointer, protection: protection)
    try? removeInactiveInstalledDirectories(keeping: installedDirectory)

    let archive = installedDirectory.appendingPathComponent(manifest.fileName)
    return try encode(
      OpenOutdoorInstalledBasemap(
        uri: archive.absoluteString,
        manifest: manifest,
        verification: OpenOutdoorBasemapVerification(
          bytes: manifest.byteLength,
          sha256: manifest.sha256
        )
      )
    )
  }

  func removeActivePack() throws {
    guard fileManager.fileExists(atPath: pointer.path) else { return }
    let active = try JSONDecoder().decode(
      OpenOutdoorActiveBasemapPointer.self,
      from: Data(contentsOf: pointer)
    )
    try fileManager.removeItem(at: pointer)
    let directory = installed.appendingPathComponent(active.relativeDirectory, isDirectory: true)
    if isChild(directory, of: installed), fileManager.fileExists(atPath: directory.path) {
      try fileManager.removeItem(at: directory)
    }
  }

  private func decodeAndValidateManifest(_ json: String) throws -> OpenOutdoorBasemapPackManifest {
    guard let data = json.data(using: .utf8) else { throw error(5, "Invalid basemap manifest.") }
    let object = try JSONSerialization.jsonObject(with: data)
    guard let rootObject = object as? [String: Any] else {
      throw error(5, "Invalid basemap manifest.")
    }
    try requireExactKeys(
      rootObject,
      ["schemaVersion", "kind", "packId", "version", "displayName", "fileName", "byteLength", "sha256", "format", "coverage", "compatibility", "attribution"],
      name: "manifest"
    )
    guard let formatObject = rootObject["format"] as? [String: Any],
          let coverageObject = rootObject["coverage"] as? [String: Any],
          let compatibilityObject = rootObject["compatibility"] as? [String: Any] else {
      throw error(5, "Invalid basemap manifest structure.")
    }
    try requireExactKeys(formatObject, ["type", "specVersion", "minZoom", "maxZoom"], name: "format")
    try requireExactKeys(coverageObject, ["bounds"], name: "coverage")
    try requireExactKeys(
      compatibilityObject,
      ["minimumAppVersion", "styleSchemaVersion"],
      name: "compatibility"
    )

    let manifest = try JSONDecoder().decode(OpenOutdoorBasemapPackManifest.self, from: data)
    guard manifest.schemaVersion == 1,
          manifest.kind == "basemap",
          manifest.format.type == "pmtiles",
          manifest.format.specVersion == 3,
          manifest.format.minZoom >= 0,
          manifest.format.maxZoom >= manifest.format.minZoom,
          manifest.format.maxZoom <= 22,
          manifest.compatibility.styleSchemaVersion == 1,
          manifest.byteLength > 0,
          manifest.sha256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
          manifest.packId.range(of: "^[a-z0-9]+(?:[.-][a-z0-9]+)*$", options: .regularExpression) != nil,
          manifest.version.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]*$", options: .regularExpression) != nil,
          manifest.fileName.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]*[.]pmtiles$", options: .regularExpression) != nil,
          manifest.coverage.bounds.count == 4,
          manifest.coverage.bounds[0] >= -180,
          manifest.coverage.bounds[2] <= 180,
          manifest.coverage.bounds[1] >= -90,
          manifest.coverage.bounds[3] <= 90,
          manifest.coverage.bounds[0] < manifest.coverage.bounds[2],
          manifest.coverage.bounds[1] < manifest.coverage.bounds[3],
          !manifest.attribution.isEmpty,
          manifest.attribution.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
      throw error(6, "The detailed basemap manifest is unsupported or malformed.")
    }
    guard appVersionSupports(manifest.compatibility.minimumAppVersion) else {
      throw error(7, "This detailed basemap requires a newer app version.")
    }
    return manifest
  }

  private func requireExactKeys(
    _ object: [String: Any],
    _ expected: Set<String>,
    name: String
  ) throws {
    guard Set(object.keys) == expected else {
      throw error(5, "Unexpected fields in the basemap \(name).")
    }
  }

  private func appVersionSupports(_ minimumVersion: String) -> Bool {
    let current = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    return current.compare(minimumVersion, options: .numeric) != .orderedAscending
  }

  private func requireFreeSpace(for incomingBytes: Int) throws {
    let attributes = try fileManager.attributesOfFileSystem(forPath: root.path)
    let available = (attributes[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
    let required = Int64(incomingBytes) + Int64(reserveBytes)
    guard available >= required else {
      throw error(8, "Not enough free space. Keep at least 256 MiB free after importing the map.")
    }
  }

  private func copyAndVerify(
    _ source: URL,
    to destination: URL,
    manifest: OpenOutdoorBasemapPackManifest
  ) throws {
    guard fileManager.createFile(atPath: destination.path, contents: nil) else {
      throw error(9, "Could not create the basemap staging file.")
    }
    let input = try FileHandle(forReadingFrom: source)
    let output = try FileHandle(forWritingTo: destination)
    defer {
      try? input.close()
      try? output.close()
    }
    var hasher = SHA256()
    var total = 0
    while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty {
      total += chunk.count
      guard total <= manifest.byteLength else {
        throw error(10, "The selected basemap has the wrong byte length.")
      }
      hasher.update(data: chunk)
      try output.write(contentsOf: chunk)
    }
    try output.synchronize()
    let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    guard total == manifest.byteLength, digest == manifest.sha256 else {
      throw error(11, "The selected basemap failed checksum verification.")
    }
    try requirePMTilesHeader(destination)
  }

  private func verifyArchive(
    _ archive: URL,
    manifest: OpenOutdoorBasemapPackManifest
  ) throws -> OpenOutdoorBasemapVerification {
    try requirePMTilesHeader(archive)
    let input = try FileHandle(forReadingFrom: archive)
    defer { try? input.close() }
    var hasher = SHA256()
    var total = 0
    while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty {
      total += chunk.count
      guard total <= manifest.byteLength else { throw error(10, "Stored basemap size changed.") }
      hasher.update(data: chunk)
    }
    let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    guard total == manifest.byteLength, digest == manifest.sha256 else {
      throw error(11, "Stored basemap verification failed.")
    }
    return OpenOutdoorBasemapVerification(bytes: total, sha256: digest)
  }

  private func requirePMTilesHeader(_ archive: URL) throws {
    let input = try FileHandle(forReadingFrom: archive)
    defer { try? input.close() }
    let header = try input.read(upToCount: 8) ?? Data()
    guard header.count == 8,
          Data(header.prefix(7)) == Data("PMTiles".utf8),
          header[7] == 3 else {
      throw error(12, "The selected file is not a supported PMTiles v3 archive.")
    }
  }

  private func archiveURL(for active: OpenOutdoorActiveBasemapPointer) -> URL {
    installed
      .appendingPathComponent(active.relativeDirectory, isDirectory: true)
      .appendingPathComponent(active.manifest.fileName, isDirectory: false)
  }

  private func clearAbandonedStaging() throws {
    for entry in try fileManager.contentsOfDirectory(
      at: staging,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ) {
      guard isChild(entry, of: staging) else { continue }
      try fileManager.removeItem(at: entry)
    }
  }

  private func removeInactiveInstalledDirectories(keeping activeDirectory: URL) throws {
    for entry in try fileManager.contentsOfDirectory(
      at: installed,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ) where entry.standardizedFileURL != activeDirectory.standardizedFileURL {
      guard isChild(entry, of: installed) else { continue }
      try fileManager.removeItem(at: entry)
    }
  }

  private func isChild(_ candidate: URL, of parent: URL) -> Bool {
    let parentPath = parent.standardizedFileURL.path + "/"
    return candidate.standardizedFileURL.path.hasPrefix(parentPath)
  }

  private func encode<T: Encodable>(_ value: T) throws -> String {
    let data = try JSONEncoder().encode(value)
    guard let json = String(data: data, encoding: .utf8) else {
      throw error(13, "Could not encode the basemap result.")
    }
    return json
  }

  private func error(_ code: Int, _ message: String) -> NSError {
    NSError(
      domain: "OpenOutdoorBasemap",
      code: code,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
}
