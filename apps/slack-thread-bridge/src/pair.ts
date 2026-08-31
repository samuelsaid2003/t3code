// @effect-diagnostics nodeBuiltinImport:off -- Interactive local setup boundary.
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { exchangePairingUrl, saveT3AuthState } from "./t3Auth.ts";

const statePath =
  process.env.T3_AUTH_STATE_FILE ??
  fileURLToPath(new URL("../state/t3-auth.json", import.meta.url));
const terminal = createInterface({ input: process.stdin, output: process.stdout });

try {
  const pairingUrl = await terminal.question("Paste the one-time T3 pairing URL: ");
  const state = await exchangePairingUrl(pairingUrl);
  await saveT3AuthState(statePath, state);
  process.stdout.write(`Paired with ${state.label}. Saved scoped credentials to ${statePath}.\n`);
} finally {
  terminal.close();
}
