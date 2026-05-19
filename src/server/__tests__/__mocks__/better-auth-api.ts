/**
 * Jest mock for `better-auth/api`.
 *
 * The real module is ESM-only and breaks the CJS ts-jest transform.
 * We don't need its runtime behaviour to test endpoint handlers —
 * our tests pull `.handler` off the returned object and call it
 * with a mock ctx, so a tiny passthrough is enough.
 */

export function createAuthEndpoint(
  path: string,
  options: unknown,
  handler: (ctx: unknown) => unknown
) {
  return { path, options, handler };
}

export async function getSessionFromCtx(_ctx: unknown): Promise<null> {
  return null;
}

export function createAuthMiddleware<T extends (ctx: unknown) => unknown>(
  handler: T
): T {
  // Better Auth wraps the handler in middleware plumbing; for tests
  // we just want to call it directly.
  return handler;
}
