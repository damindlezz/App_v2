param(
  [string]$LogPath = 'tauri-build.log'
)
$ErrorActionPreference = 'Stop'
$env:RUST_BACKTRACE = '1'
$env:CARGO_NET_RETRY = '5'
$env:CARGO_HTTP_TIMEOUT = '120'
$env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse'


if (-not (Test-Path 'package-lock.json')) { throw 'package-lock.json fehlt. Zuerst scripts\windows\install-dependencies.bat ausfuehren.' }
if (-not (Test-Path 'src-tauri\Cargo.lock')) { throw 'src-tauri\Cargo.lock fehlt. Zuerst scripts\windows\install-dependencies.bat ausfuehren.' }
& cargo metadata --manifest-path 'src-tauri\Cargo.toml' --locked --no-deps --format-version 1 *> $null
if ($LASTEXITCODE -ne 0) { throw 'Cargo.lock ist nicht mit Cargo.toml konsistent.' }

$resolvedLog = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $LogPath))
if (Test-Path $resolvedLog) { Remove-Item $resolvedLog -Force }
Write-Host "Build-Log: $resolvedLog"

# Tauri/Cargo schreiben auch normale Fortschrittsmeldungen nach stderr.
# PowerShell 5.1 wandelt solche nativen stderr-Zeilen in NativeCommandError-
# ErrorRecords um, sobald 2>&1 direkt in einer PowerShell-Pipeline verwendet wird.
# Die Umleitung erfolgt deshalb in cmd.exe. Fuer PowerShell kommt danach nur noch
# ein normaler stdout-Stream an, der unverfaelscht geloggt werden kann.
$buildCommand = 'npm.cmd run desktop:build -- --bundles nsis --verbose 2>&1'
& cmd.exe /d /s /c $buildCommand | Tee-Object -FilePath $resolvedLog
$exitCode = $LASTEXITCODE
if ($null -eq $exitCode) { $exitCode = 1 }

if ($exitCode -eq 0) {
  Write-Host ''
  Write-Host 'Tauri-/NSIS-Build erfolgreich.' -ForegroundColor Green
}

exit $exitCode
