export const ANTHROPIC_KEYS_URL = "https://platform.claude.com/settings/keys"
export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1"

export type KeyCheck =
  | { type: "valid" }
  /** The key is wrong or unusable here. Do not save it. */
  | { type: "invalid"; message: string }
  /** The key could not be checked right now, which says nothing about the key. Save it. */
  | { type: "unverified"; message: string }

/**
 * Checks an Anthropic API key with one cheap authenticated request before it is saved, so a
 * mistyped or revoked key fails here with a clear reason instead of on the first message.
 * Uses the configured base URL so keys for a proxy or gateway are checked where they are used.
 */
export async function checkAnthropicKey(input: {
  key: string
  baseURL?: string
  timeoutMs?: number
}): Promise<KeyCheck> {
  const key = input.key.trim()
  if (!key) return { type: "invalid", message: "Paste an API key." }
  // `claude setup-token` and Claude.ai sign-in mint these. They carry a Pro/Max subscription,
  // which Anthropic's terms reserve for its own apps.
  if (key.startsWith("sk-ant-oat"))
    return {
      type: "invalid",
      message: "This is a Claude subscription token, not an API key. Create an API key in the Claude Console instead.",
    }

  const response = await fetch(`${(input.baseURL ?? ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, "")}/models?limit=1`, {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
  }).catch((error: unknown) => error)
  if (!(response instanceof Response))
    return { type: "unverified", message: "Couldn't reach Anthropic to check the key, so it was saved unchecked." }
  if (response.ok) return { type: "valid" }

  const detail = await response
    .json()
    .then((body: { error?: { message?: unknown } }) =>
      typeof body?.error?.message === "string" ? ` (${body.error.message})` : "",
    )
    .catch(() => "")
  if (response.status === 401)
    return { type: "invalid", message: `Anthropic rejected this API key${detail}. Check that you copied all of it.` }
  if (response.status === 403)
    return { type: "invalid", message: `This API key isn't allowed to use the API${detail}.` }
  return {
    type: "unverified",
    message: `Anthropic answered ${response.status}${detail} while checking the key, so it was saved unchecked.`,
  }
}
