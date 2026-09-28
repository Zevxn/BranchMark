@echo off
setlocal
cd /d "%~dp0"
title DeepConvo MindMap Tauri Build

where node >nul 2>&1
if errorlevel 1 goto missing_node

where npm >nul 2>&1
if errorlevel 1 goto missing_npm

where cargo >nul 2>&1
if errorlevel 1 goto missing_rust

if not exist "desktop-tauri\node_modules\.bin\tauri.cmd" (
    echo Installing Tauri packaging dependencies...
    call npm --prefix desktop-tauri ci
    if errorlevel 1 goto failed
)

echo.
echo Building the Tauri Windows installers...
call npm run tauri:build
if errorlevel 1 goto failed

echo.
echo Build completed. Output: desktop-tauri\src-tauri\target\release\bundle
if exist "desktop-tauri\src-tauri\target\release\bundle" start "" explorer.exe "%~dp0desktop-tauri\src-tauri\target\release\bundle"
goto done

:missing_node
echo ERROR: Node.js is not installed or is not available in PATH.
goto failed

:missing_npm
echo ERROR: npm is not available in PATH.
goto failed

:missing_rust
echo ERROR: Rust/Cargo is not installed or is not available in PATH.
goto failed

:failed
echo.
echo Build failed. Review the error messages above.
pause
exit /b 1

:done
pause
endlocal
