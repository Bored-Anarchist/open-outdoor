import CryptoKit
import ExpoModulesCore
import Foundation
import UIKit
import UniformTypeIdentifiers

/// User-selected reference datasets live outside the recorder database and public bundle.
internal final class OpenOutdoorMapDatasetPicker: NSObject, UIDocumentPickerDelegate {
  private var pending: Promise?
  private let ioQueue = DispatchQueue(label: "org.openoutdoor.map-import")
  static let maximumBytes = 20 * 1024 * 1024

  func pick(promise: Promise) {
    guard pending == nil else {
      promise.reject("IMPORT_BUSY", "A dataset picker is already open.")
      return
    }
    guard
      let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      promise.reject("NO_WINDOW", "No active window is available to import a dataset.")
      return
    }
    var presenter = root
    while let presented = presenter.presentedViewController { presenter = presented }
    // .data also admits .geojson files whose provider does not declare a GeoJSON UTI.
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: false)
    picker.allowsMultipleSelection = false
    picker.delegate = self
    pending = promise
    presenter.present(picker, animated: true)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pending?.resolve(nil as String?)
    pending = nil
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let promise = pending else { return }
    pending = nil
    guard let url = urls.first, ["geojson", "json"].contains(url.pathExtension.lowercased()) else {
      promise.reject("UNSUPPORTED_FORMAT", "Choose a .geojson or .json dataset.")
      return
    }
    ioQueue.async {
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      var readError: Error?
      var result: [String: String]?
      let coordinator = NSFileCoordinator()
      var coordinationError: NSError?
      coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) { readableURL in
        do {
          let handle = try FileHandle(forReadingFrom: readableURL)
          defer { try? handle.close() }
          let data = try handle.read(upToCount: Self.maximumBytes + 1) ?? Data()
          guard data.count <= Self.maximumBytes else {
            throw NSError(domain: "OpenOutdoorMapImport", code: 1,
              userInfo: [NSLocalizedDescriptionKey: "Dataset exceeds the 20 MiB import limit."])
          }
          guard let text = String(data: data, encoding: .utf8) else {
            throw NSError(domain: "OpenOutdoorMapImport", code: 2,
              userInfo: [NSLocalizedDescriptionKey: "Dataset must be UTF-8 GeoJSON."])
          }
          result = ["name": url.lastPathComponent, "text": text,
            "id": SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()]
        } catch { readError = error }
      }
      if let error = coordinationError {
        promise.reject("IMPORT_READ_FAILED", error.localizedDescription)
      } else if let error = readError {
        promise.reject("IMPORT_READ_FAILED", error.localizedDescription)
      } else if let result {
        promise.resolve(result)
      } else {
        promise.reject("IMPORT_READ_FAILED", "Could not read the selected dataset.")
      }
    }
  }
}

internal enum OpenOutdoorMapDatasetStore {
  static let maximumBytes = 50 * 1024 * 1024

  private static func location() throws -> URL {
    let support = try FileManager.default.url(for: .applicationSupportDirectory,
      in: .userDomainMask, appropriateFor: nil, create: true)
    let directory = support.appendingPathComponent("ImportedMapDatasets", isDirectory: true)
    try OpenOutdoorFilePolicy.prepareDirectory(directory, protection: .completeUntilFirstUserAuthentication)
    return directory.appendingPathComponent("datasets.json")
  }

  static func load() throws -> String? {
    let url = try location()
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    let data = try handle.read(upToCount: maximumBytes + 1) ?? Data()
    guard data.count <= maximumBytes, let payload = String(data: data, encoding: .utf8) else {
      throw NSError(domain: "OpenOutdoorMapImport", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Saved dataset storage is invalid or too large."])
    }
    return payload
  }

  static func save(_ payload: String) throws {
    let data = Data(payload.utf8)
    guard data.count <= maximumBytes,
      let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      root["schemaVersion"] as? Int == 1,
      let datasets = root["datasets"] as? [[String: Any]], datasets.count <= 5
    else {
      throw NSError(domain: "OpenOutdoorMapImport", code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Imported dataset storage is invalid or exceeds its limit."])
    }
    let url = try location()
    try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    try OpenOutdoorFilePolicy.apply(url, protection: .completeUntilFirstUserAuthentication)
  }
}
