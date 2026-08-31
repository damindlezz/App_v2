@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "NO_PAUSE=0"
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
title Arabisch Lernen - rust_decimal reparieren

where cargo >nul 2>nul || goto missing
where rustc >nul 2>nul || goto missing

echo.
echo [1/3] rust_decimal in Cargo.lock auf 1.40.0 festsetzen...
pushd "src-tauri"
cargo update -p rust_decimal --precise 1.40.0
if errorlevel 1 (
  popd
  goto failed
)

echo.
echo [2/3] rust_decimal-Buildcache entfernen...
cargo clean -p rust_decimal
if errorlevel 1 (
  popd
  goto failed
)

echo.
echo [3/3] Rust-Abhaengigkeiten pruefen...
cargo check
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto failed

echo rust_decimal wurde erfolgreich geprueft.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 0

:missing
echo FEHLER: Rust/Cargo fehlt. Bitte Rust/Cargo ueber rustup installieren und den Hauptworkflow erneut starten.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1

:failed
echo Reparatur fehlgeschlagen. Massgeblich ist die erste Compilerfehlermeldung oberhalb.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1
