import Foundation
import SQLite3

extension OpenOutdoorStorageCoordinatorSpike {
  private func validatedSnapshotHex(_ snapshotJSON: String) throws -> String {
    guard let data = snapshotJSON.data(using: .utf8) else {
      throw OpenOutdoorStorageError.sqlite(code: SQLITE_MISMATCH, message: "Snapshot is not UTF-8")
    }
    let object = try JSONSerialization.jsonObject(with: data)
    guard object is [String: Any] else {
      throw OpenOutdoorStorageError.sqlite(code: SQLITE_MISMATCH, message: "Snapshot root is invalid")
    }
    return data.map { String(format: "%02x", $0) }.joined()
  }

  private func migratePrivateStore(_ connection: OpenOutdoorSQLiteConnection) throws {
    let version = try connection.scalarInt("PRAGMA user_version")
    guard version >= 0 && version <= 3 else {
      throw OpenOutdoorStorageError.sqlite(
        code: SQLITE_MISMATCH,
        message: "Private database schema is newer than this application"
      )
    }
    try connection.execute("""
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS private_snapshot (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tracking_checkpoint (
        session_id TEXT PRIMARY KEY,
        highest_sequence INTEGER NOT NULL CHECK(highest_sequence >= 0),
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS migration_audit (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO migration_audit(version, applied_at)
        VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      PRAGMA user_version=3;
      COMMIT;
      """)
    try applyUserDatabasePolicy()
  }

  func loadPrivateSnapshot() throws -> String? {
    let connection = try openWritableUserDatabase()
    try migratePrivateStore(connection)
    let rows = try connection.queryRows(
      "SELECT payload FROM private_snapshot WHERE singleton = 1",
      columns: 1
    )
    guard let value = rows.first?.first, value != "<null>" else { return nil }
    return value
  }

  func commitPrivateSnapshot(_ snapshotJSON: String) throws {
    let connection = try openWritableUserDatabase()
    try migratePrivateStore(connection)
    let hex = try validatedSnapshotHex(snapshotJSON)
    do {
      try connection.execute("""
        BEGIN IMMEDIATE;
        INSERT INTO private_snapshot(singleton, payload, updated_at)
        VALUES (1, CAST(X'\(hex)' AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(singleton) DO UPDATE SET
          payload=excluded.payload, updated_at=excluded.updated_at;
        COMMIT;
        """)
    } catch {
      try? connection.execute("ROLLBACK")
      throw error
    }
    try applyUserDatabasePolicy()
  }

  func commitTrackingSnapshot(
    _ snapshotJSON: String,
    sessionID: String,
    highestSequence: Int64
  ) throws {
    guard UUID(uuidString: sessionID) != nil, highestSequence >= 0 else {
      throw OpenOutdoorStorageError.sqlite(code: SQLITE_MISMATCH, message: "Tracking checkpoint is invalid")
    }
    let connection = try openWritableUserDatabase()
    try migratePrivateStore(connection)
    let hex = try validatedSnapshotHex(snapshotJSON)
    do {
      try connection.execute("""
        BEGIN IMMEDIATE;
        INSERT INTO private_snapshot(singleton, payload, updated_at)
        VALUES (1, CAST(X'\(hex)' AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(singleton) DO UPDATE SET
          payload=excluded.payload, updated_at=excluded.updated_at;
        INSERT INTO tracking_checkpoint(session_id, highest_sequence, updated_at)
        VALUES ('\(sessionID)', \(highestSequence), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(session_id) DO UPDATE SET
          highest_sequence=MAX(highest_sequence, excluded.highest_sequence),
          updated_at=excluded.updated_at;
        COMMIT;
        """)
    } catch {
      try? connection.execute("ROLLBACK")
      throw error
    }
    try applyUserDatabasePolicy()
  }

  func trackingCheckpoint(sessionID: String) throws -> Int64 {
    guard UUID(uuidString: sessionID) != nil else { return 0 }
    let connection = try openWritableUserDatabase()
    try migratePrivateStore(connection)
    let rows = try connection.queryRows(
      "SELECT highest_sequence FROM tracking_checkpoint WHERE session_id = '\(sessionID)'",
      columns: 1
    )
    return Int64(rows.first?.first ?? "0") ?? 0
  }
}
