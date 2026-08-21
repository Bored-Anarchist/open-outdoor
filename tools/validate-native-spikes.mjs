import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label} is missing required token: ${token}`);
}

const app = JSON.parse(await text('apps/mobile/app.json'));
const mobilePackage = JSON.parse(await text('apps/mobile/package.json'));
const moduleConfig = JSON.parse(await text('packages/native-spikes/expo-module.config.json'));
const podspec = await text('packages/native-spikes/OpenOutdoorNativeSpikes.podspec');
const tracker = await text('packages/native-spikes/ios/OpenOutdoorTrackerSpike.swift');
const nativeModule = await text('packages/native-spikes/ios/OpenOutdoorNativeSpikesModule.swift');
const mobileBinding = await text('apps/mobile/nativeSpikes.ts');
const mobileApp = await text('apps/mobile/App.tsx');
const storage = await text('packages/native-spikes/ios/OpenOutdoorStorageCoordinatorSpike.swift');
const policy = await text('packages/native-spikes/ios/OpenOutdoorFilePolicy.swift');
const lockfile = await text('pnpm-lock.yaml');

if (mobilePackage.dependencies['@open-outdoor/native-spikes'] !== 'workspace:*') {
  throw new Error('mobile must depend on the autolinked native spike workspace package');
}
if (!moduleConfig.platforms.includes('apple'))
  throw new Error('native spike must autolink on Apple');
requireText(podspec, "File.join(__dir__, 'package.json')", 'podspec');
requireText(podspec, "s.dependency 'ExpoModulesCore'", 'podspec');
requireText(podspec, "s.libraries      = 'sqlite3'", 'podspec');
requireText(podspec, "'CoreLocation', 'CoreMotion'", 'podspec');
requireText(tracker, 'allowsBackgroundLocationUpdates = true', 'tracker');
requireText(tracker, 'CMAltimeter', 'tracker');
requireText(tracker, 'completeUntilFirstUserAuthentication', 'tracker');
requireText(tracker, 'try fileHandle.synchronize()', 'tracker');
for (const functionName of [
  'requestAlwaysAuthorization',
  'startTracking',
  'stopTracking',
  'isTracking',
  'currentSessionId',
  'lastTrackingError',
]) {
  requireText(nativeModule, `AsyncFunction("${functionName}")`, 'native module');
  requireText(mobileBinding, `readonly ${functionName}`, 'mobile native binding');
}
requireText(nativeModule, '.runOnQueue(.main)', 'native module');
requireText(mobileApp, 'Start native tracking', 'mobile feasibility UI');
requireText(mobileApp, 'Stop native tracking', 'mobile feasibility UI');
requireText(storage, 'SQLITE_OPEN_READONLY', 'storage');
requireText(storage, 'SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE', 'storage');
requireText(storage, 'PRAGMA journal_mode=WAL', 'storage');
requireText(storage, 'resolvingSymlinksInPath()', 'storage');
requireText(storage, 'path.hasPrefix(rootPrefix)', 'storage');
requireText(policy, 'resourceValues.isExcludedFromBackup = true', 'file policy');
requireText(policy, '.protectionKey', 'file policy');
requireText(lockfile, 'link:../../packages/native-spikes', 'lockfile');

const info = app.expo.ios.infoPlist;
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
