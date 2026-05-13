param(
  [string]$TaskName = "OMO Paraguay Albirroja Kiosk"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existingTask) {
  Write-Host "No existe la tarea programada: $TaskName"
  return
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Tarea programada eliminada: $TaskName"
