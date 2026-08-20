[CmdletBinding()]
param()

if ($IsWindows) {
    throw 'The unsigned iOS archive must be built by the pinned macOS workflow. See docs/IOS_SIDELOAD_FEASIBILITY.md.'
}

pnpm --filter @open-outdoor/mobile exec expo prebuild --platform ios --no-install --clean
if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
Push-Location 'apps/mobile/ios'
try {
    pod install
    if ($LASTEXITCODE -ne 0) { throw 'CocoaPods install failed.' }
    xcodebuild -workspace OpenOutdoor.xcworkspace -scheme OpenOutdoor -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath ../../../dist/ios-derived CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
    if ($LASTEXITCODE -ne 0) { throw 'Unsigned Xcode build failed.' }
}
finally { Pop-Location }
