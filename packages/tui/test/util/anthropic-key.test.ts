import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { checkAnthropicKey } from "../../src/util/anthropic-key"

// A local stand-in for the Anthropic API, reached through the same baseURL option that a proxy
// or gateway configuration uses.
const seen: { path: string; key: string | null; version: string | null }[] = []
let server: ReturnType<typeof Bun.serve>
let baseURL = ""

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const key = request.headers.get("x-api-key")
      seen.push({ path: url.pathname + url.search, key, version: request.headers.get("anthropic-version") })
      if (key === "sk-ant-api03-good") return Response.json({ data: [], has_more: false })
      if (key === "sk-ant-api03-blocked")
        return Response.json(
          { type: "error", error: { type: "permission_error", message: "API access is disabled" } },
          { status: 403 },
        )
      if (key === "sk-ant-api03-busy")
        return Response.json(
          { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
          { status: 529 },
        )
      return Response.json(
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
        { status: 401 },
      )
    },
  })
  baseURL = `http://127.0.0.1:${server.port}/v1/`
})

afterAll(() => server.stop(true))

describe("checkAnthropicKey", () => {
  test("accepts a key the API accepts, sending it trimmed to the models endpoint", async () => {
    expect(await checkAnthropicKey({ key: "  sk-ant-api03-good\n", baseURL })).toEqual({ type: "valid" })
    expect(seen.at(-1)).toEqual({ path: "/v1/models?limit=1", key: "sk-ant-api03-good", version: "2023-06-01" })
  })

  test("rejects a key the API rejects, with the API's reason", async () => {
    expect(await checkAnthropicKey({ key: "sk-ant-api03-typo", baseURL })).toEqual({
      type: "invalid",
      message: "Anthropic rejected this API key (invalid x-api-key). Check that you copied all of it.",
    })
    expect(await checkAnthropicKey({ key: "sk-ant-api03-blocked", baseURL })).toEqual({
      type: "invalid",
      message: "This API key isn't allowed to use the API (API access is disabled).",
    })
  })

  test("rejects subscription tokens and empty input without a request", async () => {
    const before = seen.length
    expect((await checkAnthropicKey({ key: "sk-ant-oat01-abc", baseURL })).type).toBe("invalid")
    expect(await checkAnthropicKey({ key: "   ", baseURL })).toEqual({ type: "invalid", message: "Paste an API key." })
    expect(seen.length).toBe(before)
  })

  test("does not block saving when the key cannot be checked", async () => {
    expect(await checkAnthropicKey({ key: "sk-ant-api03-busy", baseURL })).toEqual({
      type: "unverified",
      message: "Anthropic answered 529 (Overloaded) while checking the key, so it was saved unchecked.",
    })
    // Nothing listens on port 9 (discard), so the request fails to connect.
    expect((await checkAnthropicKey({ key: "sk-ant-api03-good", baseURL: "http://127.0.0.1:9/v1" })).type).toBe(
      "unverified",
    )
  })
})
