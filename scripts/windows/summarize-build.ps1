param([string]$LogPath = 'tauri-build.log')
if (-not (Test-Path $LogPath)) {
  Write-Host "Kein Build-Log gefunden: $LogPath"
  exit 0
}
$lines = Get-Content -Path $LogPath
$patterns = @(
  'error(?:\[[A-Z0-9]+\])?:',
  'failed to run custom build command',
  'could not compile',
  'Caused by:',
  '--- stderr'
)
$index = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  foreach ($p in $patterns) {
    if ($lines[$i] -match $p) { $index = $i; break }
  }
  if ($index -ge 0) { break }
}
Write-Host ''
Write-Host '===== ERSTE RELEVANTE BUILD-STELLE ====='
if ($index -lt 0) {
  $start = [Math]::Max(0, $lines.Count - 80)
  $lines[$start..($lines.Count-1)] | ForEach-Object { Write-Host $_ }
} else {
  $start = [Math]::Max(0, $index - 20)
  $end = [Math]::Min($lines.Count - 1, $index + 60)
  $lines[$start..$end] | ForEach-Object { Write-Host $_ }
}

$text = $lines -join "`n"
Write-Host ''
Write-Host '===== AUTOMATISCHE EINORDNUNG ====='
if ($text -match 'Finished \[tauri_bundler::bundle\].*bundle at:' -or $text -match 'x64-setup\.exe') {
  Write-Host '[ERFOLG] Tauri und NSIS haben den Installer erfolgreich erzeugt.' -ForegroundColor Green
  exit 0
}
if ($text -match 'windows-gnu|windres|pc-windows-gnu') {
  Write-Host '[URSACHE WAHRSCHEINLICH] GNU/MSYS2-Rust-Toolchain. Fuer Tauri unter Windows MSVC verwenden.' -ForegroundColor Yellow
  Write-Host 'Starte scripts\windows\repair-rust-msvc.bat.'
} elseif ($text -match "link\.exe.*not found|linker [`']link\.exe[`'] not found|LNK\d{4}") {
  Write-Host '[URSACHE WAHRSCHEINLICH] MSVC/Windows SDK fehlt oder ist unvollstaendig.' -ForegroundColor Yellow
  Write-Host 'Visual Studio Build Tools 2022 -> Desktopentwicklung mit C++ + Windows 10/11 SDK installieren/reparieren.'
} elseif ($text -match 'requires rustc|rustc .* is not supported|minimum supported Rust') {
  Write-Host '[URSACHE WAHRSCHEINLICH] Rust-Compiler ist zu alt.' -ForegroundColor Yellow
  Write-Host 'Starte scripts\windows\repair-rust-msvc.bat.'
} elseif ($text -match 'failed to get|download of|network failure|timed out|certificate|SSL') {
  Write-Host '[URSACHE WAHRSCHEINLICH] Cargo/Bundler-Netzwerkfehler.' -ForegroundColor Yellow
  Write-Host 'Proxy/Firewall pruefen und danach erneut bauen; Cargo ist auf sparse + Retries konfiguriert.'
} elseif ($text -match 'tauri-runtime') {
  Write-Host '[HINWEIS] tauri-runtime ist meist nur das Paket, bei dem Cargo abbricht. Die eigentliche Ursache steht oberhalb dieser Zeile.' -ForegroundColor Yellow
} else {
  Write-Host 'Keine Standardursache erkannt. Die oben ausgegebene erste Fehlerstelle ist massgeblich.'
}
