/**
 * Jest mock for `better-call`.
 *
 * The real module imports rou3 (ESM-only) which breaks the CJS
 * ts-jest transform. We only depend on `APIError`, so a minimal
 * subclass of Error captures the data the tests assert against.
 */

export class APIError extends Error {
  body: { code: string; message: string };
  status: string;
  constructor(
    status: string,
    body: { code: string; message: string }
  ) {
    super(body.message);
    this.name = "APIError";
    this.status = status;
    this.body = body;
  }
}
