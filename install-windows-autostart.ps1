param(
  [string]$TaskName = "OMO Paraguay Albirroja Kiosk",
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WrapperPath = Join-Path $RootDir "start-windows-autostart.bat"

if (-not (Test-Path $WrapperPath)) {
  throw "No encontre $WrapperPath"
}

function Quote-CmdPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return '"' + ($Path -replace '"', '\"') + '"'
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument ("/c " + (Quote-CmdPath $WrapperPath)) `
  -WorkingDirectory $RootDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)

$description = "Abre el juego OMO Paraguay Albirroja en Google Chrome kiosk al iniciar sesion en Windows."

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description $description | Out-Null

Write-Host "Tarea programada instalada: $TaskName"
Write-Host "Usuario: $currentUser"
Write-Host "Wrapper: $WrapperPath"
Write-Host "Se ejecutara al iniciar sesion. Para que arranque al prender la PC sin tocar nada, Windows debe tener autologin habilitado para este usuario."

if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Tarea iniciada ahora."
}
