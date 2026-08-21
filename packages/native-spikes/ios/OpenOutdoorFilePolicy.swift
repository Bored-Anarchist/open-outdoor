import Foundation

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
}
