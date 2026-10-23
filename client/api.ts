/**
 * Minimal typed fetch helper for the local APE API.
 *
 * - JSON in/out, bearer token stored in localStorage.
 * - Errors are thrown as `ApiError` carrying the server's `{ code, message, details }` contract.
 * - Any 401 outside the sign-in endpoints clears the token and notifies subscribers so the app
 *   can drop back to the sign-in screen.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TOKEN_KEY = "ape.token";
const AUTH_PATHS = new Set(["/api/auth/login", "/api/auth/register"]);

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable: the in-memory session for this page still works.
  }
}

/** Subscribe to "the server says 401" so the app can return to the sign-in screen. */
export function subscribeUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) listener();
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the local API server. Start it with npm run dev, then retry.");
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as { error?: Partial<ApiErrorBody> } | null;
    const error = new ApiError(
      response.status,
      body?.error?.code ?? "unknown_error",
      body?.error?.message ?? `Request failed with status ${response.status}.`,
      body?.error?.details ?? null,
    );
    if (response.status === 401 && !AUTH_PATHS.has(path)) {
      setToken(null);
      notifyUnauthorized();
    }
    throw error;
  }

  return payload as T;
}

export const apiGet = <T>(path: string, query?: RequestOptions["query"]): Promise<T> =>
  apiRequest<T>(path, { method: "GET", query });

export const apiPost = <T>(path: string, body?: unknown): Promise<T> => apiRequest<T>(path, { method: "POST", body });

export const apiPatch = <T>(path: string, body?: unknown): Promise<T> => apiRequest<T>(path, { method: "PATCH", body });

export const apiDelete = (path: string): Promise<void> => apiRequest<void>(path, { method: "DELETE" });

/** Human-readable message for any thrown value, preferring the server's message. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}
