import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label} is missing required token: ${token}`);
}

function rejectText(source, token, label) {
  if (source.includes(token)) throw new Error(`${label} contains forbidden token: ${token}`);
}

const app = JSON.parse(await text('apps/mobile/app.json'));
const mobilePackage = JSON.parse(await text('apps/mobile/package.json'));
const moduleConfig = JSON.parse(await text('packages/native-spikes/expo-module.config.json'));
const podspec = await text('packages/native-spikes/OpenOutdoorNativeSpikes.podspec');
const iosBuildScript = await text('scripts/Build-IosUnsigned.ps1');
const tracker = await text('packages/native-spikes/ios/OpenOutdoorTrackerSpike.swift');
const trackingIndex = await text('packages/tracking/src/index.ts');
const mapIndex = await text('packages/map/src/index.ts');
const storageIndex = await text('packages/storage/src/index.ts');
const catalogActivation = await text('packages/storage/src/catalog-activation.ts');
const composition = await text('packages/storage/src/composition.ts');
const fieldHardening = await text('packages/tracking/src/field-hardening.ts');
const diagnostics = await text('packages/native-spikes/ios/OpenOutdoorPhase0Diagnostics.swift');
const performanceDiagnostics = await text(
  'packages/native-spikes/ios/OpenOutdoorPhase0PerformanceDiagnostics.swift',
);
const privateStore = await text('packages/native-spikes/ios/OpenOutdoorPrivateStore.swift');
const phase1Acceptance = await text(
  'packages/native-spikes/ios/OpenOutdoorPhase1AcceptanceCoordinator.swift',
);
const phase3Acceptance = await text(
  'packages/native-spikes/ios/OpenOutdoorPhase3AcceptanceStore.swift',
);
const nativeModule = await text('packages/native-spikes/ios/OpenOutdoorNativeSpikesModule.swift');
const mobileBinding = await text('apps/mobile/nativeSpikes.ts');
const mobileApp = await text('apps/mobile/App.tsx');
const phase1Runner = await text('apps/mobile/Phase1AcceptanceRunner.tsx');
const phase3Runner = await text('apps/mobile/Phase3AcceptanceRunner.tsx');
const mobileIndex = await text('apps/mobile/index.ts');
const startupBoundary = await text('apps/mobile/StartupErrorBoundary.tsx');
const storage = await text('packages/native-spikes/ios/OpenOutdoorStorageCoordinatorSpike.swift');
const policy = await text('packages/native-spikes/ios/OpenOutdoorFilePolicy.swift');
const lockfile = await text('pnpm-lock.yaml');
const release = JSON.parse(await text('config/release.json'));

if (mobilePackage.dependencies['@open-outdoor/native-spikes'] !== 'workspace:*') {
  throw new Error('mobile must depend on the autolinked native spike workspace package');
}
if (!moduleConfig.platforms.includes('apple'))
  throw new Error('native spike must autolink on Apple');
if (moduleConfig.apple.podspecPath !== 'OpenOutdoorNativeSpikes.podspec') {
  throw new Error('native spike must declare its root-level podspec to Expo autolinking');
}
if (moduleConfig.apple.swiftModuleName !== 'OpenOutdoorNativeSpikes') {
  throw new Error('native spike must declare its Swift product module to Expo autolinking');
}
requireText(
  iosBuildScript,
  'internal import OpenOutdoorNativeSpikes',
  'iOS build registration gate',
);
requireText(iosBuildScript, 'OpenOutdoorNativeSpikesModule.self', 'iOS build registration gate');
requireText(podspec, "File.join(__dir__, 'package.json')", 'podspec');
requireText(podspec, "s.dependency 'ExpoModulesCore'", 'podspec');
requireText(
  iosBuildScript,
  'Print :OpenOutdoorPhase0DiagnosticsEnabled',
  'iOS build diagnostics gate',
);
requireText(podspec, "s.libraries      = 'sqlite3'", 'podspec');
requireText(podspec, "'CoreLocation', 'CoreMotion'", 'podspec');
requireText(podspec, "'Network'", 'podspec');
requireText(tracker, 'allowsBackgroundLocationUpdates = true', 'tracker');
requireText(tracker, 'CMAltimeter', 'tracker');
requireText(tracker, 'completeUntilFirstUserAuthentication', 'tracker');
requireText(tracker, 'try fileHandle.synchronize()', 'tracker');
requireText(tracker, 'segment += 1', 'Phase 1 native batch bridge');
requireText(tracker, 'relativeAltitudeM', 'Phase 1 barometer bridge');
requireText(tracker, 'altimeterPersistenceInterval', 'Phase 1 barometer persistence');
requireText(tracker, 'appendObservation(location:', 'Phase 1 barometer persistence');
requireText(tracker, 'verticalAccuracyM', 'Phase 1 native batch bridge');
requireText(trackingIndex, "export * from './field-hardening';", 'mobile Metro module resolution');
for (const token of [
  "export * from './basemap';",
  "export * from './offline-explore';",
  "export * from './field-readiness';",
]) {
  requireText(mapIndex, token, 'mobile Metro module resolution');
}
for (const token of ["export * from './catalog-activation';", "export * from './composition';"]) {
  requireText(storageIndex, token, 'mobile Metro module resolution');
}
requireText(catalogActivation, "from './index';", 'mobile Metro module resolution');
requireText(composition, "from './private';", 'mobile Metro module resolution');
requireText(fieldHardening, "from './index';", 'mobile Metro module resolution');
requireText(tracker, 'batchJSON(afterSequence:', 'Phase 1 native batch bridge');
requireText(tracker, 'OpenOutdoorTrackingBatchPayload', 'Phase 1 native batch bridge');
for (const token of [
  'active-session.json',
  'tornFinalLineIgnored',
  'static func recover()',
  'discardRecovery()',
  'clearManifest: false',
]) {
  requireText(tracker, token, 'recoverable tracker');
}
for (const token of [
  '.balanced',
  '.endurance',
  '.highAccuracy',
  'distanceFilter = 10',
  'distanceFilter = 25',
  'startUpdatingLocation()',
  'stopUpdatingLocation()',
  'startRelativeAltitudeUpdates',
  'stopRelativeAltitudeUpdates()',
]) {
  requireText(tracker, token, 'energy-conscious tracker');
}
const energyPolicy = release.phase0.tracker.energyPolicy;
if (
  energyPolicy.acceptancePhase !== 'deferred-field-hardening' ||
  energyPolicy.continuousPollingAllowed !== false ||
  energyPolicy.sensorsOnlyDuringActiveRecording !== true ||
  energyPolicy.highAccuracyRequiresExplicitSelection !== true
) {
  throw new Error('release configuration must retain the deferred energy-conscious tracker policy');
}
for (const functionName of [
  'sealTrackingSession',
  'loadPrivateSnapshot',
  'commitPrivateSnapshot',
  'commitTrackingSnapshot',
  'trackingCheckpoint',
  'requestAlwaysAuthorization',
  'startTracking',
  'pauseTracking',
  'resumeTracking',
  'stopTracking',
  'isTracking',
  'currentSessionId',
  'lastTrackingError',
  'readTrackingBatch',
  'inspectTrackingSession',
  'recoverTrackingSession',
  'discardRecoverableTrackingSession',
]) {
  requireText(nativeModule, `AsyncFunction("${functionName}")`, 'native module');
  requireText(mobileBinding, `readonly ${functionName}`, 'mobile native binding');
}
for (const functionName of [
  'phase3AcceptanceEnvironment',
  'loadPhase3AcceptanceState',
  'savePhase3AcceptanceState',
  'resetPhase3AcceptanceState',
  'sharePhase3AcceptanceReport',
]) {
  requireText(nativeModule, `AsyncFunction("${functionName}")`, 'Phase 3 acceptance module');
  requireText(mobileBinding, `readonly ${functionName}`, 'Phase 3 acceptance binding');
}
for (const functionName of [
  'recordAcknowledgementBenchmark',
  'beginMemoryProfile',
  'isMemoryProfileActive',
  'finishMemoryProfile',
  'inspectTrackingProtection',
  'sharePhysicalDiagnosticReport',
]) {
  requireText(nativeModule, `AsyncFunction("${functionName}")`, 'physical diagnostics module');
  requireText(mobileBinding, `readonly ${functionName}`, 'physical diagnostics binding');
}
for (const functionName of [
  'beginPhase1Acceptance',
  'currentPhase1Acceptance',
  'armPhase1CrashRecovery',
  'beginPhase1FieldRun',
  'recordPhase1FieldResult',
  'confirmPhase1Accessibility',
  'beginPhase1ElevationRetry',
  'recordPhase1ElevationRetry',
  'retryPhase1Accessibility',
  'recordPhase1AccessibilityControl',
  'resetPhase1Acceptance',
  'sharePhase1AcceptanceReport',
]) {
  requireText(nativeModule, `AsyncFunction("${functionName}")`, 'Phase 1 acceptance module');
  requireText(mobileBinding, `readonly ${functionName}`, 'Phase 1 acceptance binding');
}
for (const token of [
  'mach_task_basic_info',
  'minimumAcknowledgementSamples = 20',
  'minimumMemoryDurationSeconds = 30.0 * 60.0',
  'minimumMemorySamples = 20',
  'memoryThresholdBytes: UInt64 = 150 * 1_024 * 1_024',
  'samplesBytes',
  'phase0-physical-report.json',
  'UIActivityViewController',
]) {
  requireText(performanceDiagnostics, token, 'Phase 0 physical diagnostics');
}
requireText(
  performanceDiagnostics,
  `private static let profileId = "${release.phase0.profileId}"`,
  'Phase 0 physical diagnostics profile',
);
for (const token of [
  'activePolicyReport()',
  'completeUntilFirstUserAuthentication.rawValue',
  '$0.excludedFromBackup == true',
]) {
  requireText(tracker, token, 'active tracking file-policy diagnostics');
}
for (const token of [
  'Measure 20 Start/Stop acknowledgements',
  'Begin 30-minute memory profile',
  'Finish 30-minute memory profile',
  'Inspect active tracking protection',
  'Share physical diagnostic JSON',
  'for (let index = 0; index < 20; index += 1)',
]) {
  requireText(mobileApp, token, 'mobile physical diagnostics UI');
}
requireText(nativeModule, '.runOnQueue(.main)', 'native module');
requireText(mobileBinding, 'requireOptionalNativeModule', 'startup-safe mobile native binding');
requireText(mobileBinding, 'module !== null', 'startup-safe mobile native binding');
requireText(mobileBinding, 'requiredModule()', 'startup-safe mobile native binding');
requireText(mobileApp, 'Native capability unavailable', 'mobile startup diagnostic UI');
requireText(mobileApp, 'disabled={!nativeSpikes.available ||', 'mobile startup diagnostic UI');
requireText(mobileIndex, 'StartupErrorBoundary', 'mobile root component');
requireText(startupBoundary, 'getDerivedStateFromError', 'mobile root error boundary');
requireText(startupBoundary, 'Open Outdoor startup diagnostic', 'mobile root error boundary');
for (const token of [
  'BEGIN IMMEDIATE',
  'private_snapshot',
  'tracking_checkpoint',
  'migration_audit',
  'PRAGMA user_version=3',
  'ON CONFLICT(session_id)',
  'ROLLBACK',
]) {
  requireText(privateStore, token, 'production private SQLite store');
}
requireText(tracker, 'observations.count >= 256', 'bounded native tracking batch');
for (const token of [
  'NWPathMonitor',
  'didEnterBackgroundNotification',
  'process-relaunched-after-crash-arm',
  'permissionSafeStopObserved',
  'minimumBackgroundSeconds = 30.0 * 60.0',
  'memoryThresholdBytes: UInt64 = 150 * 1_024 * 1_024',
  'UIAccessibility.isVoiceOverRunning',
  'shouldDifferentiateWithoutColor',
  'phase1-physical-report.json',
  'accessibilityControls',
  'elevation-retry-started',
  'Still required:',
  'deviceModelIdentifier',
  'OpenOutdoorSourceCommit',
]) {
  requireText(phase1Acceptance, token, 'guided Phase 1 acceptance coordinator');
}
for (const token of [
  'Begin guided acceptance',
  'Start and arm crash test',
  'Begin combined 30-minute field run',
  'Accessibility flow is usable',
  'Export consolidated acceptance report',
  'Retry elevation climb only',
  'Retry accessibility only',
  'Start accessibility test recording',
  'Pause accessibility test recording',
  'Finish accessibility test recording',
  'operationInFlight.current',
  'combined-field-run-finished',
  'isMemoryProfileActive',
]) {
  requireText(phase1Runner, token, 'guided Phase 1 acceptance UI');
}
for (const token of [
  'Automatic Phase 3 test run',
  'This run starts by itself',
  'Running automatic tests',
  'Offline explore, search, and details',
  'Catalog activation and rollback',
  'Protected encrypted backup and restore',
  'Runtime performance budgets',
  'Accessibility contract',
  'automatic-ios-runner',
  'external-constraint',
  'requestAnimationFrame',
  'coordinateFree: true',
  'containsPersonalData: false',
]) {
  requireText(phase3Runner, token, 'automatic Phase 3 acceptance UI');
}
for (const token of [
  'Begin Phase 3 guided acceptance',
  'decisionButtons',
  'Complete tester attestation',
  'Downloaded IPA SHA-256',
  'TextInput',
]) {
  rejectText(phase3Runner, token, 'automatic Phase 3 acceptance UI');
}
for (const token of [
  'guided-state.json',
  '.completeFileProtection',
  'phase3-physical-report.json',
  'UIActivityViewController',
  'OpenOutdoorSourceCommit',
  'executableSHA256',
  'encryptedRoundTrip',
  'wrongSecretRejected',
  'residentMemoryMiB',
]) {
  requireText(phase3Acceptance, token, 'automatic Phase 3 acceptance store');
}
requireText(mobileApp, 'Phase3AcceptanceRunner', 'mobile Phase 3 acceptance integration');
for (const token of [
  'Start recording',
  'Pause recording',
  'Resume recording',
  'Finish and save recording',
  'Recover interrupted recording',
  'Discard interrupted recording',
  'Alert.alert',
  'minHeight: 52',
  'useWindowDimensions',
  'no turn instructions, rerouting, or',
]) {
  requireText(mobileApp, token, 'Phase 1 recorder/accessibility UI');
}
requireText(nativeModule, 'OpenOutdoorPhase0DiagnosticsEnabled', 'native diagnostics gate');
for (const token of [
  '#if DEBUG || OPEN_OUTDOOR_PHASE0_DIAGNOSTICS',
  'phase0_activity',
  'phase0_association',
  'phase0_attachment',
  'phase0_promotion',
  'OpenOutdoorPhase0DiagnosticsEnabled',
  'SHA256.hash',
  'UIActivityViewController',
  'after-remap-validation',
  'recordHashes',
]) {
  requireText(diagnostics, token, 'Phase 0 diagnostics');
}
requireText(podspec, 'OPEN_OUTDOOR_PHASE0_DIAGNOSTICS', 'podspec');
if (app.expo.ios.infoPlist.UIFileSharingEnabled === true) {
  throw new Error('Phase 0 reporting must not expose the entire Documents directory');
}
requireText(storage, 'SQLITE_OPEN_READONLY', 'storage');
requireText(storage, 'SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE', 'storage');
requireText(storage, 'PRAGMA journal_mode=WAL', 'storage');
requireText(storage, 'resolvingSymlinksInPath()', 'storage');
requireText(storage, 'path.hasPrefix(rootPrefix)', 'storage');
requireText(policy, 'resourceValues.isExcludedFromBackup = true', 'file policy');
requireText(policy, '.protectionKey', 'file policy');
requireText(lockfile, 'link:../../packages/native-spikes', 'lockfile');

const info = app.expo.ios.infoPlist;
if (info.OpenOutdoorPhase0DiagnosticsEnabled !== true) {
  throw new Error('local Phase 0 app must explicitly opt in to native storage diagnostics');
}
for (const key of [
  'NSLocationWhenInUseUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSMotionUsageDescription',
]) {
  if (typeof info[key] !== 'string' || info[key].length === 0) {
    throw new Error(`iOS Info.plist is missing ${key}`);
  }
}
if (!info.UIBackgroundModes.includes('location')) {
  throw new Error('iOS background location mode is not declared');
}

console.log('native tracker/storage spike contract is valid');
requireText(iosBuildScript, 'OpenOutdoorSourceCommit', 'iOS build source binding');
