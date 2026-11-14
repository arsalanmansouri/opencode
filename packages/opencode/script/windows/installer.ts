#!/usr/bin/env bun
// Packages a built Windows binary into a per-user installer with NSIS.
//
//   bun run script/build.ts --target=opencode-windows-x64
//   bun run script/windows/installer.ts [opencode-windows-x64]
//
// Writes dist/OpenCode-Setup-<version>-<arch>.exe. Needs makensis on PATH
// (apt install nsis, brew install makensis, or choco install nsis).
import { $ } from "bun"
import path from "path"

const root = path.resolve(import.meta.dir, "../..")
const target = process.argv[2] ?? "opencode-windows-x64"
const binary = path.join(root, "dist", target, "bin", "opencode.exe")
if (!(await Bun.file(binary).exists()))
  throw new Error(`${binary} not found. Build it first: bun run script/build.ts --target=${target}`)

// Same version the binary was built with, numeric only: Windows file versions allow no tags.
const version = (
  process.env.OPENCODE_VERSION ?? (await Bun.file(path.join(root, "package.json")).json()).version
).split("-")[0]
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Version ${version} is not major.minor.patch`)

const outfile = path.join(root, "dist", `OpenCode-Setup-${version}-${target.replace("opencode-windows-", "")}.exe`)
await $`makensis -V2 -NOCD ${[
  `-DVERSION=${version}`,
  `-DBINARY=${binary}`,
  `-DICON=${path.join(root, "../desktop/icons/prod/icon.ico")}`,
  `-DLICENSE=${path.join(root, "../../LICENSE")}`,
  `-DPATHSCRIPT=${path.join(import.meta.dir, "path.ps1")}`,
  `-DOUTFILE=${outfile}`,
]} ${path.join(import.meta.dir, "installer.nsi")}`
console.log(outfile)
