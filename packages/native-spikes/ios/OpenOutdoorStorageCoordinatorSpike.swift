import Foundation
import SQLite3

internal enum OpenOutdoorStorageError: LocalizedError {
  case pathEscapesRoot
  case sqlite(code: Int32, message: String)

  var errorDescription: String? {
    switch self {
    case .pathEscapesRoot:
      return "The requested catalog path escapes its declared root"
    case .sqlite(_, let message):
      return message
    }
  }
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

  func scalarInt(_ sql: String) throws -> Int {
    let rows = try queryRows(sql, columns: 1)
    guard let value = rows.first?.first, let result = Int(value) else {
      throw OpenOutdoorStorageError.sqlite(code: SQLITE_MISMATCH, message: "Expected integer result")
    }
    return result
  }

  func queryRows(_ sql: String, columns: Int) throws -> [[String]] {
    guard let database else { return [] }
    var statement: OpaquePointer?
    let prepareResult = sqlite3_prepare_v2(database, sql, -1, &statement, nil)
    guard prepareResult == SQLITE_OK, let statement else {
      throw OpenOutdoorStorageError.sqlite(
        code: prepareResult,
        message: String(cString: sqlite3_errmsg(database))
      )
    }
    defer { sqlite3_finalize(statement) }

    var rows: [[String]] = []
    while true {
      let step = sqlite3_step(statement)
      if step == SQLITE_DONE { return rows }
      guard step == SQLITE_ROW else {
        throw OpenOutdoorStorageError.sqlite(
          code: step,
          message: String(cString: sqlite3_errmsg(database))
        )
      }
      var row: [String] = []
      for index in 0..<columns {
        if sqlite3_column_type(statement, Int32(index)) == SQLITE_NULL {
          row.append("<null>")
        } else if let text = sqlite3_column_text(statement, Int32(index)) {
          row.append(String(cString: text))
        } else {
          row.append("")
        }
      }
      rows.append(row)
    }
  }
}

internal final class OpenOutdoorStorageCoordinatorSpike {
  let applicationSupport: URL

  init() throws {
    applicationSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    ).standardizedFileURL
  }

  var userDatabaseURL: URL {
    applicationSupport
      .appendingPathComponent("UserData", isDirectory: true)
      .appendingPathComponent("user.sqlite")
  }

  func catalogRoot(privateCatalog: Bool) -> URL {
    applicationSupport
      .appendingPathComponent("Catalogs", isDirectory: true)
      .appendingPathComponent(privateCatalog ? "Private" : "Public", isDirectory: true)
      .standardizedFileURL
  }

  func applyUserDatabasePolicy() throws {
    let databaseURL = userDatabaseURL
    try OpenOutdoorFilePolicy.apply(databaseURL, protection: .complete)
    for suffix in ["-wal", "-shm"] {
      let sidecar = URL(fileURLWithPath: databaseURL.path + suffix)
      if FileManager.default.fileExists(atPath: sidecar.path) {
        try OpenOutdoorFilePolicy.apply(sidecar, protection: .complete)
      }
    }
  }

  func openWritableUserDatabase() throws -> OpenOutdoorSQLiteConnection {
    let directory = userDatabaseURL.deletingLastPathComponent()
    try OpenOutdoorFilePolicy.prepareDirectory(directory, protection: .complete)
    let connection = try OpenOutdoorSQLiteConnection(
      url: userDatabaseURL,
      flags: SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
    )
    try connection.execute(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA wal_autocheckpoint=0;"
    )
    try applyUserDatabasePolicy()
    return connection
  }

  func openReadOnlyCatalog(
    at catalogURL: URL,
    privateCatalog: Bool
  ) throws -> OpenOutdoorSQLiteConnection {
    let catalogRoot = catalogRoot(privateCatalog: privateCatalog)
    try OpenOutdoorFilePolicy.prepareDirectory(
      catalogRoot,
      protection: .completeUntilFirstUserAuthentication
    )
    let resolved = catalogURL.resolvingSymlinksInPath().standardizedFileURL
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
