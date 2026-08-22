import Foundation

internal struct OpenOutdoorFilePolicySnapshot: Codable {
  let relativePath: String
  let exists: Bool
  let protection: String?
  let excludedFromBackup: Bool?
  let sizeBytes: Int
}

internal enum OpenOutdoorFilePolicy {
  static func prepareDirectory(
    _ url: URL,
    protection: FileProtectionType
  ) throws {
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    try apply(url, protection: protection)
  }

  static func apply(
    _ url: URL,
    protection: FileProtectionType
  ) throws {
    try FileManager.default.setAttributes(
      [.protectionKey: protection],
      ofItemAtPath: url.path
    )
    var protectedURL = url
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    try protectedURL.setResourceValues(resourceValues)
  }

  static func inspect(
    _ url: URL,
    relativeTo root: URL
  ) throws -> OpenOutdoorFilePolicySnapshot {
    guard FileManager.default.fileExists(atPath: url.path) else {
      return OpenOutdoorFilePolicySnapshot(
        relativePath: url.path.replacingOccurrences(of: root.path, with: ""),
        exists: false,
        protection: nil,
        excludedFromBackup: nil,
        sizeBytes: 0
      )
    }

    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    let protection = (attributes[.protectionKey] as? FileProtectionType)?.rawValue
    let values = try url.resourceValues(forKeys: [.isExcludedFromBackupKey, .fileSizeKey])
    let relativePath = url.path.hasPrefix(root.path)
      ? String(url.path.dropFirst(root.path.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      : url.lastPathComponent

    return OpenOutdoorFilePolicySnapshot(
      relativePath: relativePath,
      exists: true,
      protection: protection,
      excludedFromBackup: values.isExcludedFromBackup,
      sizeBytes: values.fileSize ?? 0
    )
  }
}
