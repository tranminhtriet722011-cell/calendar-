#!/usr/bin/env node
/**
 * Development launcher: starts the API (tsx watch) and the Vite client together and shuts both
 * down when either exits. No extra dependency, works the same on Windows and POSIX.
 */

import { spawn } from "node:child_process";

const children = [];
const commands = [
  { name: "api", command: "npx", args: ["tsx", "watch", "server/index.ts"] },
  { name: "web", command: "npx", args: ["vite"] },
];

let shuttingDown = false;

for (const spec of commands) {
  const child = spawn(spec.command, spec.args, { stdio: "inherit", shell: true, env: process.env });
  child.on("exit", (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[dev] ${spec.name} exited with ${code ?? "signal"}`);
    for (const other of children) {
      if (other !== child && !other.killed) other.kill();
    }
    process.exitCode = code === 0 ? 0 : 1;
  });
  children.push(child);
}

function stop(): void {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
