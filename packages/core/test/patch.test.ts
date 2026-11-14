import { describe, expect, test } from "bun:test"
import { Patch } from "@opencode-ai/core/patch"

describe("Patch", () => {
  test("parses add, update, and delete hunks", () => {
    expect(
      Patch.parse(
        "*** Begin Patch\n*** Add File: add.txt\n+added\n*** Update File: update.txt\n@@ section\n-old\n+new\n*** Delete File: delete.txt\n*** End Patch",
      ),
    ).toEqual([
      { type: "add", path: "add.txt", contents: "added" },
      {
        type: "update",
        path: "update.txt",
        chunks: [{ oldLines: ["old"], newLines: ["new"], changeContext: "section", endOfFile: undefined }],
        movePath: undefined,
      },
      { type: "delete", path: "delete.txt" },
    ])
  })

  test("strips a heredoc wrapper", () => {
    expect(Patch.parse("cat <<'EOF'\n*** Begin Patch\n*** Add File: add.txt\n+added\n*** End Patch\nEOF")).toEqual([
      { type: "add", path: "add.txt", contents: "added" },
    ])
  })

  test("derives fuzzy line updates while preserving BOM", () => {
    const update = Patch.derive("update.txt", [{ oldLines: ["  old   "], newLines: ["new"] }], "\uFEFFold\n")
    expect(update).toEqual({ content: "new\n", bom: true })
    expect(Patch.joinBom(update.content, update.bom)).toBe("\uFEFFnew\n")
  })

  test("matches EOF-anchored chunks from the end", () => {
    expect(
      Patch.derive(
        "update.txt",
        [{ oldLines: ["marker", "end"], newLines: ["marker changed", "end"], endOfFile: true }],
        "marker\nmiddle\nmarker\nend\n",
      ).content,
    ).toBe("marker\nmiddle\nmarker changed\nend\n")
  })

  test("parses the EOF marker inside update chunks", () => {
    expect(
      Patch.parse("*** Begin Patch\n*** Update File: update.txt\n@@\n-last\n+end\n*** End of File\n*** End Patch"),
    ).toEqual([
      {
        type: "update",
        path: "update.txt",
        movePath: undefined,
        chunks: [{ oldLines: ["last"], newLines: ["end"], changeContext: undefined, endOfFile: true }],
      },
    ])
  })

  test("treats a bare empty line inside a chunk as a blank context line", () => {
    const [hunk] = Patch.parse(
      "*** Begin Patch\n*** Update File: update.txt\n\n@@\n function a() {\n\n-  return 1\n+  return 2\n }\n*** End Patch",
    )
    if (hunk?.type !== "update") throw new Error("expected update hunk")
    expect(hunk.chunks).toEqual([
      {
        oldLines: ["function a() {", "", "  return 1", "}"],
        newLines: ["function a() {", "", "  return 2", "}"],
        changeContext: undefined,
        endOfFile: undefined,
      },
    ])
    expect(Patch.derive("update.txt", hunk.chunks, "function a() {\n\n  return 1\n}\n").content).toBe(
      "function a() {\n\n  return 2\n}\n",
    )
  })

  test("appends an addition whose only context is a blank separator line", () => {
    const [hunk] = Patch.parse("*** Begin Patch\n*** Update File: update.txt\n@@\n+added\n\n*** End Patch")
    if (hunk?.type !== "update") throw new Error("expected update hunk")
    expect(Patch.derive("update.txt", hunk.chunks, "first\n").content).toBe("first\nadded\n")
  })

  test("keeps CRLF line endings on lines written into a CRLF file", () => {
    const chunks = [{ oldLines: ["one", "two", "three"], newLines: ["one", "TWO", "inserted", "three"] }]
    expect(Patch.derive("update.txt", chunks, "zero\r\none\r\ntwo\r\nthree\r\nfour\r\n").content).toBe(
      "zero\r\none\r\nTWO\r\ninserted\r\nthree\r\nfour\r\n",
    )
    expect(Patch.derive("update.txt", chunks, "zero\r\none\r\ntwo\r\nthree").content).toBe(
      "zero\r\none\r\nTWO\r\ninserted\r\nthree\r\n",
    )
    expect(Patch.derive("update.txt", chunks, "zero\none\ntwo\nthree\n").content).toBe(
      "zero\none\nTWO\ninserted\nthree\n",
    )
  })

  test("rejects malformed hunk bodies", () => {
    expect(() => Patch.parse("*** Begin Patch\n*** Add File: add.txt\nmissing plus\n*** End Patch")).toThrow(
      "Invalid add file line",
    )
    expect(() => Patch.parse("*** Begin Patch\n*** Update File: update.txt\n*** End Patch")).toThrow(
      "expected at least one @@ chunk",
    )
    expect(() => Patch.parse("*** Begin Patch\n*** Delete File: delete.txt\nunexpected body\n*** End Patch")).toThrow(
      "Invalid patch line",
    )
  })
})
