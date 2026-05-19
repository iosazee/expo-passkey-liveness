import ExpoModulesCore

/// Stable error codes returned to the JS layer. Mirror the values in
/// src/types/errors.ts so the `error.code` round-trip is clean across
/// the bridge.
enum LivenessExceptionCode: String {
  case notSupported = "liveness_not_supported"
  case cameraPermissionDenied = "liveness_camera_permission_denied"
  case userCanceled = "liveness_user_canceled"
  case providerError = "liveness_provider_error"
  case invalidBootstrap = "liveness_invalid_bootstrap"
}

final class LivenessException: GenericException<String> {
  override var reason: String {
    return param
  }
}

func livenessError(_ code: LivenessExceptionCode, _ message: String) -> LivenessException {
  return LivenessException("\(code.rawValue)::\(message)")
}
