@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUR 4.4 P0 CLEAN - Build

where node >nul 2>nul || goto missing_node
where npm >nul 2>nul || goto missing_node
where python >nul 2>nul || goto missing_python
if not exist package.json goto invalid_project

if not exist node_modules\.bin\next.cmd (
  echo [SETUP] Installiere Node-Abhaengigkeiten...
  call npm ci
  if errorlevel 1 goto failed
)

echo [1/3] Content bauen...
call npm run build:content
if errorlevel 1 goto failed

echo [2/3] Tests und Validierung...
call npm run verify
if errorlevel 1 goto failed

echo [3/3] Next.js Production Build...
call npx next build
if errorlevel 1 goto failed
call npm run verify:export
if errorlevel 1 goto failed

if /I "%~1"=="desktop" (
  where cargo >nul 2>nul || goto missing_rust
  echo [DESKTOP] Tauri Build...
  call npm run desktop:build
  if errorlevel 1 goto failed
)

echo.
echo Build erfolgreich.
if /I "%~1"=="desktop" echo Desktop-Artefakte: src-tauri\target\release\bundle
pause
endlocal & exit /b 0

:missing_node
echo FEHLER: Node.js/npm fehlt.
goto failed
:missing_python
echo FEHLER: Python fehlt.
goto failed
:missing_rust
echo FEHLER: Rust/Cargo fehlt fuer build.bat desktop.
goto failed
:invalid_project
echo FEHLER: package.json fehlt. Falscher Projektordner.
goto failed
:failed
echo.
echo Build fehlgeschlagen. Der erste Fehler oberhalb ist massgeblich.
pause
endlocal & exit /b 1
