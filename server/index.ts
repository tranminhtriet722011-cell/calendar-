/**
 * Server entrypoint.
 *
 * Environment (no secrets, defaults work out of the box):
 *   APE_PORT      — TCP port, default 8787
 *   APE_DB_FILE   — SQLite path, default ./data/ape.db (gitignored)
 *   APE_STATIC    — built client directory, default ./dist/client
 */

import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "./app";
import { closeDatabase, openDatabase } from "./db";

const port = Number(process.env.APE_PORT ?? 8787);
const dbFile = process.env.APE_DB_FILE ?? resolve(process.cwd(), "data", "ape.db");
const staticDir = process.env.APE_STATIC ?? resolve(process.cwd(), "dist", "client");

const db = openDatabase({ file: dbFile });
const app = createApp({ db, staticDir });
const server = createServer(app);

server.listen(port, "127.0.0.1", () => {
  console.log(`[ape] listening on http://127.0.0.1:${port}`);
  console.log(`[ape] database ${dbFile}`);
  console.log(`[ape] client   ${staticDir}`);
});

function shutdown(signal: string): void {
  console.log(`[ape] ${signal} received, closing`);
  server.close(() => {
    closeDatabase(db);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
