@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
set "NO_PAUSE=0"
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
title Arabisch Lernen - Rust MSVC reparieren

where rustup >nul 2>nul || goto no_rustup
set "TOOLCHAIN=stable-x86_64-pc-windows-msvc"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "TOOLCHAIN=stable-aarch64-pc-windows-msvc"

echo Installiere/aktualisiere %TOOLCHAIN% ...
rustup toolchain install %TOOLCHAIN% --profile minimal
if errorlevel 1 goto failed
rustup override set %TOOLCHAIN%
if errorlevel 1 goto failed

echo.
rustc -vV
cargo --version
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 0

:no_rustup
echo FEHLER: rustup fehlt. Rust bitte ueber rustup installieren.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1

:failed
echo FEHLER: Rust-MSVC konnte nicht eingerichtet werden.
if "%NO_PAUSE%"=="0" pause
endlocal & exit /b 1
