package expo.modules.passkeyliveness

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.passkeyliveness.adapters.LivenessAdapterRegistry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class ExpoPasskeyLivenessModule : Module() {

  private val scope = CoroutineScope(Dispatchers.Main)

  override fun definition() = ModuleDefinition {
    Name("ExpoPasskeyLivenessModule")

    Function("isLivenessSupported") {
      val ctx = appContext.reactContext ?: return@Function false
      ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FRONT)
    }

    AsyncFunction("runLivenessCheck") { options: Map<String, Any?>, promise: expo.modules.kotlin.Promise ->
      val providerName = options["provider"] as? String
      if (providerName.isNullOrEmpty()) {
        promise.reject(LivenessErrorCodes.INVALID_BOOTSTRAP, "Missing 'provider'", null)
        return@AsyncFunction
      }
      val bootstrapStr = options["bootstrap"] as? String
      if (bootstrapStr.isNullOrEmpty()) {
        promise.reject(LivenessErrorCodes.INVALID_BOOTSTRAP, "Missing 'bootstrap'", null)
        return@AsyncFunction
      }
      val bootstrap = try {
        JSONObject(bootstrapStr)
      } catch (err: Throwable) {
        promise.reject(LivenessErrorCodes.INVALID_BOOTSTRAP, "Bootstrap is not valid JSON: ${err.message}", err)
        return@AsyncFunction
      }
      val adapter = LivenessAdapterRegistry.adapter(providerName)
      if (adapter == null) {
        promise.reject(
          LivenessErrorCodes.NOT_SUPPORTED,
          "No adapter registered for provider $providerName. Add it to the expo-passkey-liveness config plugin providers list and rebuild.",
          null
        )
        return@AsyncFunction
      }

      val activity: Activity = appContext.currentActivity ?: run {
        promise.reject(
          LivenessErrorCodes.PROVIDER_ERROR,
          "No foreground activity available to host the liveness check",
          null
        )
        return@AsyncFunction
      }

      // Pre-flight: stable error when camera permission is already denied.
      val cameraGranted = ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED
      if (!cameraGranted) {
        promise.reject(
          LivenessErrorCodes.CAMERA_PERMISSION_DENIED,
          "Camera permission denied",
          null
        )
        return@AsyncFunction
      }

      val timeoutMs = (options["timeoutMs"] as? Number)?.toInt()
      val locale = options["locale"] as? String

      scope.launch {
        try {
          val payload = adapter.run(activity, bootstrap, timeoutMs, locale)
          promise.resolve(payload)
        } catch (err: LivenessException) {
          promise.reject(err.errorCode, err.message ?: err.errorCode, err)
        } catch (err: Throwable) {
          promise.reject(LivenessErrorCodes.PROVIDER_ERROR, err.message ?: err.toString(), err)
        }
      }
    }

    AsyncFunction("cancel") { promise: expo.modules.kotlin.Promise ->
      // No global cancel handle on Android yet — adapters resolve when
      // their activities finish, including when the user backs out.
      promise.resolve(null)
    }
  }
}
