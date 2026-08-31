// @effect-diagnostics nodeBuiltinImport:off -- macOS LaunchAgent installation boundary.
import { spawnSync } from "node:child_process";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "com.tradewiz.slack-t3-bridge";
const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const userHome = homedir();
const launchAgentsDirectory = join(userHome, "Library", "LaunchAgents");
const plistPath = join(launchAgentsDirectory, `${LABEL}.plist`);
const logsDirectory = join(appDirectory, "logs");
const envPath = join(appDirectory, ".env");
const authStatePath = join(appDirectory, "state", "t3-auth.json");
const entrypoint = join(appDirectory, "src", "index.ts");
const userId = process.getuid?.();

if (userId === undefined)
  throw new Error("The Slack bridge LaunchAgent is supported only on macOS.");
const launchDomain = `gui/${String(userId)}`;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function launchctl(args: ReadonlyArray<string>, tolerateFailure = false): void {
  const result = spawnSync("launchctl", args, { encoding: "utf8" });
  if (result.status === 0 || tolerateFailure) return;
  throw new Error(result.stderr.trim() || `launchctl ${args[0]} failed.`);
}

async function install(): Promise<void> {
  await access(envPath);
  await access(authStatePath);
  await mkdir(launchAgentsDirectory, { recursive: true });
  await mkdir(logsDirectory, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(`--env-file=${envPath}`)}</string>
    <string>${escapeXml(entrypoint)}</string>
  </array>
  <key>WorkingDirectory</key><string>${escapeXml(appDirectory)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${escapeXml(join(logsDirectory, "stdout.log"))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(join(logsDirectory, "stderr.log"))}</string>
</dict>
</plist>
`;
  await writeFile(plistPath, plist, { mode: 0o600 });
  launchctl(["bootout", launchDomain, plistPath], true);
  launchctl(["bootstrap", launchDomain, plistPath]);
  launchctl(["kickstart", "-k", `${launchDomain}/${LABEL}`]);
  process.stdout.write(`Installed and started ${LABEL}.\n`);
}

async function uninstall(): Promise<void> {
  launchctl(["bootout", launchDomain, plistPath], true);
  await unlink(plistPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  process.stdout.write(`Stopped and removed ${LABEL}. Runtime logs were retained.\n`);
}

const action = process.argv[2];
if (action === "install") {
  await install();
} else if (action === "uninstall") {
  await uninstall();
} else {
  throw new Error("Use either install or uninstall.");
}
