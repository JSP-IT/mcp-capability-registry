import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { compareSnapshots } from "./compare.js";
import { demoAfter, demoBefore } from "./demo.js";
import { normalizeSnapshot } from "./snapshot.js";

export interface RunIO {
  stdout(text: string): void;
  stderr(text: string): void;
}

const processIO: RunIO = {
  stdout: (text) => process.stdout.write(text + "\n"),
  stderr: (text) => process.stderr.write(text + "\n")
};

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

class UsageError extends Error {}

export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "unknown";
}

function usage(): string {
  return `mcp-capability-registry v${packageVersion()}

Usage:
  mcp-capability-registry snapshot <input.json> [output.json]
  mcp-capability-registry compare <before.json> <after.json> [output.json]
  mcp-capability-registry demo
  mcp-capability-registry --help | --version

Inputs may be raw MCP capability JSON or snapshots written by the snapshot command.
Snapshots are read locally; no MCP servers are contacted and no MCP tools are executed.

Exit codes: 0 success, 1 error, 2 invalid usage.`;
}

function expectArgs(command: string, args: string[], min: number, max: number): void {
  if (args.length < min || args.length > max) {
    throw new UsageError(`${command}: expected ${min === max ? min : `${min}-${max}`} argument(s), got ${args.length}`);
  }
}

async function readJSON(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(code === "ENOENT" ? `${path}: file not found` : `${path}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown;
  } catch (error) {
    throw new Error(`${path}: invalid JSON (${(error as Error).message})`);
  }
}

async function load(path: string) {
  try {
    return normalizeSnapshot(await readJSON(path));
  } catch (error) {
    const message = (error as Error).message;
    throw new Error(message.startsWith(path) ? message : `${path}: ${message}`);
  }
}

async function emit(io: RunIO, path: string | undefined, value: unknown): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  if (path) {
    await writeFile(path, json + "\n", "utf8");
    io.stderr(`Wrote ${path}`);
  } else {
    io.stdout(json);
  }
}

/** Runs the CLI with the given arguments (excluding `node` and the script path) and returns the exit code. */
export async function run(argv: readonly string[], io: RunIO = processIO): Promise<number> {
  const [command, ...args] = argv;

  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.stdout(usage());
        return EXIT_OK;
      case "--version":
      case "-v":
        io.stdout(packageVersion());
        return EXIT_OK;
      case "snapshot":
        expectArgs(command, args, 1, 2);
        await emit(io, args[1], await load(args[0]));
        return EXIT_OK;
      case "compare": {
        expectArgs(command, args, 2, 3);
        const [before, after] = await Promise.all([load(args[0]), load(args[1])]);
        await emit(io, args[2], compareSnapshots(before, after));
        return EXIT_OK;
      }
      case "demo": {
        expectArgs(command, args, 0, 0);
        const before = normalizeSnapshot(demoBefore());
        const after = normalizeSnapshot(demoAfter());
        await emit(io, undefined, { before, after, comparison: compareSnapshots(before, after) });
        return EXIT_OK;
      }
      default:
        throw new UsageError(`unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`error: ${error.message}\n\n${usage()}`);
      return EXIT_USAGE;
    }
    io.stderr(`error: ${(error as Error).message}`);
    return EXIT_ERROR;
  }
}
