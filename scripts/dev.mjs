import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev", "-w", "@mab/api"], { stdio: "inherit" }),
  spawn(npm, ["run", "dev", "-w", "@mab/web"], { stdio: "inherit" })
];

function stop() {
  for (const child of children) child.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => {
  if (code && code !== 0) process.exitCode = code;
});
