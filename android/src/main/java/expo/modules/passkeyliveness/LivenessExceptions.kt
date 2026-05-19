package expo.modules.passkeyliveness

import expo.modules.kotlin.exception.CodedException

class LivenessException(val errorCode: String, message: String) : CodedException(message) {
  override fun getCode(): String = errorCode
}

object LivenessErrorCodes {
  const val NOT_SUPPORTED = "liveness_not_supported"
  const val CAMERA_PERMISSION_DENIED = "liveness_camera_permission_denied"
  const val USER_CANCELED = "liveness_user_canceled"
  const val PROVIDER_ERROR = "liveness_provider_error"
  const val INVALID_BOOTSTRAP = "liveness_invalid_bootstrap"
}
