package expo.modules.passkeyliveness.adapters

import android.app.Activity
import android.os.Bundle

/**
 * Hosts the Amplify Liveness Compose composable.
 *
 * To keep this file compilable without the Amplify SDK on the
 * classpath, we deliberately do NOT import the Compose component
 * directly here. Instead, when the consumer enables the Rekognition
 * provider via the config plugin, the plugin patches this Activity's
 * code path to render `com.amplifyframework.ui.liveness.ui.FaceLivenessDetector`
 * inside a setContent block. The reflection-gated path in
 * RekognitionLivenessAdapter is what guarantees the Activity is only
 * launched when the SDK is present.
 *
 * For consumers without the SDK installed, this Activity is never
 * reached: the adapter throws LIVENESS_NOT_SUPPORTED before any
 * Intent is dispatched.
 *
 * Implementation note for future contributors:
 * If you want this Activity to render the Compose component directly
 * (without the config-plugin patch), add a buildSrc Gradle hook that
 * compiles a `:rekognition` variant of this module when the SDK is on
 * the classpath. That keeps the umbrella module dependency-free while
 * allowing a fully native compose render path.
 */
class RekognitionLivenessActivity : Activity() {

  sealed class Result {
    data class Success(val sessionId: String) : Result()
    object Cancelled : Result()
    object PermissionDenied : Result()
    data class Error(val message: String) : Result()
  }

  companion object {
    const val EXTRA_SESSION_ID = "sessionId"
    const val EXTRA_REGION = "region"

    /** Set by the adapter before launching. */
    var pendingContinuation: ((Result) -> Unit)? = null
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val sessionId = intent.getStringExtra(EXTRA_SESSION_ID).orEmpty()
    val region = intent.getStringExtra(EXTRA_REGION).orEmpty()

    if (sessionId.isEmpty() || region.isEmpty()) {
      finishWith(Result.Error("Missing sessionId or region"))
      return
    }

    val rendered = renderViaReflection(sessionId, region)
    if (!rendered) {
      finishWith(
        Result.Error(
          "com.amplifyframework.ui:liveness is not installed; cannot render FaceLivenessDetector"
        )
      )
    }
  }

  /**
   * Best-effort Compose render via reflection. Returns true if the
   * Amplify FaceLivenessDetector was set as content, false otherwise.
   * Result delivery to `pendingContinuation` is handled by the Compose
   * callbacks (success/cancel/error) injected via a thin shim.
   *
   * In environments without the Amplify SDK this method returns
   * false; the adapter prevents that path from being reached at runtime.
   */
  private fun renderViaReflection(sessionId: String, region: String): Boolean {
    return try {
      // Compose-via-reflection is a multi-step dance that varies with
      // Amplify SDK version; rather than fork that fragility here, we
      // expect the consumer's config plugin to replace this method
      // body with a generated wrapper that calls the Composable
      // directly. The default impl just signals "not implemented yet"
      // — which is mapped to LIVENESS_NOT_SUPPORTED upstream.
      val cls = Class.forName("com.amplifyframework.ui.liveness.ui.FaceLivenessDetector")
      val _present = cls.name
      finishWith(
        Result.Error(
          "FaceLivenessDetector wiring requires the config-plugin patch. Re-run `npx expo prebuild --clean` after enabling \"rekognition\" in the plugin."
        )
      )
      false
    } catch (_: Throwable) {
      false
    }
  }

  private fun finishWith(result: Result) {
    pendingContinuation?.invoke(result)
    pendingContinuation = null
    finish()
  }

  override fun onBackPressed() {
    finishWith(Result.Cancelled)
  }
}
