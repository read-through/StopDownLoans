import { spawnSync } from "node:child_process";

type Check = {
  command: string;
  args: string[];
  label: string;
};

const npmCli = process.env.npm_execpath;
if (npmCli === undefined) {
  throw new Error("Run this check through npm: corepack npm run release:check");
}

const checks: Check[] = [
  { command: process.execPath, args: [npmCli, "test"], label: "smart-contract tests" },
  { command: process.execPath, args: [npmCli, "run", "test:backend"], label: "backend tests" },
  { command: process.execPath, args: [npmCli, "run", "build:backend"], label: "backend build" },
  { command: process.execPath, args: [npmCli, "run", "build:frontend"], label: "frontend build" },
  { command: process.execPath, args: [npmCli, "audit", "--omit=dev"], label: "production dependency audit" },
  { command: "docker", args: ["build", "-t", "stopdown-release-check", "."], label: "production Docker image" },
  { command: "git", args: ["diff", "--check"], label: "Git whitespace check" },
];

for (const check of checks) {
  console.log(`\n==> ${check.label}`);
  const result = spawnSync(check.command, check.args, { stdio: "inherit", shell: false });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nStopDown release check passed.");
