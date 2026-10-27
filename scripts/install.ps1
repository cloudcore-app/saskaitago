# Installs SaskaitaGO on Windows for the current user:
#   irm https://saskaitago.lt/downloads/install.ps1 | iex
# The installed app updates itself.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$baseUrl = if ($env:SASKAITAGO_DOWNLOADS_URL) { $env:SASKAITAGO_DOWNLOADS_URL.TrimEnd("/") } else { "https://saskaitago.lt/downloads" }
$name = "SaskaitaGO-Setup.exe"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("saskaitago-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  Write-Host "==> Downloading $name"
  $installer = Join-Path $tmp $name
  Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$name" -OutFile $installer
  $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHA256SUMS").Content
  if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }

  $expected = $null
  foreach ($line in $sums -split "`n") {
    $parts = $line.Trim() -split "\s+", 2
    if ($parts.Count -eq 2 -and $parts[1].TrimStart("*") -eq $name) { $expected = $parts[0] }
  }
  if (-not $expected) { throw "$name is missing from SHA256SUMS." }
  $actual = (Get-FileHash -Algorithm SHA256 -Path $installer).Hash
  if ($actual -ne $expected.ToUpper()) { throw "Checksum mismatch for $name. Try again later." }

  Write-Host "==> Installing SaskaitaGO"
  Get-Process -Name "SaskaitaGO" -ErrorAction SilentlyContinue | Stop-Process -Force
  # /S runs the NSIS installer silently; /currentuser keeps it per-user so no administrator prompt is needed.
  $process = Start-Process -FilePath $installer -ArgumentList "/S", "/currentuser" -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)." }

  Write-Host "==> SaskaitaGO installed. Start it from the Start menu or the desktop shortcut."
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
