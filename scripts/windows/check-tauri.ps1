param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$minimumRust = [version]'1.80.0'
$minimumNode20 = [version]'20.19.0'
$minimumNode22 = [version]'22.12.0'
$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Write-Step([string]$Text) {
  if (-not $Quiet) { Write-Host $Text }
}

function Require-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    $failures.Add("$Name fehlt oder ist nicht im PATH.")
    return $null
  }
  return $cmd
}

Write-Step ''
Write-Step 'Arabisch Lernen - Tauri/Windows Preflight'
Write-Step '=========================================='

$node = Require-Command 'node.exe'
$npm = Require-Command 'npm.cmd'
$python = Require-Command 'python.exe'
$rustc = Require-Command 'rustc.exe'
$cargo = Require-Command 'cargo.exe'
$rustup = Require-Command 'rustup.exe'

if ($node) {
  $nodeText = ((& node --version) -replace '^v','').Trim()
  Write-Step ("[OK] Node    " + $nodeText)
  try {
    $nodeVersion = [version]$nodeText
    $supportedNode = ($nodeVersion.Major -eq 20 -and $nodeVersion -ge $minimumNode20) -or ($nodeVersion.Major -eq 22 -and $nodeVersion -ge $minimumNode22) -or ($nodeVersion.Major -ge 24)
    if (-not $supportedNode) {
      $failures.Add("Node $nodeText ist für den Next.js-Build ungeeignet. Verwende Node 20.19+ oder eine neuere LTS-Version.")
    }
  } catch { $warnings.Add("Node-Version '$nodeText' konnte nicht sicher ausgewertet werden.") }
}
if ($npm) { Write-Step ("[OK] npm     " + (& npm --version)) }
if ($python) { Write-Step ("[OK] Python  " + (& python --version 2>&1)) }

if ($rustc) {
  $verbose = & rustc -vV
  $releaseLine = $verbose | Where-Object { $_ -like 'release:*' } | Select-Object -First 1
  $hostLine = $verbose | Where-Object { $_ -like 'host:*' } | Select-Object -First 1
  $release = if ($releaseLine) { ($releaseLine -replace '^release:\s*','').Trim() } else { '' }
  $rustHost = if ($hostLine) { ($hostLine -replace '^host:\s*','').Trim() } else { '' }
  Write-Step ("[OK] rustc   " + $release)
  Write-Step ("[INFO] Host   " + $rustHost)

  try {
    $versionText = ($release -replace '-.*$','')
    $rustVersion = [version]$versionText
    if ($rustVersion -lt $minimumRust) {
      $failures.Add("Rust $release ist zu alt. Benoetigt wird mindestens $minimumRust; empfohlen ist der aktuelle stable-MSVC-Toolchain.")
    }
  } catch {
    $warnings.Add("Rust-Version '$release' konnte nicht sicher ausgewertet werden.")
  }

  if ($rustHost -notmatch 'pc-windows-msvc$') {
    $failures.Add("Falscher Rust-Host '$rustHost'. Tauri unter Windows soll mit *-pc-windows-msvc gebaut werden, nicht GNU/MSYS2.")
  }
}

if ($cargo) { Write-Step ("[OK] Cargo   " + (& cargo --version)) }
if ($rustup) {
  $active = (& rustup show active-toolchain 2>&1 | Select-Object -First 1)
  Write-Step ("[INFO] Toolchain " + $active)
}

$programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
if (-not $programFilesX86) { $programFilesX86 = $env:ProgramFiles }
$vswhere = Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
  $vsPath = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
  if ($vsPath) {
    Write-Step ("[OK] MSVC    " + $vsPath)
  } else {
    $failures.Add('Visual Studio 2022 Build Tools sind vorhanden, aber die C++-Toolchain (Desktopentwicklung mit C++) fehlt.')
  }
} else {
  $failures.Add('Visual Studio Installer/vswhere wurde nicht gefunden. Installiere Visual Studio 2022 Build Tools mit Desktopentwicklung mit C++.')
}

$webViewRoots = @(
  (Join-Path $programFilesX86 'Microsoft\EdgeWebView\Application'),
  (Join-Path $env:ProgramFiles 'Microsoft\EdgeWebView\Application')
) | Where-Object { $_ -and (Test-Path $_) }
$webViewExe = $null
foreach ($webViewRoot in $webViewRoots) {
  $candidate = Get-ChildItem $webViewRoot -Filter 'msedgewebview2.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($candidate) { $webViewExe = $candidate.FullName; break }
}
if ($webViewExe) { Write-Step ("[OK] WebView2 " + $webViewExe) }
else { $failures.Add('Microsoft Edge WebView2 Runtime wurde nicht gefunden. Tauri benötigt WebView2 zum Starten der Desktop-App.') }

try {
  $kits = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -ErrorAction Stop
  if ($kits.KitsRoot10 -and (Test-Path $kits.KitsRoot10)) {
    Write-Step ("[OK] Windows SDK " + $kits.KitsRoot10)
  } else {
    $failures.Add('Windows 10/11 SDK wurde nicht gefunden.')
  }
} catch {
  $failures.Add('Windows 10/11 SDK wurde nicht gefunden.')
}

if ($failures.Count -gt 0) {
  Write-Host ''
  foreach ($item in $failures) { Write-Host ("[FEHLER] " + $item) -ForegroundColor Red }
  foreach ($item in $warnings) { Write-Host ("[WARNUNG] " + $item) -ForegroundColor Yellow }
  if (($failures -join ' ') -match 'Rust-Host|Rust .*zu alt') {
    Write-Host ''
    Write-Host 'Reparatur: scripts\windows\repair-rust-msvc.bat starten und danach EXE_ERSTELLEN.bat erneut ausfuehren.' -ForegroundColor Yellow
    exit 12
  }
  exit 1
}

foreach ($item in $warnings) { Write-Host ("[WARNUNG] " + $item) -ForegroundColor Yellow }
Write-Step '[OK] Windows/Tauri-Buildumgebung ist plausibel.'
exit 0
