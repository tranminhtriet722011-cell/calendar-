/** Shared harness for API integration tests: real Express app, real in-memory SQLite, real HTTP. */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app";
import { openDatabase, type DB } from "../server/db";

export interface TestServer {
  base: string;
  db: DB;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const db = openDatabase({ file: ":memory:" });
  const app = createApp({ db });
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${address.port}`,
    db,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export interface ApiResponse<T = any> {
  status: number;
  data: T;
  headers: Headers;
}

export async function call<T = any>(
  base: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { "content-type": "application/json", ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data: unknown = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: response.status, data: data as T, headers: response.headers };
}

export interface TestUser {
  token: string;
  id: string;
  username: string;
  timezone: string;
}

let counter = 0;

export async function registerUser(base: string, timezone = "UTC"): Promise<TestUser> {
  counter += 1;
  const username = `tester${counter}_${Math.random().toString(36).slice(2, 8)}`;
  const response = await call<{ token: string; user: { id: string; username: string; timezone: string } }>(
    base,
    "POST",
    "/api/auth/register",
    { body: { username, password: "correct-horse-battery", timezone } },
  );
  if (response.status !== 201) throw new Error(`registration failed: ${JSON.stringify(response.data)}`);
  return { token: response.data.token, id: response.data.user.id, username, timezone };
}

/** Convenience: UTC milliseconds for a wall clock hour on the fixed test date 2026-10-21. */
export function utc(hour: number, minute = 0, dayOffset = 0): number {
  return Date.UTC(2026, 9, 21 + dayOffset, hour, minute, 0, 0);
}
