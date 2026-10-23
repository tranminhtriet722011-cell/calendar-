/** Typed application errors mapped to stable HTTP statuses by the error middleware. */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, "bad_request", message, details);

export const unauthorized = (message = "Authentication required."): HttpError =>
  new HttpError(401, "unauthorized", message);

export const forbidden = (message = "You do not own this resource."): HttpError =>
  new HttpError(403, "forbidden", message);

export const notFound = (message = "Resource not found."): HttpError =>
  new HttpError(404, "not_found", message);

/** Optimistic concurrency failure (AT29, AT45). */
export const conflict = (message: string, details?: unknown): HttpError =>
  new HttpError(409, "conflict", message, details);

export const unprocessable = (message: string, details?: unknown): HttpError =>
  new HttpError(422, "unprocessable", message, details);
