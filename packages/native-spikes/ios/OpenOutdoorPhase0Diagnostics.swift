#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS
import CryptoKit
import Foundation
import SQLite3
import UIKit

private struct OpenOutdoorActiveCatalogPointer: Codable {
  let catalogId: String
  let fileName: String
}

private struct OpenOutdoorPhase0DiagnosticReport: Codable {
  let schemaVersion: Int
  let syntheticOnly: Bool
  let fixtureStage: String
  let activeCatalogId: String
  let interruptedAt: String?
  let rolledBack: Bool
  let recordCounts: [String: Int]
  let recordHashes: [String: String]
  let artifacts: [OpenOutdoorFilePolicySnapshot]

  func json() throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return String(decoding: try encoder.encode(self), as: UTF8.self)
  }
}

internal final class OpenOutdoorPhase0Diagnostics {
  private let coordinator: OpenOutdoorStorageCoordinatorSpike
  private let applicationSupport: URL
  private var heldUserConnection: OpenOutdoorSQLiteConnection?
  private var lastReportJSON: String?

  init() throws {
    guard Bundle.main.bundleIdentifier == "org.openoutdoor.local" else {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 8,
        userInfo: [NSLocalizedDescriptionKey: "Phase 0 diagnostics are disabled outside the local feasibility channel"]
      )
    }
    coordinator = try OpenOutdoorStorageCoordinatorSpike()
    applicationSupport = coordinator.applicationSupport
  }

  private var attachmentURL: URL {
    applicationSupport
      .appendingPathComponent("Attachments", isDirectory: true)
      .appendingPathComponent("phase0-synthetic.txt")
  }

  private var diagnosticURL: URL {
    applicationSupport
      .appendingPathComponent("Diagnostics", isDirectory: true)
      .appendingPathComponent("phase0-synthetic.json")
  }

  private var activePointerURL: URL {
    applicationSupport
      .appendingPathComponent("Catalogs", isDirectory: true)
      .appendingPathComponent("active-catalog.json")
  }

  private func catalogURL(id: String, privateCatalog: Bool = false) -> URL {
    coordinator
      .catalogRoot(privateCatalog: privateCatalog)
      .appendingPathComponent(privateCatalog ? "private-catalog.sqlite" : "\(id).sqlite")
  }

  private func hash(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8))
      .map { String(format: "%02x", $0) }
      .joined()
  }

  private func writeSyntheticFile(
    _ value: String,
    to url: URL,
    protection: FileProtectionType
  ) throws {
    try OpenOutdoorFilePolicy.prepareDirectory(
      url.deletingLastPathComponent(),
      protection: protection
    )
    try Data(value.utf8).write(to: url, options: .atomic)
    try OpenOutdoorFilePolicy.apply(url, protection: protection)
  }

  private func createCatalog(
    id: String,
    privateCatalog: Bool = false
  ) throws {
    let root = coordinator.catalogRoot(privateCatalog: privateCatalog)
    try OpenOutdoorFilePolicy.prepareDirectory(
      root,
      protection: .completeUntilFirstUserAuthentication
    )
    let url = catalogURL(id: id, privateCatalog: privateCatalog)
    let connection = try OpenOutdoorSQLiteConnection(
      url: url,
      flags: SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
    )
    try connection.execute(
      """
      CREATE TABLE IF NOT EXISTS catalog_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_features (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      INSERT OR REPLACE INTO catalog_metadata(key, value)
        VALUES ('catalog_id', '\(id)');
      INSERT OR REPLACE INTO catalog_features(id, name)
        VALUES ('\(id)-feature', 'Synthetic \(id) feature');
      """
    )
    withExtendedLifetime(connection) {}
    try OpenOutdoorFilePolicy.apply(
      url,
      protection: .completeUntilFirstUserAuthentication
    )
    _ = try coordinator.openReadOnlyCatalog(at: url, privateCatalog: privateCatalog)
  }

  private func writeActivePointer(catalogId: String) throws {
    let pointer = OpenOutdoorActiveCatalogPointer(
      catalogId: catalogId,
      fileName: catalogURL(id: catalogId).lastPathComponent
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    try OpenOutdoorFilePolicy.prepareDirectory(
      activePointerURL.deletingLastPathComponent(),
      protection: .completeUntilFirstUserAuthentication
    )
    try encoder.encode(pointer).write(to: activePointerURL, options: .atomic)
    try OpenOutdoorFilePolicy.apply(
      activePointerURL,
      protection: .completeUntilFirstUserAuthentication
    )
  }

  private func readActivePointer() throws -> OpenOutdoorActiveCatalogPointer {
    guard FileManager.default.fileExists(atPath: activePointerURL.path) else {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Seed fixture version A first"]
      )
    }
    return try JSONDecoder().decode(
      OpenOutdoorActiveCatalogPointer.self,
      from: Data(contentsOf: activePointerURL)
    )
  }

  private func openUserConnection() throws -> OpenOutdoorSQLiteConnection {
    if let heldUserConnection { return heldUserConnection }
    let connection = try coordinator.openWritableUserDatabase()
    heldUserConnection = connection
    return connection
  }

  private func prepareSchema(_ connection: OpenOutdoorSQLiteConnection) throws {
    try connection.execute(
      """
      CREATE TABLE IF NOT EXISTS phase0_fixture_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_activity (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_user_trail (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_association (
        id TEXT PRIMARY KEY,
        trail_id TEXT NOT NULL,
        reference_id TEXT,
        state TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_overlay (
        id TEXT PRIMARY KEY,
        trail_id TEXT NOT NULL,
        catalog_feature_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_note (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_favorite (
        id TEXT PRIMARY KEY,
        target_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_attachment (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        file_name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS phase0_promotion (
        id TEXT PRIMARY KEY,
        private_trail_id TEXT NOT NULL,
        canonical_reference_id TEXT NOT NULL
      );
      """
    )
  }

  func seedVersionA() throws -> String {
    let versionBURL = catalogURL(id: "catalog-b")
    if FileManager.default.fileExists(atPath: versionBURL.path) {
      try FileManager.default.removeItem(at: versionBURL)
    }
    let connection = try openUserConnection()
    try prepareSchema(connection)
    try connection.execute(
      """
      BEGIN IMMEDIATE;
      DELETE FROM phase0_fixture_metadata;
      DELETE FROM phase0_activity;
      DELETE FROM phase0_user_trail;
      DELETE FROM phase0_association;
      DELETE FROM phase0_overlay;
      DELETE FROM phase0_note;
      DELETE FROM phase0_favorite;
      DELETE FROM phase0_attachment;
      DELETE FROM phase0_promotion;
      INSERT INTO phase0_fixture_metadata VALUES ('fixture_stage', 'A');
      INSERT INTO phase0_activity VALUES ('activity-a', 'Synthetic activity');
      INSERT INTO phase0_user_trail VALUES ('user-trail-a', 'Synthetic user trail');
      INSERT INTO phase0_association
        VALUES ('association-a', 'user-trail-a', 'catalog-a-feature', 'resolved');
      INSERT INTO phase0_overlay
        VALUES ('overlay-a', 'user-trail-a', 'catalog-a-feature');
      INSERT INTO phase0_note VALUES ('note-a', 'Synthetic note');
      INSERT INTO phase0_favorite VALUES ('favorite-a', 'user-trail-a');
      INSERT INTO phase0_attachment
        VALUES ('attachment-a', 'activity-a', 'phase0-synthetic.txt');
      COMMIT;
      """
    )
    try coordinator.applyUserDatabasePolicy()
    try writeSyntheticFile(
      "Synthetic Phase 0 attachment; contains no user data.\n",
      to: attachmentURL,
      protection: .complete
    )
    try writeSyntheticFile(
      "{\"synthetic\":true,\"fixtureStage\":\"A\"}\n",
      to: diagnosticURL,
      protection: .complete
    )
    try createCatalog(id: "catalog-a")
    try createCatalog(id: "private-a", privateCatalog: true)
    try writeActivePointer(catalogId: "catalog-a")
    return try makeReport(stage: "A", interruptedAt: nil, rolledBack: false)
  }

  func applyVersionB(interruptAt: String?) throws -> String {
    let allowed = Set([
      "before-copy",
      "after-copy",
      "after-checksum",
      "after-compatibility",
      "after-remap-validation",
      "before-pointer-switch",
      "after-pointer-switch",
      "after-first-launch",
    ])
    if let interruptAt, !allowed.contains(interruptAt) {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Unknown activation checkpoint"]
      )
    }

    let connection = try openUserConnection()
    try prepareSchema(connection)
    guard try connection.scalarInt("SELECT COUNT(*) FROM phase0_activity;") == 1 else {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Seed fixture version A first"]
      )
    }
    let oldPointer = try readActivePointer()
    guard oldPointer.catalogId == "catalog-a" else {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Version A must be active before applying B"]
      )
    }

    if interruptAt != "before-copy" {
      try createCatalog(id: "catalog-b")
    }

    let beforePointer = Set([
      "before-copy",
      "after-copy",
      "after-checksum",
      "after-compatibility",
      "after-remap-validation",
      "before-pointer-switch",
    ])
    if let interruptAt, beforePointer.contains(interruptAt) {
      return try makeReport(
        stage: "A",
        interruptedAt: interruptAt,
        rolledBack: false
      )
    }

    try writeActivePointer(catalogId: "catalog-b")
    if interruptAt == "after-pointer-switch" {
      try writeActivePointer(catalogId: oldPointer.catalogId)
      return try makeReport(
        stage: "A",
        interruptedAt: interruptAt,
        rolledBack: true
      )
    }

    try connection.execute(
      """
      BEGIN IMMEDIATE;
      UPDATE phase0_fixture_metadata SET value = 'B' WHERE key = 'fixture_stage';
      UPDATE phase0_association
        SET reference_id = 'catalog-b-feature'
        WHERE id = 'association-a';
      UPDATE phase0_overlay
        SET catalog_feature_id = 'catalog-b-feature'
        WHERE id = 'overlay-a';
      INSERT OR REPLACE INTO phase0_association
        VALUES ('association-unresolved', 'user-trail-a', NULL, 'review');
      INSERT OR REPLACE INTO phase0_promotion
        VALUES ('promotion-a', 'user-trail-a', 'catalog-b-feature');
      COMMIT;
      """
    )
    try coordinator.applyUserDatabasePolicy()
    try writeSyntheticFile(
      "{\"synthetic\":true,\"fixtureStage\":\"B\"}\n",
      to: diagnosticURL,
      protection: .complete
    )
    return try makeReport(
      stage: "B",
      interruptedAt: interruptAt,
      rolledBack: false
    )
  }

  func inspectCurrent() throws -> String {
    let connection = try openUserConnection()
    try prepareSchema(connection)
    let stageRows = try connection.queryRows(
      "SELECT value FROM phase0_fixture_metadata WHERE key = 'fixture_stage';",
      columns: 1
    )
    guard let stage = stageRows.first?.first else {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "No synthetic Phase 0 fixture exists"]
      )
    }
    return try makeReport(stage: stage, interruptedAt: nil, rolledBack: false)
  }

  private func makeReport(
    stage: String,
    interruptedAt: String?,
    rolledBack: Bool
  ) throws -> String {
    let connection = try openUserConnection()
    try coordinator.applyUserDatabasePolicy()
    let tableColumns: [(String, Int)] = [
      ("phase0_activity", 2),
      ("phase0_user_trail", 2),
      ("phase0_association", 4),
      ("phase0_overlay", 3),
      ("phase0_note", 2),
      ("phase0_favorite", 2),
      ("phase0_attachment", 3),
      ("phase0_promotion", 3),
    ]
    var counts: [String: Int] = [:]
    var hashes: [String: String] = [:]
    for (table, columns) in tableColumns {
      counts[table] = try connection.scalarInt("SELECT COUNT(*) FROM \(table);")
      let rows = try connection.queryRows(
        "SELECT * FROM \(table) ORDER BY 1;",
        columns: columns
      )
      hashes[table] = hash(rows.map { $0.joined(separator: "|") }.joined(separator: "\n"))
    }

    let activeCatalog = try readActivePointer().catalogId
    let activeTrackingDirectory = applicationSupport
      .appendingPathComponent("Tracking", isDirectory: true)
      .appendingPathComponent("Active", isDirectory: true)
    let artifactURLs = [
      coordinator.userDatabaseURL,
      URL(fileURLWithPath: coordinator.userDatabaseURL.path + "-wal"),
      URL(fileURLWithPath: coordinator.userDatabaseURL.path + "-shm"),
      attachmentURL,
      diagnosticURL,
      catalogURL(id: "catalog-a"),
      catalogURL(id: "catalog-b"),
      catalogURL(id: "private-a", privateCatalog: true),
      activePointerURL,
      activeTrackingDirectory,
      activeTrackingDirectory.appendingPathComponent("active-session.json"),
    ]
    let artifacts = try artifactURLs.map {
      try OpenOutdoorFilePolicy.inspect($0, relativeTo: applicationSupport)
    }
    let report = OpenOutdoorPhase0DiagnosticReport(
      schemaVersion: 1,
      syntheticOnly: true,
      fixtureStage: stage,
      activeCatalogId: activeCatalog,
      interruptedAt: interruptedAt,
      rolledBack: rolledBack,
      recordCounts: counts,
      recordHashes: hashes,
      artifacts: artifacts
    )
    let json = try report.json()
    lastReportJSON = json
    return json
  }

  func exportLastReport() throws -> String {
    guard let lastReportJSON else {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Run or inspect a synthetic fixture first"]
      )
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "Phase0DiagnosticsExport",
      isDirectory: true
    )
    try OpenOutdoorFilePolicy.prepareDirectory(directory, protection: .complete)
    let reportURL = directory.appendingPathComponent("phase0-report.json")
    try Data(lastReportJSON.utf8).write(to: reportURL, options: .atomic)
    try OpenOutdoorFilePolicy.apply(reportURL, protection: .complete)
    return reportURL.path
  }

  func shareLastReport() throws -> String {
    let path = try exportLastReport()
    let reportURL = URL(fileURLWithPath: path)
    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      throw NSError(
        domain: "OpenOutdoorPhase0Diagnostics",
        code: 7,
        userInfo: [NSLocalizedDescriptionKey: "No active window is available to share the report"]
      )
    }
    var presenter = root
    while let presented = presenter.presentedViewController {
      presenter = presented
    }
    presenter.present(
      UIActivityViewController(activityItems: [reportURL], applicationActivities: nil),
      animated: true
    )
    return path
  }
}
#endif