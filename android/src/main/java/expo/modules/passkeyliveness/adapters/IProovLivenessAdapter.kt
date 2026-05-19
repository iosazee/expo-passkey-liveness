package expo.modules.passkeyliveness.adapters

import android.app.Activity
import expo.modules.passkeyliveness.LivenessErrorCodes
import expo.modules.passkeyliveness.LivenessException
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Wraps the iProov Android SDK.
 *
 * The iProov Gradle dep (`com.iproov.sdk:iproov`) is consumer-installed
 * via the config plugin. SDK invocation is done via reflection so
 * this file compiles whether or not the SDK is on the classpath.
 */
class IProovLivenessAdapter : LivenessAdapter {
  override val providerName: String = PROVIDER_NAME

  override suspend fun run(
    activity: Activity,
    bootstrap: JSONObject,
    timeoutMs: Int?,
    locale: String?,
  ): String {
    val iproovCls = try {
      Class.forName("com.iproov.sdk.IProov")
    } catch (_: Throwable) {
      throw LivenessException(
        LivenessErrorCodes.NOT_SUPPORTED,
        "com.iproov.sdk:iproov is not on the classpath. Add \"iproov\" to the expo-passkey-liveness config plugin providers list and rebuild."
      )
    }

    val token = bootstrap.optString("token").takeIf { it.isNotEmpty() }
      ?: throw LivenessException(LivenessErrorCodes.INVALID_BOOTSTRAP, "iProov bootstrap missing token")
    val baseUrl = bootstrap.optString("baseUrl").takeIf { it.isNotEmpty() }
      ?: throw LivenessException(LivenessErrorCodes.INVALID_BOOTSTRAP, "iProov bootstrap missing baseUrl")

    return suspendCancellableCoroutine { cont ->
      try {
        // Reflection invocation of IProov.launch(Context, String, String, IProov.Listener).
        // The Listener interface is implemented dynamically below.
        val listenerCls = Class.forName("com.iproov.sdk.IProov\$Listener")
        val proxy = java.lang.reflect.Proxy.newProxyInstance(
          listenerCls.classLoader,
          arrayOf(listenerCls),
        ) { _, method, args ->
          val name = method.name
          when {
            name.equals("onSuccess", true) -> {
              cont.resume(JSONObject().put("sessionId", token).toString())
            }
            name.equals("onFailure", true) -> {
              val reason = args?.firstOrNull()?.toString() ?: "iProov failure"
              cont.resumeWithException(
                LivenessException(LivenessErrorCodes.PROVIDER_ERROR, reason)
              )
            }
            name.equals("onCancelled", true) -> {
              cont.resumeWithException(
                LivenessException(LivenessErrorCodes.USER_CANCELED, "User cancelled iProov check")
              )
            }
            name.equals("onError", true) -> {
              val reason = args?.firstOrNull()?.toString() ?: "iProov error"
              val code = if (reason.contains("permission", true) || reason.contains("camera", true)) {
                LivenessErrorCodes.CAMERA_PERMISSION_DENIED
              } else {
                LivenessErrorCodes.PROVIDER_ERROR
              }
              cont.resumeWithException(LivenessException(code, reason))
            }
          }
          null
        }

        val launchMethod = iproovCls.methods.firstOrNull { it.name == "launch" }
          ?: throw NoSuchMethodException("IProov.launch not found in installed SDK")
        launchMethod.invoke(null, activity, baseUrl, token, proxy)
      } catch (err: Throwable) {
        cont.resumeWithException(
          LivenessException(LivenessErrorCodes.PROVIDER_ERROR, err.localizedMessage ?: err.toString())
        )
      }
    }
  }

  companion object {
    const val PROVIDER_NAME = "iproov"
  }
}
