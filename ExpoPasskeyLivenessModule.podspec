require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = "ExpoPasskeyLivenessModule"
  s.version        = package["version"]
  s.summary        = package["description"]
  s.description    = package["description"]
  s.homepage       = package["homepage"] || "https://github.com/iosazee/expo-passkey-liveness"
  s.license        = package["license"] || "MIT"
  s.author         = package["author"] || "Zee Mudia"

  s.platform       = :ios, "15.0"
  s.swift_version  = "5.0"

  s.source         = { :path => "." }
  s.source_files   = "ios/**/*.{swift,h,m}"

  s.static_framework = true

  s.dependency "ExpoModulesCore"

  s.frameworks = "AVFoundation", "CoreMedia", "UIKit"

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_OPTIMIZATION_LEVEL' => '-Onone'
  }
end
