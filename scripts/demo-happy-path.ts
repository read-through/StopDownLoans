import { spawnSync } from "node:child_process";
import path from "node:path";

const localAppData = path.join(process.cwd(), ".hardhat-localappdata");

const commands = [
  ["npm", ["run", "demo:local:repaid"]],
  ["npm", ["run", "demo:local:default"]],
  ["npm", ["run", "demo:local:clob-trade"]],
] as const;

for (const [command, args] of commands) {
  const executable = process.platform === "win32" ? "cmd.exe" : command;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
  const printedCommand = process.platform === "win32" ? `${command}.cmd ${args.join(" ")}` : `${command} ${args.join(" ")}`;

  console.log("");
  console.log(`> ${printedCommand}`);

  const result = spawnSync(executable, commandArgs, {
    env: {
      ...process.env,
      LOCALAPPDATA: localAppData,
    },
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("");
console.log("StopDown local happy path completed.");
