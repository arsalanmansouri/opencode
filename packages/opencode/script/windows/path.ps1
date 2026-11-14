# Adds or removes one directory on the current user's PATH.
#
# Edits the registry value directly instead of going through
# [Environment]::GetEnvironmentVariable, which expands %VARIABLES% and would
# rewrite every unexpanded entry, and instead of NSIS string handling, which
# truncates at 1024 characters and would cut a long PATH short.
param(
  [Parameter(Mandatory = $true)][ValidateSet("Add", "Remove")][string]$Action,
  [Parameter(Mandatory = $true)][string]$Dir
)

$ErrorActionPreference = "Stop"
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Environment", $true)
try {
  $exists = $key.GetValueNames() -contains "Path"
  $current = if ($exists) { $key.GetValue("Path", "", [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { "" }
  $kind = if ($exists) { $key.GetValueKind("Path") } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
  $target = $Dir.TrimEnd("\")
  $parts = @($current -split ";" | Where-Object { $_ -and ($_.TrimEnd("\") -ine $target) })
  if ($Action -eq "Add") { $parts += $target }
  $key.SetValue("Path", ($parts -join ";"), $kind)
} finally {
  $key.Close()
}
