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

    $workspaces = @(Get-ChildItem -Directory -Filter '*.xcworkspace')
    if ($workspaces.Count -ne 1) {
        throw "Expected one generated Xcode workspace, found $($workspaces.Count)."
    }
    $workspace = $workspaces[0]
    $scheme = [System.IO.Path]::GetFileNameWithoutExtension($workspace.Name)
    Write-Host "Building workspace '$($workspace.Name)' with scheme '$scheme'."
    xcodebuild -workspace $workspace.Name -scheme $scheme -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath ../../../dist/ios-derived CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
    if ($LASTEXITCODE -ne 0) { throw 'Unsigned Xcode build failed.' }
    $appBundles = @(Get-ChildItem -Path '../../../dist/ios-derived/Build/Products/Release-iphoneos' -Directory -Filter '*.app')
    if ($appBundles.Count -ne 1) {
        throw "Expected one built app bundle, found $($appBundles.Count)."
    }
    $builtInfoPlist = Join-Path $appBundles[0].FullName 'Info.plist'
    $diagnosticsOptIn = & /usr/libexec/PlistBuddy -c 'Print :OpenOutdoorPhase0DiagnosticsEnabled' $builtInfoPlist
    if ($LASTEXITCODE -ne 0 -or $diagnosticsOptIn -ne 'true') {
        throw 'Built app must explicitly enable Phase 0 diagnostics in Info.plist.'
    }
    Write-Host "Verified Phase 0 diagnostics opt-in in '$builtInfoPlist'."
    $providers = @(Get-ChildItem -Path 'Pods' -Filter 'ExpoModulesProvider.swift' -Recurse -File)
    $registeredProviders = @(
        $providers | Where-Object {
            $content = Get-Content -Raw -LiteralPath $_.FullName
            $content.Contains('internal import OpenOutdoorNativeSpikes') -and
                $content.Contains('OpenOutdoorNativeSpikesModule.self')
        }
    )
    if ($registeredProviders.Count -ne 1) {
        throw "Expected one Expo modules provider to register OpenOutdoorNativeSpikesModule, found $($registeredProviders.Count)."
    }
    Write-Host "Verified native module registration in '$($registeredProviders[0].FullName)'."
}
finally { Pop-Location }
