<#
.SYNOPSIS
  Opens the venue-TV kiosk full-screen in Microsoft Edge.

.DESCRIPTION
  Asks WSL for the keyed kiosk URL (scripts/kiosk-url.sh), then opens it in
  Edge's full-screen kiosk mode with a dedicated profile, so the TV never
  shows tabs, the address bar, or your everyday browsing. Run it by hand on
  the presentation laptop once NodeCG is up (Event-day runbook, step 3).

  To leave kiosk mode, press Alt+F4.

.PARAMETER Screen
  The screen id set up in the "Screens and layouts" panel, e.g. main-left.
  The kiosk then shows that screen's layouts. Each screen gets its own Edge
  profile, so two kiosks can run on one laptop. Default: no named screen.

.PARAMETER Position
  Where to open the window, as "x,y" in Windows screen pixels, to put a
  kiosk on a particular display (e.g. "1920,0" for one to the right of a
  1920-wide main display). Default: wherever Edge opens.

.PARAMETER Distro
  The WSL distribution NodeCG runs in. Default: the default distribution.

.PARAMETER RepoPath
  Where the repo lives inside WSL. Default ~/32dashboards.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File \\wsl.localhost\Ubuntu\home\<you>\32dashboards\infra\windows\open-kiosk.ps1

.EXAMPLE
  ...\open-kiosk.ps1 -Screen main-right -Position 1920,0
#>
param(
  [ValidatePattern('^$|^[a-z0-9][a-z0-9-]{0,39}$')]
  [string]$Screen = '',
  [string]$Position = '',
  [string]$Distro = '',
  [string]$RepoPath = '~/32dashboards'
)
$ErrorActionPreference = 'Stop'

# wsl.exe mangles quoting, so pass only plain arguments and let the script do the work.
$wslArgs = @()
if ($Distro) { $wslArgs += @('-d', $Distro) }
$wslArgs += @('--cd', $RepoPath, '--', 'bash', 'scripts/kiosk-url.sh')
if ($Screen) { $wslArgs += $Screen }
$url = (& wsl.exe @wslArgs | Select-Object -Last 1).Trim()
if (-not $url.StartsWith('http')) {
  throw "Couldn't get the kiosk URL from WSL. Is NodeCG set up, and have you logged in to the dashboard once? Output: $url"
}

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found.' }

# One profile per screen: Edge hands a second window with the same profile to
# the first one's process, which would ignore its kiosk flags.
$profileName = if ($Screen) { "kiosk-profile-$Screen" } else { 'kiosk-profile' }
$profileDir = Join-Path $env:LOCALAPPDATA "32dashboards\$profileName"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$edgeArgs = @(
  "--kiosk", $url,
  "--edge-kiosk-type=fullscreen",
  "--user-data-dir=$profileDir",
  "--no-first-run",
  "--no-default-browser-check"
)
if ($Position) { $edgeArgs += "--window-position=$Position" }
Start-Process -FilePath $edge -ArgumentList $edgeArgs
Write-Host 'Kiosk opened full-screen. Press Alt+F4 on the TV to close it.'
