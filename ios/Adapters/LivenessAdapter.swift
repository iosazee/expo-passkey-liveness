import Foundation

/// Common contract for provider adapters on iOS.
///
/// All adapters take a bootstrap JSON object (server-supplied) and
/// resolve with a JSON string describing the completed session, or
/// throw a code/message pair the bridge surfaces as a JS Error.
protocol LivenessAdapter {
  static var providerName: String { get }
  func run(bootstrap: [String: Any], timeoutMs: Int?, locale: String?) async throws -> String
}

struct LivenessAdapterRegistry {
  /// Resolve an adapter by provider name. Returns nil when the
  /// underlying SDK was not compiled in.
  static func adapter(forProviderName name: String) -> LivenessAdapter? {
    switch name {
    case RekognitionLivenessAdapter.providerName:
      return RekognitionLivenessAdapter()
    case IProovLivenessAdapter.providerName:
      return IProovLivenessAdapter()
    default:
      return nil
    }
  }
}
