import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [];
let stopping = false;

const isWindows = process.platform === "win32";

function npmCommand(args: string[]): { command: string; args: string[]; printed: string } {
  if (!isWindows) {
    return { command: "npm", args, printed: `npm ${args.join(" ")}` };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "npm.cmd", ...args],
    printed: `npm.cmd ${args.join(" ")}`,
  };
}

function start(label: string, npmArgs: string[], env: NodeJS.ProcessEnv = {}): void {
  const command = npmCommand(npmArgs);
  console.log(`[${label}] ${command.printed}`);

  if (process.env.STOPDOWN_REVIEWER_DEMO_DRY_RUN === "true") {
    return;
  }

  const child = spawn(command.command, command.args, {
    env: {
      ...process.env,
      ...env,
    },
    shell: false,
    stdio: "inherit",
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (stopping) {
      return;
    }

    console.error(`[${label}] exited unexpectedly: code=${String(code)} signal=${String(signal)}`);
    stopAll(code ?? 1);
  });
}

function stopAll(exitCode = 0): void {
  stopping = true;

  for (const child of children) {
    if (child.exitCode === null) {
      child.kill();
    }
  }

  process.exit(exitCode);
}

console.log("StopDown reviewer demo");
console.log("");
console.log("Starting fixture-backed API and mock-wallet frontend.");
console.log("Open http://127.0.0.1:5173/#overview after Vite prints its ready message.");
console.log("This is the UI review path, not live ARC settlement proof.");
console.log("");

start("api", ["run", "demo:api"], { PORT: process.env.PORT ?? "3000" });
start("frontend", ["run", "demo:frontend"]);

if (process.env.STOPDOWN_REVIEWER_DEMO_DRY_RUN === "true") {
  console.log("");
  console.log("Dry run complete.");
  process.exit(0);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
