# Panel de control grafico para Math Attack -- sin terminal visible
# Requiere: Windows PowerShell 5+ (incluido en Windows 10/11)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class DpiHelper {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[DpiHelper]::SetProcessDPIAware() | Out-Null

$scriptPath  = $MyInvocation.MyCommand.Path
$scriptDir   = Split-Path -Parent $scriptPath
$logFile     = "$scriptDir\panel-log.txt"
$logMaxBytes = 1MB  # rota a panel-log.txt.old al llegar a este tamano (antes crecia sin limite)
$devicesFile = "$scriptDir\devices.json"
$ipFile      = "$scriptDir\ultima-ip.txt"

# Cargar dispositivos guardados
$script:devices = @{}
if (Test-Path $devicesFile) {
    try {
        $json = Get-Content $devicesFile -Raw -Encoding UTF8
        $obj  = ConvertFrom-Json $json
        foreach ($prop in $obj.PSObject.Properties) {
            $script:devices[$prop.Name] = @{
                name      = [string]$prop.Value.name
                firstSeen = [string]$prop.Value.firstSeen
                lastSeen  = [string]$prop.Value.lastSeen
            }
        }
    } catch {}
}

# ---- Paleta de colores ------------------------------------------
$C = @{
    BG      = [System.Drawing.Color]::FromArgb(15,  15,  25)
    BG2     = [System.Drawing.Color]::FromArgb(22,  22,  35)
    CARD    = [System.Drawing.Color]::FromArgb(30,  30,  48)
    PANEL   = [System.Drawing.Color]::FromArgb(38,  38,  58)
    BORDER  = [System.Drawing.Color]::FromArgb(55,  55,  80)
    HOVER   = [System.Drawing.Color]::FromArgb(65,  65,  95)
    TEXT    = [System.Drawing.Color]::FromArgb(220, 225, 245)
    DIM     = [System.Drawing.Color]::FromArgb(110, 115, 140)
    BLUE    = [System.Drawing.Color]::FromArgb(100, 160, 255)
    GREEN   = [System.Drawing.Color]::FromArgb(130, 220, 140)
    RED     = [System.Drawing.Color]::FromArgb(255, 100, 120)
    YELLOW  = [System.Drawing.Color]::FromArgb(255, 210, 100)
    DARK    = [System.Drawing.Color]::FromArgb(15,  15,  25)
}

# ---- Estado global ----------------------------------------------
$global:serverProcess   = $null
$script:stdoutReader    = $null
$script:stderrReader    = $null
$script:stdoutTask      = $null
$script:stderrTask      = $null
$script:serverStartTime = $null   # para el temporizador de actividad
$script:intentionalStop = $false  # distingue stop manual vs crash
$script:hotspotActivo   = $false
$script:hotspotSSID     = "MathAttack"
$script:hotspotClave    = "matematicas"

# ---- Funciones utilitarias --------------------------------------

function Get-LocalIP {
    if ($script:hotspotActivo) { return "192.168.137.1" }
    try {
        $sock = New-Object System.Net.Sockets.Socket(
            [System.Net.Sockets.AddressFamily]::InterNetwork,
            [System.Net.Sockets.SocketType]::Dgram,
            [System.Net.Sockets.ProtocolType]::Udp)
        $sock.Connect("8.8.8.8", 80)
        $ip = $sock.LocalEndPoint.Address.ToString()
        $sock.Close()
        return $ip
    } catch { return "127.0.0.1" }
}

function Remove-AnsiCodes($text) {
    if ($null -eq $text) { return $null }
    # Secuencias CSI: ESC [ ... letra  (colores, posicion, etc.)
    $t = [System.Text.RegularExpressions.Regex]::Replace($text,  '(\x1B|\x9B)\[[0-?]*[ -/]*[@-~]', '')
    # Secuencias OSC: ESC ] ... BEL/ST
    $t = [System.Text.RegularExpressions.Regex]::Replace($t, '\x1B\][^\x07\x1B]*(\x07|\x1B\\)', '')
    # Cualquier otro ESC + un caracter
    $t = [System.Text.RegularExpressions.Regex]::Replace($t, '\x1B.', '')
    # Retorno de carro y otros caracteres de control (excepto tab y salto de linea)
    $t = $t.Replace("`r", "")
    $t = [System.Text.RegularExpressions.Regex]::Replace($t, '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')
    return $t
}

function Save-Devices {
    $obj = @{}
    foreach ($ip in $script:devices.Keys) { $obj[$ip] = $script:devices[$ip] }
    try { $obj | ConvertTo-Json | Set-Content $devicesFile -Encoding UTF8 -ErrorAction Stop } catch {}
}

function Update-DeviceList {
    $script:lvDevices.BeginUpdate()
    $script:lvDevices.Items.Clear()
    foreach ($ip in ($script:devices.Keys | Sort-Object)) {
        $d    = $script:devices[$ip]
        $item = New-Object System.Windows.Forms.ListViewItem($ip)
        $item.SubItems.Add($(if ($d.name) { $d.name } else { "(sin nombre)" })) | Out-Null
        $item.SubItems.Add($d.firstSeen) | Out-Null
        $item.SubItems.Add($d.lastSeen)  | Out-Null
        $script:lvDevices.Items.Add($item) | Out-Null
    }
    $script:lvDevices.EndUpdate()
    $script:lblDevCount.Text = "$($script:devices.Count) dispositivo(s) conocido(s)"
}

function Register-Device($ip) {
    if ([string]::IsNullOrWhiteSpace($ip)) { return }
    if ($ip -match '^(127\.|::1|0\.)') { return }
    $now = (Get-Date).ToString("dd/MM/yyyy HH:mm")
    if (-not $script:devices.ContainsKey($ip)) {
        $script:devices[$ip] = @{ name = ""; firstSeen = $now; lastSeen = $now }
    } else {
        $script:devices[$ip].lastSeen = $now
    }
    Save-Devices
    Update-DeviceList
}

function Show-RenameDialog {
    if ($script:lvDevices.SelectedItems.Count -eq 0) { return }
    $item        = $script:lvDevices.SelectedItems[0]
    $ip          = $item.Text
    $currentName = $script:devices[$ip].name

    $dlg = New-Object System.Windows.Forms.Form
    $dlg.Text            = "Renombrar dispositivo"
    $dlg.Size            = New-Object System.Drawing.Size(370, 160)
    $dlg.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $dlg.StartPosition   = [System.Windows.Forms.FormStartPosition]::CenterParent
    $dlg.BackColor       = $C.BG2
    $dlg.ForeColor       = $C.TEXT
    $dlg.MaximizeBox     = $false
    $dlg.MinimizeBox     = $false

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text      = "Nombre para $ip :"
    $lbl.Location  = New-Object System.Drawing.Point(16, 14)
    $lbl.Size      = New-Object System.Drawing.Size(334, 18)
    $lbl.BackColor = $C.BG2
    $lbl.ForeColor = $C.DIM
    $lbl.Font      = New-Object System.Drawing.Font("Segoe UI", 8)
    $dlg.Controls.Add($lbl)

    $txt = New-Object System.Windows.Forms.TextBox
    $txt.Text        = $currentName
    $txt.Location    = New-Object System.Drawing.Point(16, 36)
    $txt.Width       = 330
    $txt.BackColor   = $C.PANEL
    $txt.ForeColor   = $C.TEXT
    $txt.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $txt.Font        = New-Object System.Drawing.Font("Segoe UI", 10)
    $dlg.Controls.Add($txt)

    $btnOk = New-Object System.Windows.Forms.Button
    $btnOk.Text         = "Guardar"
    $btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $btnOk.Location     = New-Object System.Drawing.Point(174, 78)
    $btnOk.Width        = 84
    $btnOk.BackColor    = $C.BLUE
    $btnOk.ForeColor    = $C.DARK
    $btnOk.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
    $btnOk.FlatAppearance.BorderSize = 0
    $btnOk.Font         = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $dlg.AcceptButton   = $btnOk
    $dlg.Controls.Add($btnOk)

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Text         = "Cancelar"
    $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $btnCancel.Location     = New-Object System.Drawing.Point(266, 78)
    $btnCancel.Width        = 82
    $btnCancel.BackColor    = $C.PANEL
    $btnCancel.ForeColor    = $C.DIM
    $btnCancel.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
    $btnCancel.FlatAppearance.BorderSize  = 1
    $btnCancel.FlatAppearance.BorderColor = $C.BORDER
    $btnCancel.Font         = New-Object System.Drawing.Font("Segoe UI", 9)
    $dlg.CancelButton       = $btnCancel
    $dlg.Controls.Add($btnCancel)

    if ($dlg.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $script:devices[$ip].name = $txt.Text.Trim()
        Save-Devices
        Update-DeviceList
    }
    $dlg.Dispose()
}

function Write-Log($text, $color) {
    $script:rtbLog.SelectionStart  = $script:rtbLog.TextLength
    $script:rtbLog.SelectionLength = 0
    $script:rtbLog.SelectionColor  = $color
    $script:rtbLog.AppendText($text)
    $script:rtbLog.ScrollToCaret()
    $stamp = Get-Date -Format "HH:mm:ss"
    try {
        if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt $logMaxBytes) {
            $oldFile = "$logFile.old"
            Remove-Item $oldFile -Force -ErrorAction SilentlyContinue
            Rename-Item $logFile $oldFile -Force -ErrorAction SilentlyContinue
        }
    } catch {}
    Add-Content -Path $logFile -Value "[$stamp] $text" -Encoding UTF8 -ErrorAction SilentlyContinue
}

function Get-LineColor($line) {
    $lower = $line.ToLower()
    if ($lower -match "error|err:|cannot|failed|exception|eaddrinuse") { return $C.RED    }
    if ($lower -match "listen|puerto|port|ready|started")              { return $C.GREEN  }
    if ($lower -match "warn|warning|aviso")                            { return $C.YELLOW }
    return $C.TEXT
}

function Clear-Port8080 {
    $lines = netstat -ano 2>$null | Select-String ":8080\s"
    $pids  = $lines | ForEach-Object { ($_ -split '\s+')[-1] } |
             Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Sort-Object -Unique
    foreach ($p in $pids) {
        try { Stop-Process -Id ([int]$p) -Force -ErrorAction Stop
              Write-Log "Puerto 8080 liberado (PID $p)`n" $C.YELLOW } catch {}
    }
}

# ---- Verificaciones y bootstrap local para la copia portable ----

function Test-IsAdmin {
    $id        = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-NodeInstalled {
    $nodePath = Get-PreferredNodePath
    if (-not $nodePath) { return $false }
    try { & $nodePath --version *>$null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Get-PortableNodeDir {
    if ($env:MATH_ATTACK_NODE_DIR -and (Test-Path $env:MATH_ATTACK_NODE_DIR)) {
        return Get-Item $env:MATH_ATTACK_NODE_DIR
    }
    $runtimeDir = Join-Path $scriptDir ".runtime"
    if (-not (Test-Path $runtimeDir)) { return $null }
    return Get-ChildItem $runtimeDir -Directory -Filter "node-v*-win-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -First 1
}

function Get-PreferredNodePath {
    if ($env:MATH_ATTACK_NODE_EXE -and (Test-Path $env:MATH_ATTACK_NODE_EXE)) {
        return $env:MATH_ATTACK_NODE_EXE
    }
    $portable = Get-PortableNodeDir
    if ($portable) {
        $nodeExe = Join-Path $portable.FullName "node.exe"
        if (Test-Path $nodeExe) { return $nodeExe }
    }
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Get-PreferredNpmPath {
    if ($env:MATH_ATTACK_NPM_CMD -and (Test-Path $env:MATH_ATTACK_NPM_CMD)) {
        return $env:MATH_ATTACK_NPM_CMD
    }
    $portable = Get-PortableNodeDir
    if ($portable) {
        $npmCmd = Join-Path $portable.FullName "npm.cmd"
        if (Test-Path $npmCmd) { return $npmCmd }
    }
    $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Refresh-ProcessPathFromRegistry {
    try {
        $sysPath = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" -Name Path -ErrorAction Stop).Path
    } catch {
        $sysPath = $null
    }
    try {
        $usrPath = (Get-ItemProperty -Path "HKCU:\Environment" -Name Path -ErrorAction Stop).Path
    } catch {
        $usrPath = $null
    }
    $parts = @()
    if ($sysPath) { $parts += $sysPath }
    if ($usrPath) { $parts += $usrPath }
    if ($parts.Count -gt 0) {
        $env:Path = ($parts -join ";")
    }
}

function Install-NodeIfMissing {
    if (Test-NodeInstalled) { return $true }

    $res = [System.Windows.Forms.MessageBox]::Show(
        "Node.js no esta listo en esta copia.`n`n¿Quieres que el panel descargue una runtime local portable dentro de .runtime ahora?",
        "Instalar Node.js",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question)
    if ($res -ne [System.Windows.Forms.DialogResult]::Yes) { return $false }

    $nodeVersion = "22.13.1"
    $nodeArch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win-arm64" } else { "win-x64" }
    $nodeFile = "node-v$nodeVersion-$nodeArch.zip"
    $nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeFile"

    $tempDir = Join-Path $scriptDir "temp"
    $runtimeDir = Join-Path $scriptDir ".runtime"
    $zipPath = Join-Path $tempDir $nodeFile
    try {
        New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        Write-Log "Descargando runtime local de Node.js v$nodeVersion...`n" $C.BLUE
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $nodeUrl -OutFile $zipPath -UseBasicParsing
        Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeDir -Force
    } catch {
        Write-Log "ERROR al descargar Node.js: $_`n" $C.RED
        [System.Windows.Forms.MessageBox]::Show(
            "No se pudo descargar Node.js.`n`nVerifica tu conexion a internet y vuelve a intentarlo.",
            "Descarga fallida",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        return $false
    }

    $portableDir = Join-Path $runtimeDir ("node-v$nodeVersion-$nodeArch")
    if (-not (Test-Path (Join-Path $portableDir "node.exe"))) {
        Write-Log "ERROR: la runtime local de Node.js no quedo disponible en disco.`n" $C.RED
        return $false
    }

    try {
        $env:MATH_ATTACK_NODE_DIR = $portableDir
        $env:MATH_ATTACK_NODE_EXE = Join-Path $portableDir "node.exe"
        $env:MATH_ATTACK_NPM_CMD = Join-Path $portableDir "npm.cmd"
        $env:Path = "$portableDir;$env:Path"
    } catch {
        Write-Log "ERROR al preparar la runtime local de Node.js: $_`n" $C.RED
        return $false
    } finally {
        try {
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
        } catch {}
    }

    if (-not (Test-NodeInstalled)) {
        Write-Log "La runtime local de Node.js se descargo, pero el panel aun no la detecta.`n" $C.YELLOW
        [System.Windows.Forms.MessageBox]::Show(
            "La runtime local de Node.js se descargo, pero este panel aun no la detecta.",
            "Runtime no detectada",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        return $false
    }

    Write-Log "Runtime local de Node.js lista correctamente.`n" $C.GREEN
    return $true
}

function Sync-IpFile {
    $previousIp = ""
    if (Test-Path $ipFile) {
        try {
            $rawIp = Get-Content -LiteralPath $ipFile -Raw -ErrorAction Stop
            $previousIp = (($rawIp -replace '[^\d\.\r\n]', '').Trim())
            Set-Content -LiteralPath $ipFile -Value $previousIp -Encoding UTF8 -ErrorAction Stop
        } catch {}
    }

    $currentIp = Get-LocalIP
    if ($previousIp -and $previousIp -ne $currentIp) {
        Write-Log "*** ATENCION: la IP cambio (antes $previousIp, ahora $currentIp).`n" $C.YELLOW
        Write-Log "Dile a los alumnos que usen la nueva IP.`n" $C.YELLOW
    }

    try { Set-Content -LiteralPath $ipFile -Value $currentIp -Encoding UTF8 -ErrorAction Stop } catch {}
    return $currentIp
}

# Verifica la regla de Firewall del puerto 8080; si falta y hay permisos, la crea.
# Devuelve $true si la regla existe o se pudo crear; $false si falta y no se pudo.
function Set-Firewall8080Rule {
    try {
        netsh advfirewall firewall show rule name="Math Attack Puerto 8080" | Out-Null
        if ($LASTEXITCODE -eq 0) { return $true }
    } catch {}
    if (-not (Test-IsAdmin)) { return $false }
    try {
        netsh advfirewall firewall add rule name="Math Attack Puerto 8080" dir=in action=allow protocol=TCP localport=8080 | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

# Instala la dependencia 'ws' si falta para esta copia portable.
function Install-WsDependency {
    if (Test-Path (Join-Path $scriptDir "node_modules\ws\package.json")) { return $true }
    Write-Log "Instalando dependencia 'ws' (primera vez)...`n" $C.BLUE
    $stdoutFile = $null
    $stderrFile = $null
    try {
        $npmCmd = Get-PreferredNpmPath
        if (-not $npmCmd) { return $false }
        $tempDir = Join-Path $scriptDir "temp"
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        $stdoutFile = Join-Path $tempDir "ws-install.out.log"
        $stderrFile = Join-Path $tempDir "ws-install.err.log"
        $p = Start-Process -FilePath $npmCmd `
                            -ArgumentList "install","ws@8.21.0","--no-save","--no-package-lock","--omit=dev","--omit=optional","--no-fund","--no-audit" `
                            -WorkingDirectory $scriptDir `
                            -NoNewWindow -Wait -PassThru `
                            -RedirectStandardOutput $stdoutFile `
                            -RedirectStandardError $stderrFile
        if ($p.ExitCode -eq 0 -and (Test-Path (Join-Path $scriptDir "node_modules\ws\package.json"))) {
            Write-Log "Dependencia instalada correctamente.`n" $C.GREEN
            return $true
        }
        Write-Log "ERROR instalando dependencias (codigo $($p.ExitCode)).`n" $C.RED
        if (Test-Path $stderrFile) {
            $stderrText = ((Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue) -replace "`r","").Trim()
            if ($stderrText) {
                Write-Log ("Detalle npm: " + $stderrText + "`n") $C.YELLOW
            }
        }
        return $false
    } catch {
        Write-Log "ERROR instalando dependencias: $_`n" $C.RED
        return $false
    } finally {
        try {
            if (Test-Path $stdoutFile) { Remove-Item $stdoutFile -Force -ErrorAction SilentlyContinue }
            if (Test-Path $stderrFile) { Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue }
        } catch {}
    }
}

# Dependencia de voz local eliminada; el modo voz queda a cargo del navegador.`r`n`r`n# Reabre este mismo panel elevado (para poder configurar el Firewall) y cierra la instancia actual.
function Restart-AsAdmin {
    try {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`"" `
            -Verb RunAs | Out-Null
        return $true
    } catch { return $false }
}

function Update-ConnectionLabel {
    $localIP = Get-LocalIP
    $script:currentURL = "http://$($localIP):8080/"
    if ($script:hotspotActivo) {
        $script:lblIPLabel.Text = "Alumnos se conectan en (WiFi propia):"
    } else {
        $script:lblIPLabel.Text = "Alumnos se conectan en:"
    }
    $script:lblIPValue.Text = $script:currentURL
}

function Show-HotspotDialog {
    $dlg = New-Object System.Windows.Forms.Form
    $dlg.Text            = "Crear red WiFi"
    $dlg.Size            = New-Object System.Drawing.Size(420, 210)
    $dlg.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $dlg.StartPosition   = [System.Windows.Forms.FormStartPosition]::CenterParent
    $dlg.BackColor       = $C.BG2
    $dlg.ForeColor       = $C.TEXT
    $dlg.MaximizeBox     = $false
    $dlg.MinimizeBox     = $false

    $lblSsid = New-Object System.Windows.Forms.Label
    $lblSsid.Text      = "Nombre de la red:"
    $lblSsid.Location  = New-Object System.Drawing.Point(18, 18)
    $lblSsid.Size      = New-Object System.Drawing.Size(360, 20)
    $lblSsid.BackColor = $C.BG2
    $lblSsid.ForeColor = $C.DIM
    $dlg.Controls.Add($lblSsid)

    $txtSsid = New-Object System.Windows.Forms.TextBox
    $txtSsid.Text        = $script:hotspotSSID
    $txtSsid.Location    = New-Object System.Drawing.Point(18, 42)
    $txtSsid.Width       = 368
    $txtSsid.BackColor   = $C.PANEL
    $txtSsid.ForeColor   = $C.TEXT
    $txtSsid.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $dlg.Controls.Add($txtSsid)

    $lblClave = New-Object System.Windows.Forms.Label
    $lblClave.Text      = "Contrasena (minimo 8 caracteres):"
    $lblClave.Location  = New-Object System.Drawing.Point(18, 76)
    $lblClave.Size      = New-Object System.Drawing.Size(360, 20)
    $lblClave.BackColor = $C.BG2
    $lblClave.ForeColor = $C.DIM
    $dlg.Controls.Add($lblClave)

    $txtClave = New-Object System.Windows.Forms.TextBox
    $txtClave.Text        = $script:hotspotClave
    $txtClave.Location    = New-Object System.Drawing.Point(18, 100)
    $txtClave.Width       = 368
    $txtClave.BackColor   = $C.PANEL
    $txtClave.ForeColor   = $C.TEXT
    $txtClave.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $dlg.Controls.Add($txtClave)

    $btnOk = New-Object System.Windows.Forms.Button
    $btnOk.Text         = "Crear"
    $btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $btnOk.Location     = New-Object System.Drawing.Point(222, 138)
    $btnOk.Width        = 78
    $btnOk.BackColor    = $C.BLUE
    $btnOk.ForeColor    = $C.DARK
    $btnOk.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
    $btnOk.FlatAppearance.BorderSize = 0
    $dlg.AcceptButton   = $btnOk
    $dlg.Controls.Add($btnOk)

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Text         = "Cancelar"
    $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $btnCancel.Location     = New-Object System.Drawing.Point(308, 138)
    $btnCancel.Width        = 78
    $btnCancel.BackColor    = $C.PANEL
    $btnCancel.ForeColor    = $C.DIM
    $btnCancel.FlatStyle    = [System.Windows.Forms.FlatStyle]::Flat
    $btnCancel.FlatAppearance.BorderColor = $C.BORDER
    $dlg.CancelButton       = $btnCancel
    $dlg.Controls.Add($btnCancel)

    while ($true) {
        $res = $dlg.ShowDialog($form)
        if ($res -ne [System.Windows.Forms.DialogResult]::OK) {
            $dlg.Dispose()
            return $null
        }

        $ssid = $txtSsid.Text.Trim()
        $clave = $txtClave.Text.Trim()
        if ([string]::IsNullOrWhiteSpace($ssid)) { $ssid = "MathAttack" }
        if ([string]::IsNullOrWhiteSpace($clave)) { $clave = "matematicas" }
        if ($clave.Length -lt 8) {
            [System.Windows.Forms.MessageBox]::Show(
                "La contrasena debe tener al menos 8 caracteres.",
                "Contrasena invalida",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
            continue
        }

        $dlg.Dispose()
        return @{ SSID = $ssid; Clave = $clave }
    }
}

function Set-HotspotButtonState {
    if ($script:hotspotActivo) {
        $script:btnHotspot.Text = "  APAGAR WIFI  "
        $script:btnHotspot.BackColor = $C.YELLOW
        $script:btnHotspot.ForeColor = $C.DARK
    } else {
        $script:btnHotspot.Text = "  CREAR WIFI  "
        $script:btnHotspot.BackColor = $C.BLUE
        $script:btnHotspot.ForeColor = $C.DARK
    }
}

function Start-Hotspot {
    if ($script:hotspotActivo) { return $true }
    if (-not (Test-IsAdmin)) {
        $res = [System.Windows.Forms.MessageBox]::Show(
            "Crear la red WiFi requiere permisos de Administrador.`n`n¿Reabrir el panel como Administrador?",
            "Crear la red WiFi requiere permisos de Administrador.`n`n¿Reabrir el panel como Administrador?",
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Warning)
        if ($res -eq [System.Windows.Forms.DialogResult]::Yes) {
            if (Restart-AsAdmin) { $form.Close() }
        }
        return $false
    }

    $config = Show-HotspotDialog
    if ($null -eq $config) { return $false }

    $script:hotspotSSID = $config.SSID
    $script:hotspotClave = $config.Clave
    Write-Log "Creando red WiFi '$($script:hotspotSSID)'...`n" $C.BLUE

    try {
        $hotspotOutput = @(& powershell -ExecutionPolicy Bypass -NoProfile -File (Join-Path $scriptDir "hotspot.ps1") -Accion iniciar -SSID $script:hotspotSSID -Clave $script:hotspotClave 2>&1)
        foreach ($line in $hotspotOutput) {
            $text = [string]$line
            if (-not [string]::IsNullOrWhiteSpace($text)) {
                Write-Log ($text + "`n") (Get-LineColor $text)
            }
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Log "No se pudo crear la red WiFi.`n" $C.RED
            return $false
        }
        $script:hotspotActivo = $true
        Set-HotspotButtonState
        Update-ConnectionLabel
        Write-Log "Red WiFi creada: $($script:hotspotSSID) / $($script:hotspotClave)`n" $C.GREEN
        return $true
    } catch {
        Write-Log "ERROR al crear la red WiFi: $_`n" $C.RED
        return $false
    }
}

function Stop-Hotspot {
    if (-not $script:hotspotActivo) { return }
    if ($null -ne $global:serverProcess -and -not $global:serverProcess.HasExited) {
        Write-Log "Aviso: al apagar la red WiFi, los alumnos se desconectaran del servidor hasta entrar por otra red/IP.`n" $C.YELLOW
    }
    try {
        $hotspotOutput = @(& powershell -ExecutionPolicy Bypass -NoProfile -File (Join-Path $scriptDir "hotspot.ps1") -Accion detener 2>&1)
        foreach ($line in $hotspotOutput) {
            $text = [string]$line
            if (-not [string]::IsNullOrWhiteSpace($text)) {
                Write-Log ($text + "`n") (Get-LineColor $text)
            }
        }
    } catch {}
    $script:hotspotActivo = $false
    Set-HotspotButtonState
    Update-ConnectionLabel
    Write-Log "Red WiFi apagada.`n" $C.YELLOW
}

function Start-Server {
    if ($null -ne $global:serverProcess -and -not $global:serverProcess.HasExited) { return }

    Write-Log ("-" * 54 + "`n") $C.DIM

    # ── Node.js: si falta, el panel no puede instalarlo (eso lo hace Iniciar-Servidor.bat) ──
    if (-not (Test-NodeInstalled)) {
        Write-Log "Node.js no esta listo en esta copia.`n" $C.YELLOW
        if (-not (Install-NodeIfMissing)) {
            Write-Log "Arranque cancelado: hace falta completar la preparacion de Node.js.`n" $C.YELLOW
            return
        }
    }

    # ── Firewall: si falta la regla del puerto 8080, los alumnos no podran conectarse ──
    if (-not (Set-Firewall8080Rule)) {
        if (-not (Test-IsAdmin)) {
            $res = [System.Windows.Forms.MessageBox]::Show(
                "El Firewall no tiene abierto el puerto 8080 y este panel no se esta ejecutando como Administrador para configurarlo.`n`nSin esto, los alumnos podrian no poder conectarse desde otras PCs/celulares.`n`n¿Reabrir el panel como Administrador para configurarlo automaticamente?",
                "El Firewall no tiene abierto el puerto 8080 y este panel no se esta ejecutando como Administrador para configurarlo.`n`nSin esto, los alumnos podrian no poder conectarse desde otras PCs/celulares.`n`n¿Reabrir el panel como Administrador para configurarlo automaticamente?",
                [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning)
            if ($res -eq [System.Windows.Forms.DialogResult]::Yes) {
                if (Restart-AsAdmin) { $form.Close(); return }
                Write-Log "No se pudo reabrir como Administrador.`n" $C.RED
            }
            Write-Log "Continuando sin configurar el Firewall (los alumnos podrian no conectarse).`n" $C.YELLOW
        } else {
            Write-Log "AVISO: no se pudo configurar el Firewall automaticamente.`n" $C.YELLOW
        }
    } else {
        Write-Log "Firewall: puerto 8080 OK.`n" $C.DIM
    }

    # ── Dependencia 'ws': necesaria para que server.js arranque ──
    if (-not (Install-WsDependency)) {
        Write-Log "El servidor probablemente no arrancara sin la dependencia 'ws'.`n" $C.RED
        Write-Log "Arranque cancelado para evitar un ciclo de reinicios innecesario.`n" $C.YELLOW
        return
    }

    Write-Log "Liberando puerto 8080...`n" $C.DIM
    Clear-Port8080
    Write-Log "Iniciando servidor...`n" $C.BLUE

    $nodePath = Get-PreferredNodePath
    if (-not $nodePath) {
        Write-Log "ERROR: no se encontro un ejecutable de Node utilizable.`n" $C.RED
        return
    }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName               = $nodePath
    $psi.Arguments              = "server.js"
    $psi.WorkingDirectory       = $scriptDir
    $psi.UseShellExecute        = $false
    $psi.CreateNoWindow         = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding  = [System.Text.Encoding]::UTF8

    try {
        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $psi
        $proc.Start() | Out-Null

        $global:serverProcess       = $proc
        $script:stdoutReader        = $proc.StandardOutput
        $script:stderrReader        = $proc.StandardError
        $script:stdoutTask          = $script:stdoutReader.ReadLineAsync()
        $script:stderrTask          = $script:stderrReader.ReadLineAsync()
        $script:serverStartTime     = [datetime]::Now
        $script:intentionalStop     = $false

        $script:btnStart.Enabled    = $false
        $script:btnStop.Enabled     = $true
        $script:pnlStatus.BackColor = $C.GREEN
        $script:lblStatusDot.Text   = "  ACTIVO  "
        $script:lblUptime.Text      = "En vivo: 00:00:00"
        $script:lblUptime.Visible   = $true

        Write-Log "Servidor iniciado (PID $($proc.Id))`n" $C.GREEN

    } catch {
        Write-Log "ERROR al iniciar: $_`n" $C.RED
        Write-Log "Asegurate de que la runtime local y las dependencias del servidor queden listas en esta copia.`n" $C.YELLOW
    }
}

function Set-ServerStopped {
    if ($null -eq $global:serverProcess) { return }

    $wasIntentional             = $script:intentionalStop
    # Cuanto duro corriendo antes de morir — si fue casi instantaneo (error de sintaxis,
    # puerto ocupado, etc.) el auto-reinicio de 3s entraria en un bucle rapido consumiendo CPU
    $ranSeconds                 = if ($script:serverStartTime) { ([datetime]::Now - $script:serverStartTime).TotalSeconds } else { 999 }
    $global:serverProcess       = $null
    $script:stdoutReader        = $null
    $script:stderrReader        = $null
    $script:stdoutTask          = $null
    $script:stderrTask          = $null
    $script:serverStartTime     = $null
    $script:btnStart.Enabled    = $true
    $script:btnStop.Enabled     = $false
    $script:pnlStatus.BackColor = $C.RED
    $script:lblStatusDot.Text   = "  DETENIDO  "
    $script:lblUptime.Visible   = $false

    Write-Log "`nServidor detenido.`n" $C.YELLOW

    # Liberar el puerto 8080 por si quedo alguna conexion colgada (igual que Iniciar-Servidor.bat)
    Write-Log "Liberando puerto 8080...`n" $C.DIM
    Clear-Port8080

    # Confirmar que las estadisticas quedaron guardadas
    if (Test-Path (Join-Path $scriptDir "ranking.json")) {
        Write-Log "[OK] Estadisticas guardadas correctamente en ranking.json`n" $C.GREEN
    } else {
        Write-Log "[AVISO] No se encontro ranking.json - no habia estadisticas guardadas`n" $C.YELLOW
    }

    # Limpiar carpeta temporal de instalacion de Node.js si quedo de una corrida anterior
    $tempDir = Join-Path $scriptDir "temp"
    if (Test-Path $tempDir) {
        try { Remove-Item $tempDir -Recurse -Force -ErrorAction Stop; Write-Log "Carpeta temporal limpiada.`n" $C.DIM } catch {}
    }

    Write-Log ("-" * 54 + "`n") $C.DIM

    # Auto-reinicio si fue un crash (no un stop manual) y el toggle esta activo
    if (-not $wasIntentional -and $script:chkAutoRestart.Checked) {
        if ($ranSeconds -lt 10) {
            # Bucle de crash: murio casi de inmediato — esperar mas para no reintentar sin parar
            Write-Log "El servidor se cerro casi de inmediato (revisa errores arriba). Reintentando en 15s...`n" $C.RED
            $script:restartCountdown = 15
        } else {
            Write-Log "Auto-reinicio en 3 segundos...`n" $C.BLUE
            $script:restartCountdown = 3
        }
        $script:restartTimer.Start()
    }
}

# ---- Helpers de botones -----------------------------------------
function New-ActionButton($text, $fg, $bg) {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text      = $text
    $btn.ForeColor = $fg
    $btn.BackColor = $bg
    $btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btn.FlatAppearance.BorderSize         = 0
    $btn.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(
        [Math]::Min($bg.R + 30, 255), [Math]::Min($bg.G + 30, 255), [Math]::Min($bg.B + 30, 255))
    $btn.FlatAppearance.MouseDownBackColor = $C.HOVER
    $btn.Font    = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $btn.Height  = 36
    $btn.AutoSize = $true
    $btn.Cursor  = [System.Windows.Forms.Cursors]::Hand
    $btn.Margin  = New-Object System.Windows.Forms.Padding(0, 0, 8, 0)
    $btn.Padding = New-Object System.Windows.Forms.Padding(14, 0, 14, 0)
    return $btn
}

function New-LinkButton($text) {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text      = $text
    $btn.ForeColor = $C.BLUE
    $btn.BackColor = $C.PANEL
    $btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btn.FlatAppearance.BorderSize         = 1
    $btn.FlatAppearance.BorderColor        = $C.BORDER
    $btn.FlatAppearance.MouseOverBackColor = $C.HOVER
    $btn.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $btn.Height   = 30
    $btn.AutoSize = $true
    $btn.Cursor   = [System.Windows.Forms.Cursors]::Hand
    $btn.Margin   = New-Object System.Windows.Forms.Padding(0, 0, 6, 0)
    $btn.Padding  = New-Object System.Windows.Forms.Padding(10, 0, 10, 0)
    return $btn
}

# =================================================================
# FORMULARIO
# =================================================================
$form = New-Object System.Windows.Forms.Form
$form.Text          = "Math Attack - Panel de Control"
$form.Size          = New-Object System.Drawing.Size(1080, 780)
$form.MinimumSize   = New-Object System.Drawing.Size(960, 680)
$form.BackColor     = $C.BG
$form.ForeColor     = $C.TEXT
$form.Font          = New-Object System.Drawing.Font("Segoe UI", 10)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen

# ================================================================
# CABECERA
# ================================================================
$pnlHeader           = New-Object System.Windows.Forms.Panel
$pnlHeader.Dock      = [System.Windows.Forms.DockStyle]::Top
$pnlHeader.Height    = 64
$pnlHeader.BackColor = $C.BG2

$lblTitle           = New-Object System.Windows.Forms.Label
$lblTitle.Text      = "Math Attack"
$lblTitle.Font      = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = $C.BLUE
$lblTitle.BackColor = $C.BG2
$lblTitle.AutoSize  = $true
$lblTitle.Location  = New-Object System.Drawing.Point(20, 14)
$pnlHeader.Controls.Add($lblTitle)

$lblSub           = New-Object System.Windows.Forms.Label
$lblSub.Text      = "Panel de Control"
$lblSub.Font      = New-Object System.Drawing.Font("Segoe UI", 9)
$lblSub.ForeColor = $C.DIM
$lblSub.BackColor = $C.BG2
$lblSub.AutoSize  = $true
$lblSub.Location  = New-Object System.Drawing.Point(22, 42)
$pnlHeader.Controls.Add($lblSub)

# Pastilla de estado
$script:pnlStatus           = New-Object System.Windows.Forms.Panel
$script:pnlStatus.Height    = 28
$script:pnlStatus.Width     = 114
$script:pnlStatus.BackColor = $C.RED
$script:pnlStatus.Anchor    = [System.Windows.Forms.AnchorStyles]::Right -bor [System.Windows.Forms.AnchorStyles]::Top

$script:lblStatusDot           = New-Object System.Windows.Forms.Label
$script:lblStatusDot.Text      = "  DETENIDO  "
$script:lblStatusDot.Font      = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$script:lblStatusDot.ForeColor = $C.DARK
$script:lblStatusDot.BackColor = [System.Drawing.Color]::Transparent
$script:lblStatusDot.AutoSize  = $true
$script:lblStatusDot.Dock      = [System.Windows.Forms.DockStyle]::Fill
$script:lblStatusDot.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$script:pnlStatus.Controls.Add($script:lblStatusDot)
$pnlHeader.Controls.Add($script:pnlStatus)

$pnlHeader.add_Resize({
    $script:pnlStatus.Location = New-Object System.Drawing.Point(
        ($pnlHeader.Width - $script:pnlStatus.Width - 20), 18)
})

# ================================================================
# BARRA DE IP (con boton copiar y temporizador)
# ================================================================
$pnlIP           = New-Object System.Windows.Forms.Panel
$pnlIP.Dock      = [System.Windows.Forms.DockStyle]::Top
$pnlIP.Height    = 60
$pnlIP.BackColor = $C.CARD

$localIP = Get-LocalIP
$script:currentURL = "http://$($localIP):8080/"

$script:lblIPLabel           = New-Object System.Windows.Forms.Label
$script:lblIPLabel.Text      = "Alumnos se conectan en:"
$script:lblIPLabel.Font      = New-Object System.Drawing.Font("Segoe UI", 8)
$script:lblIPLabel.ForeColor = $C.DIM
$script:lblIPLabel.BackColor = $C.CARD
$script:lblIPLabel.AutoSize  = $true
$script:lblIPLabel.Location  = New-Object System.Drawing.Point(20, 6)
$pnlIP.Controls.Add($script:lblIPLabel)

$script:lblIPValue           = New-Object System.Windows.Forms.Label
$script:lblIPValue.Text      = $script:currentURL
$script:lblIPValue.Font      = New-Object System.Drawing.Font("Consolas", 16, [System.Drawing.FontStyle]::Bold)
$script:lblIPValue.ForeColor = $C.GREEN
$script:lblIPValue.BackColor = $C.CARD
$script:lblIPValue.AutoSize  = $true
$script:lblIPValue.Location  = New-Object System.Drawing.Point(18, 22)
$pnlIP.Controls.Add($script:lblIPValue)

# Boton Copiar IP
$btnCopiar           = New-Object System.Windows.Forms.Button
$btnCopiar.Text      = "Copiar"
$btnCopiar.Font      = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$btnCopiar.ForeColor = $C.DARK
$btnCopiar.BackColor = $C.BLUE
$btnCopiar.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnCopiar.FlatAppearance.BorderSize = 0
$btnCopiar.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(140, 190, 255)
$btnCopiar.Size      = New-Object System.Drawing.Size(60, 22)
$btnCopiar.Cursor    = [System.Windows.Forms.Cursors]::Hand
$btnCopiar.Anchor    = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$pnlIP.Controls.Add($btnCopiar)

# Temporizador de actividad (derecha, alineado)
$script:lblUptime           = New-Object System.Windows.Forms.Label
$script:lblUptime.Text      = "En vivo: 00:00:00"
$script:lblUptime.Font      = New-Object System.Drawing.Font("Consolas", 11, [System.Drawing.FontStyle]::Bold)
$script:lblUptime.ForeColor = $C.GREEN
$script:lblUptime.BackColor = $C.CARD
$script:lblUptime.AutoSize  = $true
$script:lblUptime.Visible   = $false
$script:lblUptime.Anchor    = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$pnlIP.Controls.Add($script:lblUptime)

# Posicionar boton copiar y uptime al resize
$pnlIP.add_Resize({
    $btnCopiar.Location        = New-Object System.Drawing.Point(($pnlIP.Width - 80), 26)
    $script:lblUptime.Location = New-Object System.Drawing.Point(($pnlIP.Width - $script:lblUptime.Width - 80), 26)
})

# ================================================================
# BARRA DE ACCIONES
# ================================================================
$pnlActions           = New-Object System.Windows.Forms.Panel
$pnlActions.Dock      = [System.Windows.Forms.DockStyle]::Top
$pnlActions.Height    = 96
$pnlActions.BackColor = $C.BG2
$pnlActions.Padding   = New-Object System.Windows.Forms.Padding(16, 11, 16, 11)

$flowActions              = New-Object System.Windows.Forms.FlowLayoutPanel
$flowActions.Dock         = [System.Windows.Forms.DockStyle]::Fill
$flowActions.BackColor    = $C.BG2
$flowActions.WrapContents = $true
$flowActions.AutoScroll   = $true
$pnlActions.Controls.Add($flowActions)

$script:btnStart        = New-ActionButton "  INICIAR SERVIDOR  " $C.DARK $C.GREEN
$script:btnStop         = New-ActionButton "  DETENER  "          $C.DARK $C.RED
$script:btnStop.Enabled = $false
$script:btnHotspot      = New-ActionButton "  CREAR WIFI  "       $C.DARK $C.BLUE

$sep           = New-Object System.Windows.Forms.Label
$sep.Text      = "|"
$sep.ForeColor = $C.BORDER
$sep.BackColor = $C.BG2
$sep.AutoSize  = $true
$sep.Font      = New-Object System.Drawing.Font("Segoe UI", 14)
$sep.Margin    = New-Object System.Windows.Forms.Padding(4, 6, 4, 0)

$btnJuego   = New-LinkButton "Juego"
$btnMaestro = New-LinkButton "Maestro"
$btnRanking = New-LinkButton "Ranking"

$sep2           = New-Object System.Windows.Forms.Label
$sep2.Text      = "|"
$sep2.ForeColor = $C.BORDER
$sep2.BackColor = $C.BG2
$sep2.AutoSize  = $true
$sep2.Font      = New-Object System.Drawing.Font("Segoe UI", 14)
$sep2.Margin    = New-Object System.Windows.Forms.Padding(4, 6, 8, 0)

# Checkbox de auto-reinicio
$script:chkAutoRestart           = New-Object System.Windows.Forms.CheckBox
$script:chkAutoRestart.Text      = "Auto-reinicio"
$script:chkAutoRestart.Font      = New-Object System.Drawing.Font("Segoe UI", 9)
$script:chkAutoRestart.ForeColor = $C.DIM
$script:chkAutoRestart.BackColor = $C.BG2
$script:chkAutoRestart.Checked   = $true
$script:chkAutoRestart.AutoSize  = $true
$script:chkAutoRestart.Margin    = New-Object System.Windows.Forms.Padding(0, 8, 12, 0)
$script:chkAutoRestart.Cursor    = [System.Windows.Forms.Cursors]::Hand

$btnLimpiar           = New-LinkButton "Limpiar log"
$btnLimpiar.ForeColor = $C.DIM
$btnLimpiar.Margin    = New-Object System.Windows.Forms.Padding(0, 0, 0, 0)

foreach ($ctrl in @($script:btnStart, $script:btnStop, $script:btnHotspot, $sep, $btnJuego, $btnMaestro, $btnRanking, $sep2, $script:chkAutoRestart, $btnLimpiar)) {
    $flowActions.Controls.Add($ctrl)
}

# ================================================================
# CONTENEDOR PRINCIPAL CON PESTAÑAS
# ================================================================
$pnlMain           = New-Object System.Windows.Forms.Panel
$pnlMain.Dock      = [System.Windows.Forms.DockStyle]::Fill
$pnlMain.BackColor = $C.BG

# ---- Barra de pestanas ----------------------------------------
$pnlTabBar           = New-Object System.Windows.Forms.Panel
$pnlTabBar.Dock      = [System.Windows.Forms.DockStyle]::Top
$pnlTabBar.Height    = 38
$pnlTabBar.BackColor = $C.BG2
$pnlTabBar.Padding   = New-Object System.Windows.Forms.Padding(14, 5, 14, 0)

$flowTabs              = New-Object System.Windows.Forms.FlowLayoutPanel
$flowTabs.Dock         = [System.Windows.Forms.DockStyle]::Fill
$flowTabs.BackColor    = $C.BG2
$flowTabs.WrapContents = $false

function New-TabButton($text) {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text      = $text
    $btn.Font      = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $btn.ForeColor = $C.DIM
    $btn.BackColor = $C.BG2
    $btn.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btn.FlatAppearance.BorderSize         = 0
    $btn.FlatAppearance.MouseOverBackColor = $C.BG2
    $btn.Height   = 30
    $btn.AutoSize = $true
    $btn.Cursor   = [System.Windows.Forms.Cursors]::Hand
    $btn.Margin   = New-Object System.Windows.Forms.Padding(0, 0, 6, 0)
    $btn.Padding  = New-Object System.Windows.Forms.Padding(12, 0, 12, 0)
    return $btn
}

$script:btnTabLog     = New-TabButton "Registro"
$script:btnTabDevices = New-TabButton "Dispositivos"

$flowTabs.Controls.Add($script:btnTabLog)
$flowTabs.Controls.Add($script:btnTabDevices)
$pnlTabBar.Controls.Add($flowTabs)

# ---- Panel de LOG -----------------------------------------------
$script:pnlLog           = New-Object System.Windows.Forms.Panel
$script:pnlLog.Dock      = [System.Windows.Forms.DockStyle]::Fill
$script:pnlLog.BackColor = $C.BG
$script:pnlLog.Padding   = New-Object System.Windows.Forms.Padding(16, 8, 16, 12)

$lblLogTitle           = New-Object System.Windows.Forms.Label
$lblLogTitle.Text      = "REGISTRO DEL SERVIDOR"
$lblLogTitle.Dock      = [System.Windows.Forms.DockStyle]::Top
$lblLogTitle.Height    = 22
$lblLogTitle.ForeColor = $C.DIM
$lblLogTitle.BackColor = $C.BG
$lblLogTitle.Font      = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Bold)
$script:pnlLog.Controls.Add($lblLogTitle)

$script:rtbLog             = New-Object System.Windows.Forms.RichTextBox
$script:rtbLog.Dock        = [System.Windows.Forms.DockStyle]::Fill
$script:rtbLog.BackColor   = $C.BG2
$script:rtbLog.ForeColor   = $C.TEXT
$script:rtbLog.Font        = New-Object System.Drawing.Font("Segoe UI Emoji", 9)
$script:rtbLog.ReadOnly    = $true
$script:rtbLog.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$script:rtbLog.WordWrap    = $true
$script:rtbLog.ScrollBars  = [System.Windows.Forms.RichTextBoxScrollBars]::Vertical
$script:pnlLog.Controls.Add($script:rtbLog)

# ---- Panel de DISPOSITIVOS ---------------------------------------
$script:pnlDevices           = New-Object System.Windows.Forms.Panel
$script:pnlDevices.Dock      = [System.Windows.Forms.DockStyle]::None
$script:pnlDevices.BackColor = $C.BG
$script:pnlDevices.Padding   = New-Object System.Windows.Forms.Padding(16, 8, 16, 12)
$script:pnlDevices.Visible   = $false

$lblDevTitle           = New-Object System.Windows.Forms.Label
$lblDevTitle.Text      = "DISPOSITIVOS CONECTADOS"
$lblDevTitle.Dock      = [System.Windows.Forms.DockStyle]::Top
$lblDevTitle.Height    = 22
$lblDevTitle.ForeColor = $C.DIM
$lblDevTitle.BackColor = $C.BG
$lblDevTitle.Font      = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Bold)
$script:pnlDevices.Controls.Add($lblDevTitle)

# Barra inferior de acciones
$pnlDevActions           = New-Object System.Windows.Forms.Panel
$pnlDevActions.Dock      = [System.Windows.Forms.DockStyle]::Bottom
$pnlDevActions.Height    = 46
$pnlDevActions.BackColor = $C.BG

$flowDevAct              = New-Object System.Windows.Forms.FlowLayoutPanel
$flowDevAct.Dock         = [System.Windows.Forms.DockStyle]::Fill
$flowDevAct.BackColor    = $C.BG
$flowDevAct.WrapContents = $false
$flowDevAct.Padding      = New-Object System.Windows.Forms.Padding(0, 8, 0, 0)

$script:lblDevCount           = New-Object System.Windows.Forms.Label
$script:lblDevCount.Text      = "0 dispositivo(s) conocido(s)"
$script:lblDevCount.Font      = New-Object System.Drawing.Font("Segoe UI", 9)
$script:lblDevCount.ForeColor = $C.DIM
$script:lblDevCount.BackColor = $C.BG
$script:lblDevCount.AutoSize  = $true
$script:lblDevCount.Margin    = New-Object System.Windows.Forms.Padding(0, 2, 16, 0)

$script:btnRename           = New-LinkButton "Renombrar"
$script:btnRename.ForeColor = $C.YELLOW
$script:btnForget           = New-LinkButton "Olvidar"
$script:btnForget.ForeColor = $C.RED

$flowDevAct.Controls.Add($script:lblDevCount)
$flowDevAct.Controls.Add($script:btnRename)
$flowDevAct.Controls.Add($script:btnForget)
$pnlDevActions.Controls.Add($flowDevAct)
$script:pnlDevices.Controls.Add($pnlDevActions)

# ListView de dispositivos
$script:lvDevices                  = New-Object System.Windows.Forms.ListView
$script:lvDevices.Dock             = [System.Windows.Forms.DockStyle]::Fill
$script:lvDevices.View             = [System.Windows.Forms.View]::Details
$script:lvDevices.FullRowSelect    = $true
$script:lvDevices.GridLines        = $false
$script:lvDevices.BackColor        = $C.BG2
$script:lvDevices.ForeColor        = $C.TEXT
$script:lvDevices.BorderStyle      = [System.Windows.Forms.BorderStyle]::FixedSingle
$script:lvDevices.Font             = New-Object System.Drawing.Font("Consolas", 9)
$script:lvDevices.HeaderStyle      = [System.Windows.Forms.ColumnHeaderStyle]::Nonclickable
$script:lvDevices.MultiSelect      = $false

$script:lvDevices.Columns.Add("Direccion IP",       150) | Out-Null
$script:lvDevices.Columns.Add("Nombre asignado",    190) | Out-Null
$script:lvDevices.Columns.Add("Primera conexion",   140) | Out-Null
$script:lvDevices.Columns.Add("Ultima conexion",    140) | Out-Null

$script:pnlDevices.Controls.Add($script:lvDevices)

# Agregar al contenedor principal (Fill primero, luego Top de abajo a arriba)
$pnlMain.Controls.Add($script:pnlLog)
$pnlMain.Controls.Add($script:pnlDevices)
$pnlMain.Controls.Add($pnlTabBar)

# Orden Dock: Fill primero, luego Top de abajo a arriba
$form.Controls.Add($pnlMain)
$form.Controls.Add($pnlActions)
$form.Controls.Add($pnlIP)
$form.Controls.Add($pnlHeader)

# ================================================================
# TIMER PRINCIPAL: output del proceso + uptime (hilo UI)
# ================================================================
$script:logTimer          = New-Object System.Windows.Forms.Timer
$script:logTimer.Interval = 80
$script:logTimer.add_Tick({
    # Actualizar temporizador de actividad cada ~1s
    if ($null -ne $script:serverStartTime) {
        $elapsed = [datetime]::Now - $script:serverStartTime
        $script:lblUptime.Text = "En vivo: {0:hh\:mm\:ss}" -f $elapsed
    }

    # Leer stdout
    if ($null -ne $script:stdoutTask -and $script:stdoutTask.IsCompleted) {
        try {
            $raw = $script:stdoutTask.Result
            if ($null -ne $raw) {
                Write-Log ((Remove-AnsiCodes $raw) + "`n") (Get-LineColor $raw)
                # Detectar IPs de dispositivos conectados
                $ipHits = [System.Text.RegularExpressions.Regex]::Matches($raw, '\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b')
                foreach ($m in $ipHits) { Register-Device $m.Value }
                $script:stdoutTask = $script:stdoutReader.ReadLineAsync()
            } else {
                $script:stdoutTask   = $null
                $script:stdoutReader = $null
                Set-ServerStopped
            }
        } catch {
            $script:stdoutTask   = $null
            $script:stdoutReader = $null
            Set-ServerStopped
        }
    }

    # Leer stderr
    if ($null -ne $script:stderrTask -and $script:stderrTask.IsCompleted) {
        try {
            $raw = $script:stderrTask.Result
            if ($null -ne $raw) {
                Write-Log ((Remove-AnsiCodes $raw) + "`n") $C.RED
                $script:stderrTask = $script:stderrReader.ReadLineAsync()
            } else {
                $script:stderrTask   = $null
                $script:stderrReader = $null
            }
        } catch {
            $script:stderrTask   = $null
            $script:stderrReader = $null
        }
    }
})
$script:logTimer.Start()

# ================================================================
# TIMER DE AUTO-REINICIO (cuenta regresiva de 3s)
# ================================================================
$script:restartCountdown = 3
$script:restartTimer     = New-Object System.Windows.Forms.Timer
$script:restartTimer.Interval = 1000
$script:restartTimer.add_Tick({
    $script:restartCountdown--
    if ($script:restartCountdown -le 0) {
        $script:restartTimer.Stop()
        Write-Log "Reiniciando servidor...`n" $C.BLUE
        Start-Server
    } else {
        Write-Log "Reiniciando en $($script:restartCountdown)s...`n" $C.DIM
    }
})

# ================================================================
# EVENTOS DE BOTONES
# ================================================================
$script:btnStart.add_Click({
    if (-not (Test-NodeInstalled)) {
        Write-Log "Node.js no esta instalado en esta PC.`n" $C.YELLOW
        if (-not (Install-NodeIfMissing)) {
            Write-Log "Arranque cancelado: hace falta completar la instalacion de Node.js.`n" $C.YELLOW
            return
        }
    }
    Start-Server
})

$script:btnStop.add_Click({
    if ($null -ne $global:serverProcess -and -not $global:serverProcess.HasExited) {
        $script:intentionalStop = $true
        $script:restartTimer.Stop()
        Write-Log "Deteniendo servidor...`n" $C.YELLOW
        try { $global:serverProcess.Kill() } catch {}
    }
})

$script:btnHotspot.add_Click({
    if ($script:hotspotActivo) {
        Stop-Hotspot
    } else {
        Start-Hotspot | Out-Null
    }
})

$btnCopiar.add_Click({
    try {
        [System.Windows.Forms.Clipboard]::SetText($script:currentURL)
        $btnCopiar.Text      = "Copiado"
        $btnCopiar.BackColor = $C.GREEN
        # Restaurar el boton despues de 1.5s
        $script:copyTimer = New-Object System.Windows.Forms.Timer
        $script:copyTimer.Interval = 1500
        $script:copyTimer.add_Tick({
            $btnCopiar.Text      = "Copiar"
            $btnCopiar.BackColor = $C.BLUE
            $script:copyTimer.Stop()
        })
        $script:copyTimer.Start()
    } catch {}
})

$btnJuego.add_Click({   [System.Diagnostics.Process]::Start("http://localhost:8080/")        | Out-Null })
$btnMaestro.add_Click({ [System.Diagnostics.Process]::Start("http://localhost:8080/maestro") | Out-Null })
$btnRanking.add_Click({ [System.Diagnostics.Process]::Start("http://localhost:8080/ranking") | Out-Null })
$btnLimpiar.add_Click({ $script:rtbLog.Clear() })

# ---- Cambio de pestañas -----------------------------------------
function Set-ActiveTab($tab) {
    if ($tab -eq 'log') {
        $script:pnlDevices.Visible = $false
        $script:pnlDevices.Dock    = [System.Windows.Forms.DockStyle]::None
        $script:pnlLog.Dock        = [System.Windows.Forms.DockStyle]::Fill
        $script:pnlLog.Visible     = $true
        $script:btnTabLog.ForeColor     = $C.BLUE
        $script:btnTabDevices.ForeColor = $C.DIM
    } else {
        $script:pnlLog.Visible     = $false
        $script:pnlLog.Dock        = [System.Windows.Forms.DockStyle]::None
        $script:pnlDevices.Dock    = [System.Windows.Forms.DockStyle]::Fill
        $script:pnlDevices.Visible = $true
        $script:btnTabDevices.ForeColor = $C.BLUE
        $script:btnTabLog.ForeColor     = $C.DIM
        Update-DeviceList
    }
}

$script:btnTabLog.add_Click({     Set-ActiveTab 'log'     })
$script:btnTabDevices.add_Click({ Set-ActiveTab 'devices' })

# ---- Acciones sobre dispositivos --------------------------------
$script:lvDevices.add_DoubleClick({ Show-RenameDialog })
$script:btnRename.add_Click({ Show-RenameDialog })

$script:btnForget.add_Click({
    if ($script:lvDevices.SelectedItems.Count -eq 0) { return }
    $ip  = $script:lvDevices.SelectedItems[0].Text
    $res = [System.Windows.Forms.MessageBox]::Show(
        "¿Olvidar el dispositivo $ip?`nSe eliminara de la lista de dispositivos conocidos.",
        "Confirmar",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question)
    if ($res -eq [System.Windows.Forms.DialogResult]::Yes) {
        $script:devices.Remove($ip)
        Save-Devices
        Update-DeviceList
    }
})

# ================================================================
# INICIO Y CIERRE
# ================================================================
$localIP = Sync-IpFile
Write-Log "IP del servidor: $localIP`n" $C.BLUE
Set-HotspotButtonState
Update-ConnectionLabel

if (-not (Test-NodeInstalled)) {
    Write-Log "AVISO: Node.js no esta instalado en esta PC; el panel puede instalarlo al presionar Iniciar servidor.`n" $C.YELLOW
}

Write-Log "Presiona INICIAR SERVIDOR para comenzar.`n`n" $C.DIM
Update-DeviceList
# Pestaña activa inicial: Registro
$script:btnTabLog.ForeColor = $C.BLUE

$form.add_FormClosing({
    $script:restartTimer.Stop()
    if ($null -ne $global:serverProcess -and -not $global:serverProcess.HasExited) {
        $res = [System.Windows.Forms.MessageBox]::Show(
            "El servidor sigue corriendo.`nDetenerlo y cerrar el panel?",
            "Cerrar panel",
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Warning)
        if ($res -eq [System.Windows.Forms.DialogResult]::Yes) {
            $script:intentionalStop = $true
            try { $global:serverProcess.Kill() } catch {}
        } else {
            $_.Cancel = $true
            return
        }
    }
    $script:logTimer.Stop()
    if ($script:hotspotActivo) {
        Stop-Hotspot
    }
})

[System.Windows.Forms.Application]::Run($form)

