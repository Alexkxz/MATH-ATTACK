@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Math Attack - Abrir Panel
color 0B
cd /d "%~dp0"

set "ROOT=%~dp0"
set "PANEL_PS1=%ROOT%Panel-Control.ps1"
set "SERVER_JS=%ROOT%server.js"
set "GAME_HTML=%ROOT%math-attack.html"
set "TEACHER_HTML=%ROOT%maestro.html"
set "RANKING_HTML=%ROOT%ranking.html"
set "HOTSPOT_PS1=%ROOT%hotspot.ps1"
set "RUNTIME_ROOT=%ROOT%.runtime"
set "TEMP_ROOT=%ROOT%temp"
set "BOOTSTRAP_LOG=%ROOT%panel-bootstrap.log"
set "NODE_VERSION=22.13.1"
set "NODE_ARCH=win-x64"
set "LOCAL_NODE_DIR="
set "NODE_CMD="
set "NPM_CMD="

if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_ARCH=win-arm64"

>"%BOOTSTRAP_LOG%" echo [Bootstrap] Inicio %date% %time%

call :stage 1/6 "Validando archivos base"
call :check_required "%PANEL_PS1%" "Panel-Control.ps1"
if errorlevel 1 goto :fail
call :check_required "%SERVER_JS%" "server.js"
if errorlevel 1 goto :fail
call :check_required "%GAME_HTML%" "math-attack.html"
if errorlevel 1 goto :fail
call :check_required "%TEACHER_HTML%" "maestro.html"
if errorlevel 1 goto :fail

if not exist "%RANKING_HTML%" (
    >>"%BOOTSTRAP_LOG%" echo [Aviso] Falta ranking.html
)

if not exist "%HOTSPOT_PS1%" (
    >>"%BOOTSTRAP_LOG%" echo [Aviso] Falta hotspot.ps1
)

call :stage 2/6 "Buscando runtime local de Node.js"
call :find_runtime
if not defined LOCAL_NODE_DIR (
    call :stage 3/6 "Descargando runtime portable de Node.js"
    call :download_runtime
    if errorlevel 1 goto :fail
    call :stage 4/6 "Detectando runtime descargada"
    call :find_runtime
)
if defined LOCAL_NODE_DIR (
    >>"%BOOTSTRAP_LOG%" echo [Runtime] %LOCAL_NODE_DIR%
)

if not defined LOCAL_NODE_DIR (
    color 0C
    echo  Error: no se pudo preparar la runtime local de Node.js.
    echo.
    pause
    exit /b 1
)

set "NODE_CMD=%LOCAL_NODE_DIR%\node.exe"
set "NPM_CMD=%LOCAL_NODE_DIR%\npm.cmd"
set "MATH_ATTACK_NODE_DIR=%LOCAL_NODE_DIR%"
set "MATH_ATTACK_NODE_EXE=%NODE_CMD%"
set "MATH_ATTACK_NPM_CMD=%NPM_CMD%"
set "PATH=%LOCAL_NODE_DIR%;%PATH%"

call :stage 5/6 "Validando runtime y dependencias"
%NODE_CMD% --version >nul
>>"%BOOTSTRAP_LOG%" %NODE_CMD% --version

call :ensure_dependency_ws
if errorlevel 1 goto :fail

call :verify_server
if errorlevel 1 goto :fail

call :stage 6/6 "Verificando servidor y abriendo panel"
>>"%BOOTSTRAP_LOG%" echo [Bootstrap] Verificacion completa %date% %time%
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%PANEL_PS1%"
exit /b %errorlevel%

:stage
title Math Attack - %~2
>>"%BOOTSTRAP_LOG%" echo [Etapa %~1] %~2
exit /b 0

:check_required
if exist "%~1" exit /b 0
color 0C
echo  Error: no se encontro %~2 en esta carpeta.
echo  Copia completa esperada:
echo    %ROOT%
echo.
>>"%BOOTSTRAP_LOG%" echo [Error] Falta %~2
exit /b 1

:find_runtime
set "LOCAL_NODE_DIR="
for /d %%D in ("%RUNTIME_ROOT%\node-v*-%NODE_ARCH%") do (
    if exist "%%~fD\node.exe" (
        set "LOCAL_NODE_DIR=%%~fD"
    )
)
exit /b 0

:download_runtime
set "NODE_ZIP=node-v%NODE_VERSION%-%NODE_ARCH%.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP%"
set "NODE_ZIP_PATH=%TEMP_ROOT%\%NODE_ZIP%"

if not exist "%RUNTIME_ROOT%" mkdir "%RUNTIME_ROOT%"
if not exist "%TEMP_ROOT%" mkdir "%TEMP_ROOT%"

color 0B
echo  Preparando componentes iniciales...
>>"%BOOTSTRAP_LOG%" echo [Descarga] %NODE_URL%

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "& { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP_PATH%' -UseBasicParsing; Write-Host '  Descarga completada. Extrayendo runtime...'; Expand-Archive -LiteralPath '%NODE_ZIP_PATH%' -DestinationPath '%RUNTIME_ROOT%' -Force; Write-Host '  Runtime extraida correctamente.' } catch { Write-Host $_.Exception.Message; exit 1 } }"
if errorlevel 1 (
    color 0C
    echo  Error: no se pudo descargar o extraer la runtime local de Node.js.
    echo  Verifica internet o copia la carpeta .runtime desde una maquina que ya funcione.
    echo.
    >>"%BOOTSTRAP_LOG%" echo [Error] No se pudo descargar o extraer la runtime local
    pause
    exit /b 1
)

if exist "%NODE_ZIP_PATH%" del "%NODE_ZIP_PATH%" >nul 2>&1
exit /b 0

:ensure_dependency_ws
if exist "%ROOT%node_modules\ws\package.json" (
    >>"%BOOTSTRAP_LOG%" echo [WS] Ya estaba lista
    exit /b 0
)

echo  Preparando componentes iniciales...
>>"%BOOTSTRAP_LOG%" echo [WS] Instalando ws
call "%NPM_CMD%" install ws@8.21.0 --no-save --no-package-lock --omit=dev --omit=optional --no-fund --no-audit >>"%BOOTSTRAP_LOG%" 2>&1
if exist "%ROOT%node_modules\ws\package.json" (
    >>"%BOOTSTRAP_LOG%" echo [WS] Instalada correctamente
    exit /b 0
)

color 0C
echo  Error: no se pudo instalar la dependencia ws.
echo  Verifica conexion a internet o permisos de escritura en esta carpeta.
echo  Revisa el log:
echo    %BOOTSTRAP_LOG%
echo.
>>"%BOOTSTRAP_LOG%" echo [Error] Fallo instalacion ws
pause
exit /b 1

:verify_server
pushd "%ROOT%" >nul
%NODE_CMD% -e "const fs=require('fs'); const vm=require('vm'); new vm.Script(fs.readFileSync('server.js','utf8'),{filename:'server.js'});" >nul
if errorlevel 1 (
    popd >nul
    color 0C
    echo  Error: server.js tiene un problema de sintaxis y no se puede iniciar asi.
    echo  Revisa el archivo server.js antes de continuar.
    echo.
    >>"%BOOTSTRAP_LOG%" echo [Error] server.js no paso verificacion de sintaxis
    pause
    exit /b 1
)
popd >nul
>>"%BOOTSTRAP_LOG%" echo [Servidor] Verificado correctamente
exit /b 0

:fail
color 0C
echo  No fue posible dejar el panel listo.
echo  Revisa el log:
echo    %BOOTSTRAP_LOG%
echo.
>>"%BOOTSTRAP_LOG%" echo [Bootstrap] Fallo general %date% %time%
pause
exit /b 1

