export function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/([?&]wsTicket=)[^&\s]+/giu, "$1[redacted]")
    .replace(/\b(?:xapp|xoxb)-[A-Za-z0-9-]+\b/gu, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/giu, "[redacted]");
}
