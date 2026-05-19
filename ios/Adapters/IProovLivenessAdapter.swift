import Foundation
import UIKit

#if canImport(iProov)
import iProov
#endif

/// Wraps the iProov iOS SDK.
///
/// The `iProov` pod is added by the consumer's config plugin entry
/// when they list `"iproov"` under `providers`. When the pod is
/// absent this adapter compiles as a stub that throws
/// `LIVENESS_NOT_SUPPORTED`.
final class IProovLivenessAdapter: LivenessAdapter {
  static let providerName = "iproov"

  func run(bootstrap: [String: Any], timeoutMs: Int?, locale: String?) async throws -> String {
    guard let token = bootstrap["token"] as? String,
          let baseUrl = bootstrap["baseUrl"] as? String else {
      throw livenessError(
        .invalidBootstrap,
        "iProov bootstrap is missing token or baseUrl"
      )
    }

    #if canImport(iProov)
    return try await launchIProov(token: token, baseUrl: baseUrl)
    #else
    throw livenessError(
      .notSupported,
      "iProov pod is not installed. Add \"iproov\" to the expo-passkey-liveness config plugin providers list and re-run prebuild."
    )
    #endif
  }

  #if canImport(iProov)
  @MainActor
  private func launchIProov(token: String, baseUrl: String) async throws -> String {
    return try await withCheckedThrowingContinuation { continuation in
      let streamingURL = URL(string: baseUrl) ?? URL(string: "https://eu.rp.secure.iproov.me/api/v2/ws")!
      IProov.launch(
        streamingURL: streamingURL,
        token: token,
        callback: { status in
          switch status {
          case .success(let result):
            let payload: [String: Any] = [
              "sessionId": token,
              "localConfidence": result.frame != nil ? 1.0 : 0.0
            ]
            if let data = try? JSONSerialization.data(withJSONObject: payload),
               let str = String(data: data, encoding: .utf8) {
              continuation.resume(returning: str)
            } else {
              continuation.resume(
                throwing: livenessError(.providerError, "Failed to serialise iProov result")
              )
            }
          case .failure(let result):
            continuation.resume(
              throwing: livenessError(.providerError, result.reason.description)
            )
          case .canceled:
            continuation.resume(
              throwing: livenessError(.userCanceled, "User cancelled iProov check")
            )
          case .error(let error):
            // Reflect a permission-denied error to the canonical code.
            let description = String(describing: error)
            if description.lowercased().contains("camera") || description.lowercased().contains("permission") {
              continuation.resume(
                throwing: livenessError(.cameraPermissionDenied, description)
              )
            } else {
              continuation.resume(
                throwing: livenessError(.providerError, description)
              )
            }
          @unknown default:
            continuation.resume(
              throwing: livenessError(.providerError, "Unknown iProov status")
            )
          }
        }
      )
    }
  }
  #endif
}
