param(
    [string]$Accion = "iniciar",
    [string]$SSID = "MathAttack",
    [string]$Clave = "matematicas"
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking,ContentType=WindowsRuntime]
[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration,Windows.Networking,ContentType=WindowsRuntime]
[void][Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]

function Get-InterfaceTypeName {
    param([int]$IanaType)
    switch ($IanaType) {
        6   { return "Ethernet" }
        71  { return "WiFi" }
        243 { return "Celular" }
        default { return "Tipo $IanaType" }
    }
}

function Get-PerfilDescripcion {
    param($Perfil)

    $nombrePerfil = ""
    $tipo = "Desconocido"
    $adapterId = $null
    $nombreAdaptador = ""

    try { $nombrePerfil = [string]$Perfil.ProfileName } catch {}
    try { $tipo = Get-InterfaceTypeName $Perfil.NetworkAdapter.IanaInterfaceType } catch {}
    try { $adapterId = $Perfil.NetworkAdapter.NetworkAdapterId } catch {}

    if ($adapterId) {
        try {
            $adapter = Get-NetAdapter -IncludeHidden -ErrorAction Stop |
                Where-Object { $_.InterfaceGuid -eq $adapterId.Guid } |
                Select-Object -First 1
            if ($adapter) {
                $nombreAdaptador = [string]$adapter.InterfaceDescription
                if ([string]::IsNullOrWhiteSpace($nombreAdaptador)) {
                    $nombreAdaptador = [string]$adapter.Name
                }
            }
        } catch {}
    }

    if ([string]::IsNullOrWhiteSpace($nombrePerfil)) { $nombrePerfil = "(sin nombre visible)" }
    if ([string]::IsNullOrWhiteSpace($nombreAdaptador)) { $nombreAdaptador = "(adaptador no identificado)" }
    return "Conexion usada: $nombrePerfil | Tipo: $tipo | Adaptador: $nombreAdaptador"
}


# Espera una IAsyncOperation<T> de WinRT
function Esperar {
    param($op, [Type]$tipo)
    $m = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
        Select-Object -First 1).MakeGenericMethod($tipo)
    $t = $m.Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    $t.Result
}

# Espera una IAsyncAction de WinRT
function EsperarAccion {
    param($op)
    $m = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object { $_.Name -eq "AsTask" -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
        Select-Object -First 1
    $t = $m.Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
}

# Obtener perfil de red: primero con internet, luego Ethernet, luego WiFi, luego cualquiera
$perfil = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()

if ($null -eq $perfil) {
    $todos = @([Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles())
    $perfil = $todos | Where-Object { $_.NetworkAdapter -ne $null } |
        Sort-Object {
            switch ($_.NetworkAdapter.IanaInterfaceType) {
                6  { 1 }   # Ethernet
                71 { 2 }   # WiFi
                default { 3 }
            }
        } | Select-Object -First 1
}

if ($null -eq $perfil) {
    Write-Host "ERROR: No se encontro ningun adaptador de red activo." -ForegroundColor Red
    exit 1
}

Write-Host (Get-PerfilDescripcion $perfil)

$mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($perfil)

if ($Accion -eq "detener") {
    try {
        Esperar ($mgr.StopTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]) | Out-Null
        Write-Host "Red WiFi MathAttack detenida."
    } catch {
        Write-Host "Advertencia al detener: $_"
    }
    exit 0
}

# Configurar SSID y clave del hotspot (objeto nuevo para asegurar mutabilidad)
try {
    $cfg = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration]::new()
    $cfg.Ssid = $SSID
    $cfg.Passphrase = $Clave

    # Forzar 2.4 GHz — Método 1: tipo WinRT por nombre
    $band24Set = $false
    try {
        [void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointBand,Windows.Networking,ContentType=WindowsRuntime]
        $cfg.Band = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointBand]::TwoPointFourGigahertz
        $band24Set = $true
    } catch { }

    # Método 2: reflexión con valor entero (TwoPointFourGigahertz = 1 en el enum WinRT)
    if (-not $band24Set) {
        try {
            $bandProp = $cfg.GetType().GetProperty("Band")
            if ($null -ne $bandProp) {
                $val = [System.Enum]::ToObject($bandProp.PropertyType, 1)
                $bandProp.SetValue($cfg, $val)
                $band24Set = $true
            }
        } catch { }
    }

    if (-not $band24Set) {
        Write-Host "Advertencia: No se pudo forzar la banda 2.4 GHz. El hotspot usara la banda automatica."
    }

    EsperarAccion ($mgr.ConfigureAccessPointAsync($cfg))
} catch {
    Write-Host "Advertencia: No se pudo cambiar SSID/clave/banda. Se usara la configuracion actual."
}

# Iniciar el hotspot
try {
    $r = Esperar ($mgr.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
    $estado = $r.Status.ToString()
    if ($estado -eq "Success" -or $estado -eq "AlreadyOn") {
        if ($estado -eq "Success") {
            Start-Sleep -Seconds 2
        }
        Write-Host "Hotspot listo: SSID '$SSID' en 2.4 GHz si el adaptador lo permite."
        exit 0
    } else {
        Write-Host "ERROR al iniciar hotspot: $estado" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    exit 1
}
