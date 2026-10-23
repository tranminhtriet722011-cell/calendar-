/**
 * Persistence: SQLite via the Node built-in `node:sqlite` module (Decision D-002, D-007).
 *
 * - One local file per location (`data/ape.db` by default, gitignored), or `:memory:` in tests.
 * - Ordered, versioned migrations recorded in `schema_migrations`; never a destructive reset.
 * - Every mutable entity carries `revision` for optimistic concurrency (spec E2.4, AT29/AT45).
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type DB = DatabaseSync;

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "identity",
    sql: `
      CREATE TABLE users (
        id             TEXT PRIMARY KEY,
        username       TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        timezone       TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
        settings       TEXT NOT NULL DEFAULT '{}',
        created_at     INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL UNIQUE,
        expires_at  INTEGER NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
    `,
  },
  {
    version: 2,
    name: "planning-core",
    sql: `
      CREATE TABLE goals (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        metric_type  TEXT NOT NULL DEFAULT 'count',
        target       REAL NOT NULL DEFAULT 0,
        current      REAL NOT NULL DEFAULT 0,
        due_at       INTEGER,
        status       TEXT NOT NULL DEFAULT 'active',
        revision     INTEGER NOT NULL DEFAULT 1,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );
      CREATE INDEX idx_goals_user ON goals(user_id);

      CREATE TABLE milestones (
        id          TEXT PRIMARY KEY,
        goal_id     TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'open',
        revision    INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_milestones_goal ON milestones(goal_id);

      CREATE TABLE tasks (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title              TEXT NOT NULL,
        notes              TEXT NOT NULL DEFAULT '',
        status             TEXT NOT NULL DEFAULT 'not_started',
        priority           INTEGER NOT NULL DEFAULT 3,
        due_at             INTEGER,
        earliest_start     INTEGER,
        estimated_minutes  INTEGER NOT NULL DEFAULT 0,
        remaining_minutes  INTEGER NOT NULL DEFAULT 0,
        goal_id            TEXT REFERENCES goals(id) ON DELETE SET NULL,
        parent_id          TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        position           INTEGER NOT NULL DEFAULT 0,
        min_block_minutes  INTEGER NOT NULL DEFAULT 15,
        max_block_minutes  INTEGER NOT NULL DEFAULT 90,
        splittable         INTEGER NOT NULL DEFAULT 1,
        locked             INTEGER NOT NULL DEFAULT 0,
        revision           INTEGER NOT NULL DEFAULT 1,
        archived           INTEGER NOT NULL DEFAULT 0,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      );
      CREATE INDEX idx_tasks_user ON tasks(user_id, archived);
      CREATE INDEX idx_tasks_goal ON tasks(goal_id);

      CREATE TABLE events (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        start_at    INTEGER NOT NULL,
        end_at      INTEGER NOT NULL,
        kind        TEXT NOT NULL DEFAULT 'fixed',
        locked      INTEGER NOT NULL DEFAULT 1,
        revision    INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_events_user_time ON events(user_id, start_at);

      CREATE TABLE blocks (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        start_at    INTEGER NOT NULL,
        end_at      INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'planned',
        locked      INTEGER NOT NULL DEFAULT 0,
        source      TEXT NOT NULL DEFAULT 'user',
        revision    INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_blocks_user_time ON blocks(user_id, start_at);
      CREATE INDEX idx_blocks_task ON blocks(task_id);
    `,
  },
  {
    version: 3,
    name: "execution-habits",
    sql: `
      CREATE TABLE work_sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        block_id    TEXT REFERENCES blocks(id) ON DELETE SET NULL,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER,
        minutes     INTEGER NOT NULL,
        source      TEXT NOT NULL DEFAULT 'manual',
        note        TEXT NOT NULL DEFAULT '',
        remaining_after INTEGER,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_work_task ON work_sessions(task_id);
      CREATE INDEX idx_work_user_time ON work_sessions(user_id, started_at);

      CREATE TABLE habit_definitions (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        goal_id       TEXT REFERENCES goals(id) ON DELETE SET NULL,
        cadence       TEXT NOT NULL DEFAULT 'weekly',
        target_count  INTEGER NOT NULL DEFAULT 4,
        min_session_minutes INTEGER NOT NULL DEFAULT 0,
        max_session_minutes INTEGER NOT NULL DEFAULT 0,
        paused        INTEGER NOT NULL DEFAULT 0,
        pause_policy  TEXT NOT NULL DEFAULT 'exclude',
        revision      INTEGER NOT NULL DEFAULT 1,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX idx_habits_user ON habit_definitions(user_id);

      CREATE TABLE habit_checkins (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        habit_id    TEXT NOT NULL REFERENCES habit_definitions(id) ON DELETE CASCADE,
        occurred_at INTEGER NOT NULL,
        minutes     INTEGER NOT NULL DEFAULT 0,
        source      TEXT NOT NULL DEFAULT 'manual',
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_checkins_habit ON habit_checkins(habit_id, occurred_at);
    `,
  },
  {
    version: 4,
    name: "proposals-audit",
    sql: `
      CREATE TABLE proposals (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL DEFAULT 'schedule',
        strategy      TEXT NOT NULL,
        payload       TEXT NOT NULL,
        base_revisions TEXT NOT NULL DEFAULT '{}',
        status        TEXT NOT NULL DEFAULT 'pending',
        trigger       TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT,
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL,
        resolved_at   INTEGER
      );
      CREATE INDEX idx_proposals_user ON proposals(user_id, status);

      CREATE TABLE audit_events (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor         TEXT NOT NULL,
        action        TEXT NOT NULL,
        entity_type   TEXT NOT NULL,
        entity_id     TEXT NOT NULL,
        before_json   TEXT,
        after_json    TEXT,
        reason        TEXT NOT NULL DEFAULT '',
        proposal_id   TEXT,
        undoable      INTEGER NOT NULL DEFAULT 1,
        undone_at     INTEGER,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX idx_audit_user_time ON audit_events(user_id, created_at);

      CREATE TABLE idempotency_keys (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key           TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        UNIQUE(user_id, key)
      );
    `,
  },
  {
    version: 5,
    name: "habit-pause-windows",
    // AT33: a pause has a bounded window and a policy, so occurrences inside the window can be
    // excluded from (or counted in) period attainment instead of being silently skipped.
    sql: `
      CREATE TABLE habit_pauses (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        habit_id    TEXT NOT NULL REFERENCES habit_definitions(id) ON DELETE CASCADE,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER,
        policy      TEXT NOT NULL DEFAULT 'exclude',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_habit_pauses_habit ON habit_pauses(habit_id, started_at);
    `,
  },
];

export interface OpenOptions {
  /** File path, or `:memory:` for tests. */
  file: string;
}

export function openDatabase(options: OpenOptions): DB {
  if (options.file !== ":memory:") {
    mkdirSync(dirname(resolve(options.file)), { recursive: true });
  }
  const db = new DatabaseSync(options.file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  );`);
  const applied = new Set<number>();
  for (const row of db.prepare("SELECT version FROM schema_migrations").all()) {
    applied.add(Number((row as { version: number }).version));
  }
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        Date.now(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function closeDatabase(db: DB): void {
  db.close();
}
