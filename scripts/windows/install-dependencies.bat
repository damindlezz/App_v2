@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "NO_PAUSE=0"
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
where npm >nul 2>nul || goto missing

set "npm_config_fetch_retries=5"
set "npm_config_fetch_retry_mintimeout=10000"
set "npm_config_fetch_retry_maxtimeout=120000"
set "CARGO_NET_RETRY=5"
set "CARGO_HTTP_TIMEOUT=120"
set "CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse"

echo.
echo [1/3] npm-Lockdatei pruefen...
if not exist package-lock.json (
  echo package-lock.json fehlt. Erzeuge Lockdatei aus den gepinnten Abhaengigkeiten...
  call npm install --package-lock-only --ignore-scripts
  if errorlevel 1 goto failed
)
if not exist package-lock.json goto failed

echo.
echo [2/3] Node-Abhaengigkeiten installieren...
call npm ci
if errorlevel 1 goto failed

where cargo >nul 2>nul || goto cargo_missing

echo.
echo [3/3] Cargo-Lockdatei pruefen...
if not exist "src-tauri\Cargo.lock" (
  pushd "src-tauri"
  cargo generate-lockfile
  if errorlevel 1 (
    popd
    goto failed
  )
  popd
)

pushd "src-tauri"
cargo update -p rust_decimal --precise 1.40.0 >nul
if errorlevel 1 (
  popd
  goto failed
)
cargo metadata --locked --no-deps --format-version 1 >nul
if errorlevel 1 (
  popd
  goto cargo_lock_failed
)
popd

echo.
echo Abhaengigkeiten und Lockdateien sind bereit.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 0

:missing
echo Node.js und npm fehlen.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1

:cargo_missing
echo Cargo fehlt. Bitte Rust/Cargo ueber rustup installieren und den Hauptworkflow erneut starten.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1

:cargo_lock_failed
echo Cargo.lock passt nicht zu src-tauri\Cargo.toml.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1

:failed
echo Installation fehlgeschlagen. Netzwerk/Proxy und den ersten Fehler oberhalb pruefen.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1
