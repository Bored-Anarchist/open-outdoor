import Foundation
import SQLite3

internal enum OpenOutdoorStorageError: Error {
  case pathEscapesRoot
  case sqlite(code: Int32, message: String)
}

internal final class OpenOutdoorSQLiteConnection {
  private var database: OpaquePointer?

  init(url: URL, flags: Int32) throws {
    var opened: OpaquePointer?
    let result = sqlite3_open_v2(url.path, &opened, flags, nil)
    guard result == SQLITE_OK, let opened else {
      let message = opened.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite open failed"
      if let opened { sqlite3_close_v2(opened) }
      throw OpenOutdoorStorageError.sqlite(code: result, message: message)
    }
    database = opened
    sqlite3_busy_timeout(opened, 5_000)
  }

  deinit {
    if let database { sqlite3_close_v2(database) }
  }

  func execute(_ sql: String) throws {
    guard let database else { return }
    var errorMessage: UnsafeMutablePointer<CChar>?
    let result = sqlite3_exec(database, sql, nil, nil, &errorMessage)
    guard result == SQLITE_OK else {
      let message = errorMessage.map { String(cString: $0) } ?? "SQLite statement failed"
      sqlite3_free(errorMessage)
      throw OpenOutdoorStorageError.sqlite(code: result, message: message)
    }
  }
}

internal final class OpenOutdoorStorageCoordinatorSpike {
  private let applicationSupport: URL

  init() throws {
    applicationSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    ).standardizedFileURL
  }

  func openWritableUserDatabase() throws -> OpenOutdoorSQLiteConnection {
    let directory = applicationSupport.appendingPathComponent("UserData", isDirectory: true)
    try OpenOutdoorFilePolicy.prepareDirectory(directory, protection: .complete)
    let databaseURL = directory.appendingPathComponent("user.sqlite")
    let connection = try OpenOutdoorSQLiteConnection(
      url: databaseURL,
      flags: SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
    )
    try connection.execute("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
    try OpenOutdoorFilePolicy.apply(databaseURL, protection: .complete)
    for suffix in ["-wal", "-shm"] {
      let sidecar = URL(fileURLWithPath: databaseURL.path + suffix)
      if FileManager.default.fileExists(atPath: sidecar.path) {
        try OpenOutdoorFilePolicy.apply(sidecar, protection: .complete)
      }
    }
    return connection
  }

  func openReadOnlyCatalog(at catalogURL: URL, privateCatalog: Bool) throws -> OpenOutdoorSQLiteConnection {
    let rootName = privateCatalog ? "Private" : "Public"
    let catalogRoot = applicationSupport
      .appendingPathComponent("Catalogs", isDirectory: true)
      .appendingPathComponent(rootName, isDirectory: true)
      .standardizedFileURL
    try OpenOutdoorFilePolicy.prepareDirectory(
      catalogRoot,
      protection: .completeUntilFirstUserAuthentication
    )
    let resolved = catalogURL.standardizedFileURL
    let rootPrefix = catalogRoot.path.hasSuffix("/") ? catalogRoot.path : catalogRoot.path + "/"
    guard resolved.path.hasPrefix(rootPrefix) else {
      throw OpenOutdoorStorageError.pathEscapesRoot
    }
    try OpenOutdoorFilePolicy.apply(
      resolved,
      protection: .completeUntilFirstUserAuthentication
    )
    return try OpenOutdoorSQLiteConnection(
      url: resolved,
      flags: SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX
    )
  }
}
