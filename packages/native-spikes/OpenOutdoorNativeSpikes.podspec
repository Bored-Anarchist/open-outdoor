require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'OpenOutdoorNativeSpikes'
  s.version        = package['version']
  s.summary        = 'Phase 0 native tracker and protected storage feasibility spikes.'
  s.description    = package['description'] || s.summary
  s.license        = 'Apache-2.0'
  s.author         = 'Open Outdoor contributors'
  s.homepage       = 'https://github.com/Bored-Anarchist/open-outdoor'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => 'https://github.com/Bored-Anarchist/open-outdoor.git', :tag => s.version.to_s }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.source_files   = 'ios/**/*.{h,m,mm,swift}'
  s.frameworks     = 'CoreLocation', 'CoreMotion', 'CryptoKit', 'Network', 'UIKit'
  s.pod_target_xcconfig = { 'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => '$(inherited) OPEN_OUTDOOR_PHASE0_DIAGNOSTICS' }
  s.libraries      = 'sqlite3'
  s.dependency 'ExpoModulesCore'
end
