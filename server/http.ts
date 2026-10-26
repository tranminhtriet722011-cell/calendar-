/** HTTP plumbing: authentication middleware, field validation and the error contract. */

import type { NextFunction, Request, Response } from "express";
import type { DB } from "./db";
import { HttpError, badRequest, unauthorized } from "./errors";
import { findUserByToken, type User } from "./store";

export interface AuthedRequest extends Request {
  user: User;
  token: string;
}

function bearer(req: Request): string | null {
  const header = req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const alt = req.header("x-ape-token");
  return alt ? alt.trim() : null;
}

export function requireUser(db: DB) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = bearer(req);
    if (!token) {
      next(unauthorized());
      return;
    }
    const user = findUserByToken(db, token);
    if (!user) {
      next(unauthorized("Session expired. Sign in again."));
      return;
    }
    (req as unknown as AuthedRequest).user = user;
    (req as unknown as AuthedRequest).token = token;
    next();
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details ?? null } });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: { code: "bad_json", message: "Request body is not valid JSON." } });
    return;
  }
  // Never leak stack traces, SQL or internal messages to the client (spec §7.1); they stay in the
  // server log only. Anything the client can act on must arrive as a typed HttpError above.
  console.error("[ape] unhandled", error instanceof Error ? error.stack : error);
  res.status(500).json({ error: { code: "internal", message: "Unexpected server error." } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "not_found", message: "Endpoint not found." } });
}

// --- field helpers ---------------------------------------------------------

export function asString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || value.trim().length === 0) throw badRequest(`${field} is required.`, { field });
  if (value.length > maxLength) throw badRequest(`${field} is too long (max ${maxLength}).`, { field });
  return value.trim();
}

export function optionalString(value: unknown, field: string, maxLength = 5000): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw badRequest(`${field} must be text.`, { field });
  if (value.length > maxLength) throw badRequest(`${field} is too long (max ${maxLength}).`, { field });
  return value;
}

/**
 * A title for *update* payloads: absent/undefined keeps the current value, but an empty or
 * whitespace-only string is a 400 — no entity can lose its name through PATCH (APE-ACCEPT-002
 * audit: `PATCH {title: ""}` used to answer 200 and blank the record, while creation has always
 * required a non-empty title).
 */
export function optionalTitle(value: unknown, field: string, maxLength = 300): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw badRequest(`${field} must be text.`, { field });
  if (value.trim().length === 0) throw badRequest(`${field} is required.`, { field });
  if (value.length > maxLength) throw badRequest(`${field} is too long (max ${maxLength}).`, { field });
  return value.trim();
}

/**
 * A cross-entity reference id (`goalId`, `parentId`, `blockId` …). Absent stays `undefined`, an
 * explicit `null` stays `null` (unlink — REV-A-10), and empty/whitespace-only text is rejected up
 * front (REV-A-02: `""` used to slip past the truthy owner checks and detonate as a foreign-key
 * 500). Anything else must look like an id.
 */
export function optionalReferenceId(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw badRequest(`${field} must be text.`, { field });
  if (value.trim().length === 0) throw badRequest(`${field} must be a valid id.`, { field });
  if (value.length > 64) throw badRequest(`${field} is too long (max 64).`, { field });
  return value;
}

export function optionalInstant(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw badRequest(`${field} must be a timestamp.`, { field });
  return Math.round(parsed);
}

export function optionalInt(value: unknown, field: string, min = 0, max = 1_000_000): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw badRequest(`${field} must be a number.`, { field });
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function optionalBool(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw badRequest(`${field} must be true or false.`, { field });
  return value;
}

export function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${field} must be one of: ${allowed.join(", ")}.`, { field });
  }
  return value as T;
}

export function idempotencyKeyOf(headerValue: string | undefined, bodyKey: unknown): string | null {
  const candidate = headerValue ?? (typeof bodyKey === "string" ? bodyKey : null);
  if (!candidate) return null;
  if (candidate.length > 200) throw badRequest("Idempotency key is too long.");
  return candidate;
}
