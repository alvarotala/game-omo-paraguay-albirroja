param(
  [switch]$NoKiosk
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

function Get-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Default = ""
  )

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }
  $value = $value.Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Test-Enabled {
  param([string]$Value)
  return $Value.ToLowerInvariant() -in @("1", "true", "yes", "on")
}

function Quote-Arg {
  param([string]$Value)

  if ($Value -match '[\s"]') {
    return '"' + ($Value -replace '"', '\"') + '"'
  }
  return $Value
}

function Join-Args {
  param([string[]]$ArgsList)
  return ($ArgsList | ForEach-Object { Quote-Arg $_ }) -join " "
}

function Write-LogTail {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Lines = 80
  )

  if (-not (Test-Path $Path)) {
    Write-Host "Log no encontrado: $Path"
    return
  }

  Write-Host ""
  Write-Host "---- $Path ----"
  Get-Content -Path $Path -Tail $Lines | ForEach-Object { Write-Host $_ }
}

function Wait-HttpServer {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)]$Process,
    [Parameter(Mandatory = $true)][string]$StdoutLog,
    [Parameter(Mandatory = $true)][string]$StderrLog,
    [int]$TimeoutSeconds = 12
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) {
      Write-Host "El servidor HTTP termino antes de responder."
      Write-LogTail $StdoutLog
      Write-LogTail $StderrLog
      throw "No se pudo iniciar el servidor local. Revisa los logs anteriores."
    }

    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  Write-Host "El servidor HTTP no respondio en $TimeoutSeconds segundos."
  Write-Host "Puede ser que el puerto este ocupado, Python no haya iniciado correctamente o un antivirus/firewall este bloqueando el proceso local."
  Write-LogTail $StdoutLog
  Write-LogTail $StderrLog
  throw "Chrome no se abrira porque el servidor local no esta listo."
}

function Wait-TcpPort {
  param(
    [Parameter(Mandatory = $true)][string]$HostName,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)]$Process,
    [Parameter(Mandatory = $true)][string]$StdoutLog,
    [Parameter(Mandatory = $true)][string]$StderrLog,
    [int]$TimeoutSeconds = 12
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) {
      Write-Host "El bridge Arduino termino antes de responder."
      Write-LogTail $StdoutLog
      Write-LogTail $StderrLog
      throw "No se pudo iniciar el bridge Arduino. Revisa los logs anteriores."
    }

    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
      if ($asyncResult.AsyncWaitHandle.WaitOne(250)) {
        $client.EndConnect($asyncResult)
        return
      }
    } catch {
      Start-Sleep -Milliseconds 250
    } finally {
      $client.Close()
    }
  }

  Write-Host "El bridge Arduino no respondio en $TimeoutSeconds segundos."
  Write-LogTail $StdoutLog
  Write-LogTail $StderrLog
  throw "Chrome no se abrira porque el bridge Arduino no esta listo."
}

function Find-Python {
  $configured = Get-EnvValue "PYTHON_BIN"
  if ($configured) {
    return @{
      File = $configured
      PrefixArgs = @()
    }
  }

  $pyLauncher = Get-Command "py.exe" -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    return @{
      File = $pyLauncher.Source
      PrefixArgs = @("-3")
    }
  }

  foreach ($candidate in @("python.exe", "python3.exe")) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return @{
        File = $command.Source
        PrefixArgs = @()
      }
    }
  }

  throw "No encontre Python 3. Instala Python desde python.org o define PYTHON_BIN con la ruta de python.exe."
}

function Find-Chrome {
  $configured = Get-EnvValue "CHROME_BIN" (Get-EnvValue "CHROMIUM_BIN")
  if ($configured) {
    if (Test-Path $configured) {
      return (Resolve-Path $configured).Path
    }

    $configuredCommand = Get-Command $configured -ErrorAction SilentlyContinue
    if ($configuredCommand) {
      return $configuredCommand.Source
    }

    return $configured
  }

  $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
  $candidatePaths = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path $programFilesX86 "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe")
  )

  foreach ($path in $candidatePaths) {
    if ($path -and (Test-Path $path)) {
      return $path
    }
  }

  $pathCommand = Get-Command "chrome.exe" -ErrorAction SilentlyContinue
  if ($pathCommand) {
    return $pathCommand.Source
  }

  throw "No encontre Google Chrome. Instala Chrome o define CHROME_BIN con la ruta de chrome.exe."
}

function Write-ChromePreferences {
  param([string]$UserDataDir)

  $defaultDir = Join-Path $UserDataDir "Default"
  New-Item -ItemType Directory -Force -Path $defaultDir | Out-Null

  $preferences = @{
    translate = @{
      enabled = $false
    }
    intl = @{
      accept_languages = "es-PY,es-419,es,en-US,en"
    }
    browser = @{
      enable_spellchecking = $false
    }
    profile = @{
      default_content_setting_values = @{
        notifications = 2
      }
    }
  }

  $localState = @{
    intl = @{
      app_locale = "es-PY"
    }
    translate = @{
      enabled = $false
    }
  }

  $preferencesPath = Join-Path $defaultDir "Preferences"
  $localStatePath = Join-Path $UserDataDir "Local State"
  $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
  [System.IO.File]::WriteAllText($preferencesPath, ($preferences | ConvertTo-Json -Depth 10 -Compress), $utf8NoBom)
  [System.IO.File]::WriteAllText($localStatePath, ($localState | ConvertTo-Json -Depth 10 -Compress), $utf8NoBom)
}

$HttpPort = [int](Get-EnvValue "HTTP_PORT" "8000")
$HttpBind = Get-EnvValue "HTTP_BIND" "127.0.0.1"
$EffectsScale = Get-EnvValue "EFFECTS_SCALE" "1.2"
$ChromeUserDataDir = Get-EnvValue "CHROME_USER_DATA_DIR" (Join-Path $env:TEMP "omo-chrome-profile")
$ChromeExtraFlags = Get-EnvValue "CHROME_EXTRA_FLAGS"
$KioskEnabled = (-not $NoKiosk.IsPresent) -and (Test-Enabled (Get-EnvValue "KIOSK" "1"))
$LeftButtonKey = Get-EnvValue "LEFT_BUTTON_KEY" (Get-EnvValue "WINDOWS_LEFT_KEY" "z")
$RightButtonKey = Get-EnvValue "RIGHT_BUTTON_KEY" (Get-EnvValue "WINDOWS_RIGHT_KEY" "x")
$StartArduinoBridge = Test-Enabled (Get-EnvValue "START_ARDUINO_BRIDGE" "0")
$ArduinoWsHost = Get-EnvValue "ARDUINO_WS_HOST" "127.0.0.1"
$ArduinoWsPort = [int](Get-EnvValue "ARDUINO_WS_PORT" "8765")
$ArduinoSerialPort = Get-EnvValue "ARDUINO_SERIAL_PORT"
$ArduinoSerialBaud = Get-EnvValue "ARDUINO_SERIAL_BAUD" "115200"

$python = Find-Python
$chrome = Find-Chrome
Write-ChromePreferences $ChromeUserDataDir

$processes = @()
$LogDir = Join-Path $RootDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ServerStdoutLog = Join-Path $LogDir "windows-http-$Timestamp.out.log"
$ServerStderrLog = Join-Path $LogDir "windows-http-$Timestamp.err.log"
$ArduinoStdoutLog = Join-Path $LogDir "windows-arduino-$Timestamp.out.log"
$ArduinoStderrLog = Join-Path $LogDir "windows-arduino-$Timestamp.err.log"

try {
  $serverArgs = @()
  $serverArgs += $python.PrefixArgs
  $serverArgs += @("kiosk_http_server.py", "$HttpPort", "--bind", $HttpBind, "--directory", $RootDir)
  $httpProcess = Start-Process `
    -FilePath $python.File `
    -ArgumentList (Join-Args $serverArgs) `
    -WorkingDirectory $RootDir `
    -WindowStyle Minimized `
    -RedirectStandardOutput $ServerStdoutLog `
    -RedirectStandardError $ServerStderrLog `
    -PassThru
  $processes += $httpProcess

  $serverUrl = "http://127.0.0.1:$HttpPort/"
  Write-Host "Starting HTTP server: $serverUrl"
  Write-Host "HTTP logs: $ServerStdoutLog"
  Write-Host "HTTP errors: $ServerStderrLog"
  Wait-HttpServer `
    -Url $serverUrl `
    -Process $httpProcess `
    -StdoutLog $ServerStdoutLog `
    -StderrLog $ServerStderrLog

  $queryParts = @("effects=$EffectsScale")
  if ($StartArduinoBridge) {
    [Environment]::SetEnvironmentVariable("ARDUINO_WS_HOST", $ArduinoWsHost, "Process")
    [Environment]::SetEnvironmentVariable("ARDUINO_WS_PORT", "$ArduinoWsPort", "Process")
    [Environment]::SetEnvironmentVariable("ARDUINO_SERIAL_BAUD", $ArduinoSerialBaud, "Process")
    if ($ArduinoSerialPort) {
      [Environment]::SetEnvironmentVariable("ARDUINO_SERIAL_PORT", $ArduinoSerialPort, "Process")
    }

    $arduinoArgs = @()
    $arduinoArgs += $python.PrefixArgs
    $arduinoArgs += @("arduino_serial_ws_bridge.py")
    $arduinoProcess = Start-Process `
      -FilePath $python.File `
      -ArgumentList (Join-Args $arduinoArgs) `
      -WorkingDirectory $RootDir `
      -WindowStyle Minimized `
      -RedirectStandardOutput $ArduinoStdoutLog `
      -RedirectStandardError $ArduinoStderrLog `
      -PassThru
    $processes += $arduinoProcess

    Write-Host "Starting Arduino bridge: ws://$ArduinoWsHost`:$ArduinoWsPort"
    if ($ArduinoSerialPort) {
      Write-Host "Arduino serial port: $ArduinoSerialPort"
    } else {
      Write-Host "Arduino serial port: auto-detect"
    }
    Write-Host "Arduino logs: $ArduinoStdoutLog"
    Write-Host "Arduino errors: $ArduinoStderrLog"
    Wait-TcpPort `
      -HostName $ArduinoWsHost `
      -Port $ArduinoWsPort `
      -Process $arduinoProcess `
      -StdoutLog $ArduinoStdoutLog `
      -StderrLog $ArduinoStderrLog

    $bridgeUrl = "ws://$ArduinoWsHost`:$ArduinoWsPort"
    $queryParts += "bridge=$([System.Uri]::EscapeDataString($bridgeUrl))"
  }
  if ($LeftButtonKey) {
    $queryParts += "leftKey=$([System.Uri]::EscapeDataString($LeftButtonKey))"
  }
  if ($RightButtonKey) {
    $queryParts += "rightKey=$([System.Uri]::EscapeDataString($RightButtonKey))"
  }

  $gameUrl = "http://127.0.0.1:$HttpPort/?$($queryParts -join '&')"
  $chromeArgs = @(
    "--noerrdialogs",
    "--no-first-run",
    "--no-default-browser-check",
    "--password-store=basic",
    "--disable-infobars",
    "--disable-translate",
    "--disable-features=Translate,TranslateUI,TranslateSubFrames",
    "--lang=es-419",
    "--accept-lang=es-PY,es-419,es,en-US,en",
    "--disable-session-crashed-bubble",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--metrics-recording-only",
    "--user-data-dir=$ChromeUserDataDir",
    "--autoplay-policy=no-user-gesture-required"
  )

  if ($KioskEnabled) {
    $chromeArgs = @("--kiosk", "--start-fullscreen") + $chromeArgs
  } else {
    $chromeArgs = @("--start-fullscreen") + $chromeArgs
  }

  if ($ChromeExtraFlags) {
    $chromeArgs += ($ChromeExtraFlags -split "\s+")
  }

  $chromeArgs += $gameUrl

  Write-Host "HTTP server ready: $serverUrl"
  if ($StartArduinoBridge) {
    Write-Host "Arduino bridge ready: ws://$ArduinoWsHost`:$ArduinoWsPort"
  }
  Write-Host "Keyboard buttons: left=$LeftButtonKey, right=$RightButtonKey"
  Write-Host "Effects scale: $EffectsScale"
  Write-Host "Opening Chrome: $gameUrl"
  Write-Host "Close Chrome or press Ctrl+C in this window to stop the local server."

  $chromeProcess = Start-Process `
    -FilePath $chrome `
    -ArgumentList (Join-Args $chromeArgs) `
    -WorkingDirectory $RootDir `
    -PassThru

  Wait-Process -Id $chromeProcess.Id
}
finally {
  foreach ($process in $processes) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
