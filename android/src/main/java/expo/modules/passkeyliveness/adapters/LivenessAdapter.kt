package expo.modules.passkeyliveness.adapters

import android.app.Activity
import org.json.JSONObject

interface LivenessAdapter {
  val providerName: String

  /**
   * Run the PAD ceremony.
   *
   * @return JSON-stringified completion payload (sessionId, etc.)
   * @throws expo.modules.passkeyliveness.LivenessException on cancel,
   *         permission denial, provider failure, or missing SDK.
   */
  suspend fun run(
    activity: Activity,
    bootstrap: JSONObject,
    timeoutMs: Int?,
    locale: String?,
  ): String
}

object LivenessAdapterRegistry {
  fun adapter(forProviderName: String): LivenessAdapter? = when (forProviderName) {
    RekognitionLivenessAdapter.PROVIDER_NAME -> RekognitionLivenessAdapter()
    IProovLivenessAdapter.PROVIDER_NAME -> IProovLivenessAdapter()
    else -> null
  }
}
