# Installs OpenCode on Windows from the latest Windows installer release.
#
#   irm https://raw.githubusercontent.com/arsalanmansouri/opencode/refs/heads/claude/zen-curie-xpynxq/install.ps1 | iex
#
# Downloads the newest OpenCode-Setup-*-x64.exe release asset, checks it against the
# SHA-256 digest GitHub publishes for it, and runs it silently for the current user
# (no administrator rights needed). Afterwards `opencode` works in this window and in
# every new terminal.
#
# Environment variables:
#   OPENCODE_REPO                 owner/repo to install from (default arsalanmansouri/opencode)
#   OPENCODE_INSTALL_INTERACTIVE  set to 1 to step through the installer wizard instead

# A script block keeps variables out of the caller's session, and `throw` (not `exit`)
# reports a failure without closing the window it was pasted into.
& {
  $ErrorActionPreference = "Stop"
  # Windows PowerShell 5.1 downloads many times slower while drawing a progress bar.
  $ProgressPreference = "SilentlyContinue"
  # Windows PowerShell 5.1 can default to TLS 1.0, which GitHub refuses.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = if ($env:OPENCODE_REPO) { $env:OPENCODE_REPO } else { "arsalanmansouri/opencode" }
  if (-not [Environment]::Is64BitOperatingSystem) { throw "OpenCode needs 64-bit Windows." }

  Write-Host "Finding the latest OpenCode installer in $repo..."
  $releases = Invoke-RestMethod "https://api.github.com/repos/$repo/releases?per_page=30" -UseBasicParsing -Headers @{
    "User-Agent" = "opencode-install-ps1"
    "Accept"     = "application/vnd.github+json"
  }
  # Newest first. Skip drafts and releases without a Windows installer, such as CLI-only ones.
  $release = $releases | Where-Object {
    -not $_.draft -and ($_.assets | Where-Object { $_.name -like "OpenCode-Setup-*-x64.exe" })
  } | Select-Object -First 1
  if (-not $release) { throw "No release in $repo has a Windows installer yet. See https://github.com/$repo/releases" }
  $asset = $release.assets | Where-Object { $_.name -like "OpenCode-Setup-*-x64.exe" } | Select-Object -First 1

  $file = Join-Path ([IO.Path]::GetTempPath()) $asset.name
  Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB)) MB) from $($release.tag_name)..."
  Invoke-WebRequest $asset.browser_download_url -OutFile $file -UseBasicParsing
  try {
    # GitHub publishes a digest for every asset uploaded since mid-2025.
    if ($asset.digest -like "sha256:*") {
      $actual = (Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant()
      $expected = $asset.digest.Substring(7).ToLowerInvariant()
      if ($actual -ne $expected) { throw "The download is corrupted: its SHA-256 is $actual, expected $expected. Try again." }
    }

    Write-Host "Installing..."
    $start = @{ FilePath = $file; Wait = $true; PassThru = $true }
    if (-not $env:OPENCODE_INSTALL_INTERACTIVE) { $start.ArgumentList = "/S" }
    $installer = Start-Process @start
    if ($installer.ExitCode -ne 0) { throw "The installer exited with code $($installer.ExitCode)." }
  } finally {
    Remove-Item $file -Force -ErrorAction SilentlyContinue
  }

  # The wizard lets people pick another folder, so ask the installer where it went.
  $dir = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenCode" -ErrorAction SilentlyContinue).InstallLocation
  if (-not $dir) { $dir = Join-Path $env:LOCALAPPDATA "Programs\OpenCode" }
  $exe = Join-Path $dir "opencode.exe"
  if (-not (Test-Path $exe)) { throw "The installer finished but $exe is missing." }

  # New terminals read PATH from the registry; this one needs telling.
  if (($env:Path -split ";") -notcontains $dir) { $env:Path = "$env:Path;$dir" }
  $version = (& $exe --version | Out-String).Trim()
  Write-Host ""
  Write-Host "OpenCode $version is installed." -ForegroundColor Green
  Write-Host "Open a project folder in a terminal and run: opencode"
  Write-Host "Inside OpenCode, run /connect to sign in to a model provider."
}
