/**
 * @file Error codes and messages for the liveness extension.
 *
 * Mirrors the namespacing convention used by expo-passkey's
 * ERROR_CODES, so consumers handling both packages can use a
 * single error-code style across registration, authentication,
 * and liveness gating.
 */

export const ERROR_CODES = {
  LIVENESS: {
    NOT_CONFIGURED: "liveness_not_configured",
    NOT_SUPPORTED: "liveness_not_supported",
    CAMERA_PERMISSION_DENIED: "liveness_camera_permission_denied",
    USER_CANCELED: "liveness_user_canceled",
    PROVIDER_ERROR: "liveness_provider_error",
    SESSION_NOT_FOUND: "liveness_session_not_found",
    SESSION_EXPIRED: "liveness_session_expired",
    SESSION_ALREADY_CONSUMED: "liveness_session_already_consumed",
    PAD_BELOW_THRESHOLD: "liveness_pad_below_threshold",
    TOKEN_REQUIRED: "liveness_token_required",
    TOKEN_INVALID: "liveness_token_invalid",
    TOKEN_EXPIRED: "liveness_token_expired",
    TOKEN_AUDIENCE_MISMATCH: "liveness_token_audience_mismatch",
    TOKEN_CHALLENGE_MISMATCH: "liveness_token_challenge_mismatch",
    TOKEN_REPLAYED: "liveness_token_replayed",
    TOKEN_USER_MISMATCH: "liveness_token_user_mismatch",
    CONFIG_INVALID: "liveness_config_invalid",
  },
} as const;

export const ERROR_MESSAGES = {
  [ERROR_CODES.LIVENESS.NOT_CONFIGURED]:
    "Liveness is not configured on the server",
  [ERROR_CODES.LIVENESS.NOT_SUPPORTED]:
    "Liveness is not supported on this platform or device",
  [ERROR_CODES.LIVENESS.CAMERA_PERMISSION_DENIED]:
    "Camera permission was denied",
  [ERROR_CODES.LIVENESS.USER_CANCELED]:
    "The user canceled the liveness check",
  [ERROR_CODES.LIVENESS.PROVIDER_ERROR]:
    "The liveness provider returned an error",
  [ERROR_CODES.LIVENESS.SESSION_NOT_FOUND]:
    "Liveness session not found",
  [ERROR_CODES.LIVENESS.SESSION_EXPIRED]: "Liveness session has expired",
  [ERROR_CODES.LIVENESS.SESSION_ALREADY_CONSUMED]:
    "Liveness session has already been used",
  [ERROR_CODES.LIVENESS.PAD_BELOW_THRESHOLD]:
    "Presentation-attack-detection score is below the configured minimum",
  [ERROR_CODES.LIVENESS.TOKEN_REQUIRED]:
    "A liveness token is required for this operation",
  [ERROR_CODES.LIVENESS.TOKEN_INVALID]: "Liveness token is invalid",
  [ERROR_CODES.LIVENESS.TOKEN_EXPIRED]: "Liveness token has expired",
  [ERROR_CODES.LIVENESS.TOKEN_AUDIENCE_MISMATCH]:
    "Liveness token audience does not match this relying party",
  [ERROR_CODES.LIVENESS.TOKEN_CHALLENGE_MISMATCH]:
    "Liveness token was issued for a different challenge type",
  [ERROR_CODES.LIVENESS.TOKEN_REPLAYED]:
    "Liveness token has already been used",
  [ERROR_CODES.LIVENESS.TOKEN_USER_MISMATCH]:
    "Liveness token was issued for a different user",
  [ERROR_CODES.LIVENESS.CONFIG_INVALID]:
    "Liveness configuration is invalid",
} as const;
