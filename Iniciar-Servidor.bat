@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Math Attack - Servidor Multijugador
color 0A
cls
cd /d "%~dp0"

echo.
echo  ============================================
echo      Math Attack - Servidor Multijugador
echo  ============================================
echo.

set HOTSPOT_ACTIVO=0
set "LOCAL_NODE_DIR="
for /d %%D in ("%~dp0.runtime\node-v20.*-win-x64") do (
    if exist "%%~fD\node.exe" (
        set "LOCAL_NODE_DIR=%%~fD"
        goto :runtime_detectada
    )
)
:runtime_detectada
if defined LOCAL_NODE_DIR (
    set "NODE_CMD="%LOCAL_NODE_DIR%\node.exe""
    set "NPM_CMD="%LOCAL_NODE_DIR%\npm.cmd""
    set "NODE_PS_CMD='%LOCAL_NODE_DIR%\node.exe'"
) else (
    set "NODE_CMD=node"
    set "NPM_CMD=npm"
    set "NODE_PS_CMD=node"
)

:: Verificar si Node.js ya esta instalado
%NODE_CMD% --version >nul 2>&1
if %errorlevel% equ 0 (
    if defined LOCAL_NODE_DIR (
        echo  Node.js local detectado:
    ) else (
        echo  Node.js detectado:
    )
    %NODE_CMD% --version
    echo.
    goto :firewall
)

:: Detectar arquitectura del sistema
set "NODE_URL=https://nodejs.org/dist/v22.13.1/node-v22.13.1-x64.msi"
set "NODE_FILE=node-installer-x64.msi"
if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    if "%PROCESSOR_ARCHITEW6432%"=="" (
        set "NODE_URL=https://nodejs.org/dist/v22.13.1/node-v22.13.1-x86.msi"
        set "NODE_FILE=node-installer-x86.msi"
        echo  Sistema de 32 bits detectado, usando instalador x86.
    )
)

:: Descargar e instalar Node.js
echo  Node.js no esta instalado.
echo  Descargando instalador... (puede tardar unos minutos)
echo.

if not exist "%~dp0temp" mkdir "%~dp0temp"

powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $url = '%NODE_URL%'; $dest = '%~dp0temp\%NODE_FILE%'; Write-Host '  Descargando Node.js v22.13.1...'; Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing; Write-Host '  Descarga completada.' }"

if not exist "%~dp0temp\%NODE_FILE%" (
    color 0C
    echo.
    echo  Error al descargar Node.js.
    echo  Descargalo manualmente desde: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo  Abriendo el instalador de Node.js...
echo  Sigue los pasos: Siguiente - Siguiente - Instalar - Finalizar
echo.
start /wait msiexec /i "%~dp0temp\%NODE_FILE%"

del "%~dp0temp\%NODE_FILE%" >nul 2>&1
rmdir "%~dp0temp" >nul 2>&1

:: Refrescar PATH del sistema para esta sesion
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=%SYS_PATH%;%USR_PATH%"

set "NODE_CMD=node"
set "NPM_CMD=npm"
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0E
    echo.
    echo  Instalacion completada.
    echo  Reiniciando el servidor automaticamente...
    echo.
    timeout /t 2 /nobreak >nul
    start "" "%~f0"
    exit /b 0
)

echo  Node.js instalado correctamente.
echo.

:: Configurar Firewall
:firewall
echo  Configurando firewall para puerto 8080...

netsh advfirewall firewall show rule name="Math Attack Puerto 8080" >nul 2>&1
if %errorlevel% equ 0 (
    echo  Regla de firewall ya configurada.
    echo.
    goto :opcion_hotspot
)

netsh advfirewall firewall add rule name="Math Attack Puerto 8080" dir=in action=allow protocol=TCP localport=8080 >nul 2>&1
if %errorlevel% equ 0 (
    echo  Firewall configurado: puerto 8080 abierto.
    echo.
) else (
    echo  No se pudo configurar el firewall automaticamente.
    echo  Ejecuta este archivo como Administrador:
    echo    Click derecho en Iniciar-Servidor.bat
    echo    Selecciona "Ejecutar como administrador"
    echo.
)

:: Opcion: Crear red WiFi (Hotspot)
:opcion_hotspot
echo  Crear una red WiFi para los alumnos? (util cuando no hay WiFi)
set /p CREAR_HOTSPOT="  [S] Si  /  [N] No  (Enter = No): "
if /i "%CREAR_HOTSPOT%"=="S" goto :crear_hotspot
echo.
goto :instalar_ws

:crear_hotspot
echo.
set "HOTSPOT_SSID=MathAttack"
set "HOTSPOT_CLAVE=matematicas"
echo  Configuracion de la red WiFi:
set /p HOTSPOT_SSID="  Nombre de la red (Enter = MathAttack): "
if "%HOTSPOT_SSID%"=="" set "HOTSPOT_SSID=MathAttack"
:pedir_clave_hotspot
set /p HOTSPOT_CLAVE="  Contrasena (Enter = matematicas): "
if "%HOTSPOT_CLAVE%"=="" set "HOTSPOT_CLAVE=matematicas"
if "!HOTSPOT_CLAVE:~7,1!"=="" (
    echo  La contrasena debe tener al menos 8 caracteres.
    goto :pedir_clave_hotspot
)
echo  Iniciando zona de cobertura inalambrica movil...
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0hotspot.ps1" -Accion iniciar -SSID "!HOTSPOT_SSID!" -Clave "!HOTSPOT_CLAVE!"
if %errorlevel% neq 0 goto :hotspot_fallo
set HOTSPOT_ACTIVO=1
echo.
echo  +------------------------------------------+
echo  ^|  Red WiFi creada correctamente          ^|
echo  ^|  Nombre (SSID): !HOTSPOT_SSID! ^|
echo  ^|  Contrasena:    !HOTSPOT_CLAVE! ^|
echo  +------------------------------------------+
echo.
goto :instalar_ws

:hotspot_fallo
echo.
echo  No se pudo crear la red WiFi.
echo  Verifica que ejecutas este archivo como Administrador.
echo.
pause
goto :instalar_ws

:: Instalar dependencia ws
:instalar_ws
if exist "%~dp0node_modules\ws\package.json" goto :verificar_server
echo  Instalando dependencias del servidor en esta carpeta...
call %NPM_CMD% install ws --no-save --no-fund --no-audit >nul 2>&1
if exist "%~dp0node_modules\ws\package.json" (
    echo  Dependencias instaladas correctamente.
    echo.
    goto :verificar_server
)
color 0C
echo.
echo  Error: no se pudo instalar la dependencia "ws" en esta copia del proyecto.
echo  Carpeta actual:
echo    %~dp0
echo.
echo  Verifica conexion a internet y permisos de escritura en esta carpeta.
echo  Si moviste o copiaste el proyecto, ejecuta este mismo archivo dentro de esa copia.
echo.
pause
exit /b 1
:: Verificar server.js
:verificar_server
if exist "%~dp0server.js" goto :verificar_ip_file
color 0C
echo  No se encontro server.js en esta carpeta.
echo.
pause
exit /b 1

:: Verificar ultima-ip.txt y limpiarlo si trae caracteres invalidos
:verificar_ip_file
if not exist "%~dp0ultima-ip.txt" goto :iniciar_servidor
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$raw = Get-Content -LiteralPath '%~dp0ultima-ip.txt' -Raw -ErrorAction SilentlyContinue; if ($null -eq $raw) { '' } else { ($raw -replace '[^\d\.\r\n]','').Trim() }"`) do set "IP_ARCHIVO_LIMPIO=%%I"
if not defined IP_ARCHIVO_LIMPIO goto :iniciar_servidor
> "%~dp0ultima-ip.txt" <nul set /p ="!IP_ARCHIVO_LIMPIO!"

:: Iniciar servidor
:iniciar_servidor
:: Desactivar Quick Edit Mode: evita que un clic en la consola pause el servidor
reg add "HKCU\Console" /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1

:: Detectar IP actual
set "IP_FILE=%~dp0ultima-ip.txt"
set "IP_ACTUAL="
if "%HOTSPOT_ACTIVO%"=="1" (
    set "IP_ACTUAL=192.168.137.1"
) else (
    for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr "IPv4"') do (
        for /f "tokens=1" %%J in ("%%I") do (
            if not "%%J"=="127.0.0.1" if "!IP_ACTUAL!"=="" set "IP_ACTUAL=%%J"
        )
    )
)

:: Alertar si la IP cambio desde la ultima vez
if exist "%IP_FILE%" (
    set /p IP_ANTERIOR=<"%IP_FILE%"
    if not "!IP_ACTUAL!"=="!IP_ANTERIOR!" (
        color 0E
        echo.
        echo  +--------------------------------------------------+
        echo  ^|  *** ATENCION: LA IP DEL SERVIDOR CAMBIO ***    ^|
        echo  ^|                                                  ^|
        echo  ^|    IP anterior: !IP_ANTERIOR! ^|
        echo  ^|    IP nueva:    !IP_ACTUAL! ^|
        echo  ^|                                                  ^|
        echo  ^|  Dile a los alumnos que usen la nueva IP.       ^|
        echo  +--------------------------------------------------+
        echo.
        color 0A
    )
)
echo !IP_ACTUAL!>"%IP_FILE%"

echo.
echo  Los alumnos deben abrir en su navegador:
if "%HOTSPOT_ACTIVO%"=="1" (
    echo      http://192.168.137.1:8080/
) else (
    for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr "IPv4"') do for /f "tokens=1" %%J in ("%%I") do (
        if not "%%J"=="127.0.0.1" echo      http://%%J:8080/
    )
)
echo.
cd /d "%~dp0"

if "%HOTSPOT_ACTIVO%"=="1" goto :servidor_loop

:: Modo N: ejecutar una sola vez, luego verificar y pausar
call :liberar_puerto
echo  Iniciando servidor Math Attack...
echo  Presiona Ctrl+C para detenerlo.
echo.
powershell -ExecutionPolicy Bypass -NoProfile -Command "Set-Location '%~dp0'; & %NODE_PS_CMD% server.js"

color 0A
echo.
echo  Liberando puerto 8080...
call :liberar_puerto
timeout /t 2 /nobreak >nul

echo  Verificando datos guardados...
if exist "%~dp0ranking.json" (
    echo  [OK] Estadisticas guardadas correctamente en ranking.json
) else (
    color 0E
    echo  [AVISO] No se encontro ranking.json - no habia estadisticas guardadas
)
echo.
echo  Limpiando archivos temporales...
if exist "%~dp0temp" rmdir /s /q "%~dp0temp"
echo  Se conservaron los archivos .log para no perder evidencias.
echo  Limpieza completada.
echo.
color 0A
echo.
echo  El servidor se detuvo.
echo.
goto :fin

:: Modo S: PowerShell gestiona el loop y detiene el hotspot al cerrar
:servidor_loop
color 0A
call :liberar_puerto
echo  Iniciando servidor Math Attack (modo hotspot)...
echo  Cierra esta ventana para apagar el servidor y el WiFi.
echo.
powershell -ExecutionPolicy Bypass -NoProfile -Command "try { Set-Location '%~dp0'; $caidas=0; $inicio=[DateTime]::UtcNow; while ($true) { & %NODE_PS_CMD% server.js; $caidas++; $seg=([DateTime]::UtcNow - $inicio).TotalSeconds; Write-Host ''; Write-Host \"  El servidor se detuvo (caida #$caidas).\"; $pids = (netstat -ano | Select-String ':8080') | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Sort-Object -Unique; foreach ($p in $pids) { try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host \"  Puerto 8080 liberado (PID $p).\" } catch {} }; Start-Sleep 2; if ($seg -lt 10) { Write-Host '  ERROR: el servidor cayo muy rapido. Revisa server.js.' -ForegroundColor Red; Write-Host '  Esperando 15 segundos antes de reintentar...'; Start-Sleep 15 } else { Write-Host '  Reiniciando en 3 segundos... (cierra esta ventana para apagar)'; Start-Sleep 3 }; $inicio=[DateTime]::UtcNow } } finally { Write-Host ''; Write-Host '  Apagando red WiFi MathAttack...'; & '%~dp0hotspot.ps1' -Accion detener }"

:fin
pause
exit /b 0

:: Subrutina: libera el puerto 8080 si ya esta ocupado
:liberar_puerto
set "_algun_pid=0"
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":8080"') do (
    if not "%%P"=="0" if not "%%P"=="" (
        echo  Puerto 8080 ocupado (PID %%P^), cerrando proceso...
        taskkill /PID %%P /F >nul 2>&1
        set "_algun_pid=1"
    )
)
if "%_algun_pid%"=="1" timeout /t 2 /nobreak >nul
exit /b 0

