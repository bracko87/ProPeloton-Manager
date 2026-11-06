@echo off
setlocal
cd /d "%~dp0"
if not exist "scripts\v4\privateRealVsOfficialCompareV4.mjs" (
 echo ERROR: Run this CMD file from the ProPeloton Manager Main folder.
 exit /b 1
)
if not exist "compare_first_real_v4.mjs" (
 echo ERROR: Missing V4 comparison launcher.
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
echo Starting first real V4 versus official race comparison (read-only)...
node "compare_first_real_v4.mjs"
set "EXITCODE=%errorlevel%"
if not "%EXITCODE%"=="0" echo V4 comparison rejected. No official results were modified.
exit /b %EXITCODE%
