import Foundation
import UIKit
import SwiftUI

#if canImport(FaceLiveness)
import FaceLiveness
#endif

/// Wraps Amplify Swift's `FaceLivenessDetectorView`.
///
/// The Amplify Face Liveness pod (`AmplifyUIFaceLiveness`) is added
/// by the consumer's config plugin entry when they list
/// `"rekognition"` under `providers`. When the pod is absent this
/// adapter compiles as a stub that throws `LIVENESS_NOT_SUPPORTED`,
/// keeping the umbrella module buildable for consumers who do not
/// use Rekognition.
final class RekognitionLivenessAdapter: LivenessAdapter {
  static let providerName = "rekognition"

  func run(bootstrap: [String: Any], timeoutMs: Int?, locale: String?) async throws -> String {
    guard let sessionId = bootstrap["sessionId"] as? String,
          let region = bootstrap["region"] as? String else {
      throw livenessError(
        .invalidBootstrap,
        "Rekognition bootstrap is missing sessionId or region"
      )
    }

    #if canImport(FaceLiveness)
    return try await presentFaceLiveness(sessionId: sessionId, region: region)
    #else
    throw livenessError(
      .notSupported,
      "AmplifyUIFaceLiveness pod is not installed. Add \"rekognition\" to the expo-passkey-liveness config plugin providers list and re-run prebuild."
    )
    #endif
  }

  #if canImport(FaceLiveness)
  @MainActor
  private func presentFaceLiveness(sessionId: String, region: String) async throws -> String {
    return try await withCheckedThrowingContinuation { continuation in
      guard let root = topMostViewController() else {
        continuation.resume(
          throwing: livenessError(.providerError, "No root view controller available")
        )
        return
      }

      // Box so the host VC can be dismissed from inside the closure.
      let hostRef = HostRef()

      let view = FaceLivenessDetectorView(
        sessionID: sessionId,
        region: region,
        isPresented: Binding<Bool>(
          get: { hostRef.host != nil },
          set: { newValue in
            if !newValue {
              hostRef.host?.dismiss(animated: true) { hostRef.host = nil }
            }
          }
        ),
        onCompletion: { result in
          DispatchQueue.main.async {
            hostRef.host?.dismiss(animated: true) { hostRef.host = nil }
            switch result {
            case .success:
              let payload: [String: Any] = [
                "sessionId": sessionId
              ]
              if let data = try? JSONSerialization.data(withJSONObject: payload),
                 let str = String(data: data, encoding: .utf8) {
                continuation.resume(returning: str)
              } else {
                continuation.resume(
                  throwing: livenessError(.providerError, "Failed to serialise completion payload")
                )
              }
            case .failure(let error):
              continuation.resume(
                throwing: Self.mapFaceLivenessError(error)
              )
            }
          }
        }
      )

      let host = UIHostingController(rootView: view)
      host.modalPresentationStyle = .fullScreen
      hostRef.host = host
      root.present(host, animated: true, completion: nil)
    }
  }

  private static func mapFaceLivenessError(_ error: FaceLivenessDetectionError) -> LivenessException {
    switch error {
    case .userCancelled:
      return livenessError(.userCanceled, "User cancelled the liveness check")
    case .accessDenied, .cameraPermissionDenied:
      return livenessError(.cameraPermissionDenied, "Camera permission denied")
    default:
      return livenessError(.providerError, String(describing: error))
    }
  }
  #endif

  private func topMostViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
    let windowScene = scenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
    let keyWindow = windowScene?.windows.first(where: { $0.isKeyWindow })
    var vc = keyWindow?.rootViewController
    while let presented = vc?.presentedViewController {
      vc = presented
    }
    return vc
  }
}

/// Reference box so we can flip the SwiftUI binding from outside.
private final class HostRef {
  var host: UIViewController?
}
