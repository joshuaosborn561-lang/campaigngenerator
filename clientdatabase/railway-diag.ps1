#
# Railway diagnostic — run this in YOUR Cursor PowerShell terminal, then paste
# the full output back to the agent. One round-trip; no secrets are printed.
#
# Usage:
#   .\railway-diag.ps1
#
$ErrorActionPreference = "Continue"

Write-Host "========== railway whoami ==========" -ForegroundColor Cyan
railway whoami 2>&1
Write-Host ""

Write-Host "========== railway list ==========" -ForegroundColor Cyan
railway list 2>&1
Write-Host ""

Write-Host "========== railway status ==========" -ForegroundColor Cyan
railway status 2>&1
Write-Host ""

Write-Host "========== railway link state ==========" -ForegroundColor Cyan
if (Test-Path ".railway") {
    Write-Host "Linked (.railway folder present):"
    Get-ChildItem .railway | Select-Object Name, LastWriteTime | Format-Table -AutoSize
    if (Test-Path ".railway\config.json") {
        Write-Host "config.json contents (project/service/environment IDs only — no secrets):"
        Get-Content .railway\config.json
    }
} else {
    Write-Host "NOT LINKED — no .railway folder in this directory."
}
Write-Host ""

Write-Host "========== railway variables (KEYS ONLY, values masked) ==========" -ForegroundColor Cyan
$raw = railway variables --kv 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "(not linked to a service yet — skip)"
} else {
    foreach ($line in $raw) {
        if ($line -match "^([A-Z0-9_]+)=") {
            Write-Host $Matches[1]
        } else {
            Write-Host $line
        }
    }
}
Write-Host ""

Write-Host "========== done ==========" -ForegroundColor Green
Write-Host "Copy everything above this line and paste back to the agent."
