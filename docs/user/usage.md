# Review usage

The Usage page combines Codex and Claude Code activity from your connected environments. It reads
the providers' local session history and shows API-equivalent token cost, processed tokens, cache
savings, provider shares, and model breakdowns. Subscription billing is separate from the raw token
cost shown here.

On desktop and web, the thread sidebar shows **Codex Usage: N% remaining** when Codex reports its
subscription window. Claude shows a separate compact meter with its five-hour and general weekly
allowances, both expressed as percentages remaining, plus provider-reported reset times. Claude Code
does not currently expose a Fable-specific weekly allowance; Fable is covered by the general windows
shown in the meter. These values come directly from each provider and are not costs calculated from
token history. Provider status refreshes automatically every five minutes while a client is active;
use the refresh button beside either provider to update it immediately.

Use **Past 24h** for an hourly chart covering the exact rolling 24-hour period. The **7 days**,
**30 days**, and **90 days** ranges use daily resolution. Cost and token toggles update both the
headline and chart, and refreshing rescans every connected environment.
