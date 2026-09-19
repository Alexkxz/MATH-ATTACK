# Busca el servidor de Math Attack en la red local probando el puerto 8080
# directamente desde PowerShell (sin pasar por el navegador), porque Chrome
# bloquea por seguridad que una pagina abierta como archivo escanee la red.
# Una vez encontrada la IP, abre el navegador ya apuntando directo a ella
# (eso si funciona, igual que cuando se escribe la URL a mano).

# Como el script corre con -WindowStyle Hidden (sin consola visible), un error no
# capturado lo mataria sin que el alumno viera nada — el navegador simplemente nunca
# se abriria. Por eso TODO el cuerpo va dentro de un try/catch con aviso visible.
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {

$PORT = 8080
$historyDir = Join-Path $env:LOCALAPPDATA 'MathAttack'
if (-not (Test-Path $historyDir)) { New-Item -ItemType Directory -Path $historyDir -Force | Out-Null }
$historyFile = Join-Path $historyDir 'ultima-ip-cliente.txt'

# Ventana con barra de progreso: sin esto el alumno no ve nada por varios
# segundos (el .bat corre con -WindowStyle Hidden) y puede pensar que no
# pasa nada y cerrarlo. Se muestra con Show() (no modal) y se refresca a
# mano con DoEvents() porque el script no corre un Application.Run().
$ventana = New-Object System.Windows.Forms.Form
$ventana.Text = 'Math Attack'
$ventana.Size = New-Object System.Drawing.Size(380, 140)
$ventana.StartPosition = 'CenterScreen'
$ventana.FormBorderStyle = 'FixedDialog'
$ventana.MaximizeBox = $false
$ventana.MinimizeBox = $false
$ventana.TopMost = $true

$etiqueta = New-Object System.Windows.Forms.Label
$etiqueta.Text = 'Buscando el servidor de Math Attack...'
$etiqueta.Size = New-Object System.Drawing.Size(340, 40)
$etiqueta.Location = New-Object System.Drawing.Point(20, 15)
$ventana.Controls.Add($etiqueta)

$barra = New-Object System.Windows.Forms.ProgressBar
$barra.Location = New-Object System.Drawing.Point(20, 60)
$barra.Size = New-Object System.Drawing.Size(340, 25)
$barra.Minimum = 0
$barra.Maximum = 100
$ventana.Controls.Add($barra)

$ventana.Show()
$ventana.Refresh()

function Update-Progreso {
    param([int]$valor, [string]$texto)
    # Si el alumno cierra la ventana a mano, los controles quedan
    # liberados; el escaneo debe poder seguir igual en segundo plano.
    try {
        $barra.Value = [Math]::Max(0, [Math]::Min(100, $valor))
        if ($texto) { $etiqueta.Text = $texto }
        [System.Windows.Forms.Application]::DoEvents()
    } catch {}
}

function Test-Puerto {
    param([string]$ip, [int]$port, [int]$timeoutMs = 600)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $task = $client.ConnectAsync($ip, $port)
        $ok = $task.Wait($timeoutMs) -and $client.Connected
        $client.Close()
        return $ok
    } catch { return $false }
}

function Get-RedesLocales {
    $virtualPattern = '(?i)(virtual|vmware|virtualbox|hyper-v|hyperv|vpn|tunnel|tailscale|hamachi|zerotier|wsl|bluetooth|loopback|docker|wireguard)'
    $redes = @()
    foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($adapter.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
        $nombre = "$($adapter.Name) $($adapter.Description)"
        if ($nombre -match $virtualPattern) { continue }
        try {
            $props = $adapter.GetIPProperties()
            $gateway = @($props.GatewayAddresses | Where-Object {
                $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                $_.Address.ToString() -notmatch '^0\.0\.0\.0$'
            } | Select-Object -First 1)
            foreach ($unicast in $props.UnicastAddresses) {
                $ip = $unicast.Address.ToString()
                if ($unicast.Address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { continue }
                if ($ip -match '^(127\.|169\.254\.|0\.)') { continue }
                $partes = $ip.Split('.')
                if ($partes.Count -ne 4) { continue }
                $redes += [PSCustomObject]@{
                    IP = $ip
                    Subred = "$($partes[0]).$($partes[1]).$($partes[2])"
                    Octeto = [int]$partes[3]
                    Gateway = if ($gateway.Count) { $gateway[0].Address.ToString() } else { '' }
                    Adaptador = $adapter.Name
                }
            }
        } catch {}
    }
    return $redes
}

function Test-ServidorWeb {
    param([string]$ip, [int]$port, [int]$timeoutMs = 1800)
    try {
        $request = [System.Net.HttpWebRequest]::Create("http://${ip}:$port/")
        $request.Method = 'GET'
        $request.Timeout = $timeoutMs
        $request.ReadWriteTimeout = $timeoutMs
        $response = $request.GetResponse()
        $response.Close()
        return $true
    } catch { return $false }
}

function Test-IPValida {
    param([string]$ip)
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($ip, [ref]$parsed)) { return $false }
    return $parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
        $ip -notmatch '^(127\.|169\.254\.|0\.)'
}

function Show-ErrorComunicacion {
    param([string]$detalle, [string]$redes)
    [Microsoft.VisualBasic.Interaction]::MsgBox(
        "No se pudo establecer comunicacion con el servidor de Math Attack.`r`n`r`n" +
        "$detalle`r`n`r`n" +
        "Red detectada en esta computadora:`r`n$redes`r`n`r`n" +
        "Verifica que ambas computadoras esten en el mismo Wi-Fi y que el servidor este ACTIVO.`r`n" +
        "No se abrira el navegador hasta comprobar el puerto 8080.",
        'OKOnly,Exclamation', 'Math Attack - Error de red') | Out-Null
}

# Prueba un lote de IPs en paralelo (sockets asincronicos) y devuelve la primera que responda
function Find-EnLote {
    param([string[]]$ips, [int]$port, [int]$timeoutMs = 600)
    $conexiones = $ips | ForEach-Object {
        $c = New-Object System.Net.Sockets.TcpClient
        [PSCustomObject]@{ IP = $_; Client = $c; Task = $c.ConnectAsync($_, $port) }
    }
    $encontrado = $null
    $limite = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $limite -and -not $encontrado) {
        foreach ($cx in $conexiones) {
            if ($cx.Task.IsCompleted -and -not $cx.Task.IsFaulted -and $cx.Client.Connected) {
                $encontrado = $cx.IP
                break
            }
        }
        if (-not $encontrado) { Start-Sleep -Milliseconds 40 }
    }
    foreach ($cx in $conexiones) { try { $cx.Client.Close(); $cx.Client.Dispose() } catch {} }
    return $encontrado
}

# Genera las IPs de una subred: primero cerca del octeto propio, luego las comunes, luego el resto
function Get-IPsSubred {
    param([string]$subred, [Nullable[int]]$octetoPropio)
    $orden = New-Object System.Collections.Generic.List[int]
    if ($null -ne $octetoPropio) {
        for ($d = 1; $d -le 30; $d++) {
            if ($octetoPropio - $d -ge 1)   { $orden.Add($octetoPropio - $d) }
            if ($octetoPropio + $d -le 254) { $orden.Add($octetoPropio + $d) }
        }
    }
    foreach ($o in 1,2,100,101,102,103,104,110,120,150,200,201,202,210,220,250,254) {
        if (-not $orden.Contains($o)) { $orden.Add($o) }
    }
    for ($i = 1; $i -le 254; $i++) { if (-not $orden.Contains($i)) { $orden.Add($i) } }
    return $orden | ForEach-Object { "$subred.$_" }
}

# ── 1. Candidatos rapidos: ultima IP usada + hotspot de Windows ──────────
$candidatos = @('192.168.137.1')
if (Test-Path $historyFile) {
    $previa = (Get-Content $historyFile -Raw -ErrorAction SilentlyContinue)
    if ($previa) { $previa = $previa.Trim() }
    if ($previa -and $candidatos -notcontains $previa) { $candidatos = @($previa) + $candidatos }
}

Update-Progreso 5 'Probando conexiones recientes...'
$encontrado = $null
$direcciones = @()
foreach ($ip in $candidatos) {
    if (Test-Puerto -ip $ip -port $PORT -timeoutMs 800) { $encontrado = $ip; break }
}

# ── 2. Detectar subredes locales reales y escanearlas ────────────────────
if (-not $encontrado) {
    Update-Progreso 15 'Detectando redes locales...'
    $direcciones = Get-RedesLocales

    $subredes = @()
    foreach ($dir in $direcciones) {
        $subred = $dir.Subred
        if (-not ($subredes | Where-Object { $_.Subred -eq $subred })) {
            $subredes += [PSCustomObject]@{ Subred = $subred; Octeto = $dir.Octeto }
        }
    }
    if (-not $subredes) {
        $subredes = @(
            [PSCustomObject]@{ Subred = '192.168.1';   Octeto = $null }
            [PSCustomObject]@{ Subred = '192.168.0';   Octeto = $null }
            [PSCustomObject]@{ Subred = '192.168.137'; Octeto = $null }
        )
    }

    $totalIPsTodas = $subredes.Count * 254
    $procesadas = 0
    foreach ($s in $subredes) {
        if ($encontrado) { break }
        $ips = Get-IPsSubred -subred $s.Subred -octetoPropio $s.Octeto
        for ($i = 0; $i -lt $ips.Count -and -not $encontrado; $i += 50) {
            $fin = [Math]::Min($i + 49, $ips.Count - 1)
            $encontrado = Find-EnLote -ips $ips[$i..$fin] -port $PORT -timeoutMs 600
            $procesadas += ($fin - $i + 1)
            $pct = 20 + [Math]::Round(($procesadas / [Math]::Max(1, $totalIPsTodas)) * 75)
            Update-Progreso $pct "Escaneando red $($s.Subred).0/24..."
        }
    }
}

# ── 3. Resultado: conectar, o pedir la IP a mano ──────────────────────────
if ($encontrado) {
    Update-Progreso 96 "Verificando sitio web en $encontrado..."
    if (Test-ServidorWeb -ip $encontrado -port $PORT) {
        Update-Progreso 100 "Servidor encontrado en $encontrado"
        $encontrado | Out-File $historyFile -Encoding utf8 -NoNewline
        Start-Sleep -Milliseconds 400
        try { $ventana.Close() } catch {}
        Start-Process "http://${encontrado}:$PORT/"
        exit 0
    }
    $redesTexto = ($direcciones | ForEach-Object { "$($_.IP) / $($_.Adaptador)" }) -join [Environment]::NewLine
    try { $ventana.Close() } catch {}
    Show-ErrorComunicacion "El puerto 8080 respondio, pero el sitio web no devolvio respuesta." $redesTexto
    exit 1
}

try { $ventana.Close() } catch {}
$redesTexto = ($direcciones | ForEach-Object { "$($_.IP) / $($_.Adaptador) / gateway $($_.Gateway)" }) -join [Environment]::NewLine
if (-not $redesTexto) { $redesTexto = '(No se detecto una interfaz IPv4 activa)' }
Show-ErrorComunicacion "No se encontro ningun equipo con el puerto TCP 8080 abierto." $redesTexto
$manual = [Microsoft.VisualBasic.Interaction]::InputBox(
    "No se encontro el servidor automaticamente en la red." + [Environment]::NewLine +
    "Escribe la IP del maestro (ejemplo: 192.168.1.42):",
    "Math Attack - Conectar", "")
$manual = $manual.Trim()
if (Test-IPValida $manual) {
    if (Test-Puerto -ip $manual -port $PORT -timeoutMs 1800) {
        if (Test-ServidorWeb -ip $manual -port $PORT) {
            $manual | Out-File $historyFile -Encoding utf8 -NoNewline
            Start-Process "http://${manual}:$PORT/"
        } else {
            Show-ErrorComunicacion "La IP $manual existe, pero no responde como sitio web en el puerto $PORT." $redesTexto
        }
    } else {
        Show-ErrorComunicacion "La IP $manual no responde en el puerto TCP $PORT." $redesTexto
    }
} elseif ($manual) {
    Show-ErrorComunicacion "La IP escrita no es valida: $manual" $redesTexto
}

} catch {
    try { if ($ventana) { $ventana.Close() } } catch {}
    [Microsoft.VisualBasic.Interaction]::MsgBox(
        "No se pudo buscar el servidor de Math Attack." + [Environment]::NewLine +
        "Detalle: $($_.Exception.Message)" + [Environment]::NewLine + [Environment]::NewLine +
        "Pidele la IP al maestro y escribela en el navegador como http://IP:8080/",
        'OKOnly,Exclamation', 'Math Attack - Error')
}
