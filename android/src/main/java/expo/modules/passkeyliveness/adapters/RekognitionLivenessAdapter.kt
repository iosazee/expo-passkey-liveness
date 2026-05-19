package expo.modules.passkeyliveness.adapters

import android.app.Activity
import android.content.Intent
import expo.modules.passkeyliveness.LivenessErrorCodes
import expo.modules.passkeyliveness.LivenessException
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Wraps Amplify Android's Face Liveness Compose component.
 *
 * The Amplify Liveness Gradle dependency (`com.amplifyframework.ui:liveness`)
 * is added by the consumer's config plugin entry when they list
 * "rekognition" under providers. We use reflection so this file
 * compiles whether or not the SDK is on the classpath; the runtime
 * Class.forName probe surfaces a stable LIVENESS_NOT_SUPPORTED when
 * the consumer has not opted in.
 *
 * The actual Compose composable is hosted by RekognitionLivenessActivity
 * (a small Activity we ship in src/main/java); the consumer must
 * register it in their AndroidManifest.xml via the config plugin.
 */
class RekognitionLivenessAdapter : LivenessAdapter {
  override val providerName: String = PROVIDER_NAME

  override suspend fun run(
    activity: Activity,
    bootstrap: JSONObject,
    timeoutMs: Int?,
    locale: String?,
  ): String {
    if (!isAmplifyLivenessOnClasspath()) {
      throw LivenessException(
        LivenessErrorCodes.NOT_SUPPORTED,
        "com.amplifyframework.ui:liveness is not on the classpath. Add \"rekognition\" to the expo-passkey-liveness config plugin providers list and rebuild."
      )
    }

    val sessionId = bootstrap.optString("sessionId").takeIf { it.isNotEmpty() }
      ?: throw LivenessException(LivenessErrorCodes.INVALID_BOOTSTRAP, "Rekognition bootstrap missing sessionId")
    val region = bootstrap.optString("region").takeIf { it.isNotEmpty() }
      ?: throw LivenessException(LivenessErrorCodes.INVALID_BOOTSTRAP, "Rekognition bootstrap missing region")

    return suspendCancellableCoroutine { cont ->
      val intent = Intent(activity, RekognitionLivenessActivity::class.java).apply {
        putExtra(RekognitionLivenessActivity.EXTRA_SESSION_ID, sessionId)
        putExtra(RekognitionLivenessActivity.EXTRA_REGION, region)
      }
      RekognitionLivenessActivity.pendingContinuation = { result ->
        when (result) {
          is RekognitionLivenessActivity.Result.Success -> {
            val payload = JSONObject().put("sessionId", result.sessionId).toString()
            cont.resume(payload)
          }
          is RekognitionLivenessActivity.Result.Cancelled ->
            cont.resumeWithException(
              LivenessException(LivenessErrorCodes.USER_CANCELED, "User cancelled the liveness check")
            )
          is RekognitionLivenessActivity.Result.PermissionDenied ->
            cont.resumeWithException(
              LivenessException(LivenessErrorCodes.CAMERA_PERMISSION_DENIED, "Camera permission denied")
            )
          is RekognitionLivenessActivity.Result.Error ->
            cont.resumeWithException(
              LivenessException(LivenessErrorCodes.PROVIDER_ERROR, result.message)
            )
        }
      }
      activity.startActivity(intent)
    }
  }

  private fun isAmplifyLivenessOnClasspath(): Boolean = try {
    Class.forName("com.amplifyframework.ui.liveness.ui.FaceLivenessDetector")
    true
  } catch (_: Throwable) {
    false
  }

  companion object {
    const val PROVIDER_NAME = "rekognition"
  }
}
