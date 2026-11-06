@echo off
setlocal
cd /d "%~dp0"
if not exist "scripts\v4\runPrivateControlledFourWayV4.mjs" (
 echo ERROR: Missing private four-way comparison runner. Pull the research branch first.
 exit /b 1
)
if not exist "compare_first_real_v4.mjs" (
 echo ERROR: Missing read-only comparison entrypoint.
 exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
 echo ERROR: Node.js 20 or later is required.
 exit /b 1
)
if not exist "node_modules\pg" (
 echo ERROR: Node modules missing. Run npm ci.
 exit /b 1
)
echo Running controlled V1/V4 physics and AI 2x2 comparison (read-only)...
node "compare_first_real_v4.mjs" --four-way
set "EXITCODE=%errorlevel%"
if not "%EXITCODE%"=="0" echo Four-way comparison rejected. Official race results were not modified.
exit /b %EXITCODE%
