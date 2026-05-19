import ExpoModulesCore
import AVFoundation

public class ExpoPasskeyLivenessModule: Module {
  /// Cancellation handle for the in-flight adapter run, if any.
  private var cancelHandler: (() -> Void)?

  public func definition() -> ModuleDefinition {
    Name("ExpoPasskeyLivenessModule")

    Function("isLivenessSupported") { () -> Bool in
      return AVCaptureDevice.default(
        .builtInWideAngleCamera,
        for: .video,
        position: .front
      ) != nil
    }

    AsyncFunction("runLivenessCheck") { (options: [String: Any], promise: Promise) in
      guard let providerName = options["provider"] as? String else {
        promise.reject(
          "liveness_invalid_bootstrap",
          "runLivenessCheck: 'provider' is required"
        )
        return
      }
      guard let bootstrapStr = options["bootstrap"] as? String,
            let bootstrapData = bootstrapStr.data(using: .utf8),
            let bootstrap = try? JSONSerialization.jsonObject(with: bootstrapData) as? [String: Any] else {
        promise.reject(
          "liveness_invalid_bootstrap",
          "runLivenessCheck: 'bootstrap' is not valid JSON"
        )
        return
      }

      guard let adapter = LivenessAdapterRegistry.adapter(forProviderName: providerName) else {
        promise.reject(
          "liveness_not_supported",
          "No adapter registered for provider \(providerName). Add it to the expo-passkey-liveness config plugin providers list and re-run prebuild."
        )
        return
      }

      let timeoutMs = options["timeoutMs"] as? Int
      let locale = options["locale"] as? String

      // Pre-flight: explicit camera permission check, since the
      // Amplify pod will prompt internally but we want a stable code
      // when permission is already denied.
      let status = AVCaptureDevice.authorizationStatus(for: .video)
      if status == .denied || status == .restricted {
        promise.reject("liveness_camera_permission_denied", "Camera permission denied")
        return
      }

      Task {
        do {
          let payload = try await adapter.run(
            bootstrap: bootstrap,
            timeoutMs: timeoutMs,
            locale: locale
          )
          promise.resolve(payload)
        } catch let err as LivenessException {
          // err.reason carries "code::message"
          let parts = err.reason.split(separator: ":", maxSplits: 1).map(String.init)
          let code = parts.first ?? "liveness_provider_error"
          let message = parts.count > 1 ? parts[1].trimmingCharacters(in: CharacterSet(charactersIn: ":")) : err.reason
          promise.reject(code, message)
        } catch {
          promise.reject("liveness_provider_error", error.localizedDescription)
        }
      }
    }

    AsyncFunction("cancel") { (promise: Promise) in
      self.cancelHandler?()
      self.cancelHandler = nil
      promise.resolve(nil)
    }
  }
}
