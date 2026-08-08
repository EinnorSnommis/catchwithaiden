<#
    publish.ps1 — push the site live to catchwithaiden.com

    Double-click this file (or run it) after editing the site. It stages every
    change, commits it, and pushes to GitHub. GitHub Pages redeploys on its own
    within a minute or two.

    Optional message:  .\publish.ps1 "changed the price to $35"
#>

param([string]$Message)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# Make sure git and gh are reachable even when launched by double-click
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [System.Environment]::GetEnvironmentVariable('Path', 'User')

Write-Host ''
Write-Host '  Publishing catchwithaiden.com' -ForegroundColor Cyan
Write-Host '  -----------------------------' -ForegroundColor Cyan

$changes = git status --short
if (-not $changes) {
    Write-Host '  Nothing to publish — the site is already up to date.' -ForegroundColor Yellow
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 0
}

Write-Host ''
Write-Host '  Changes to publish:' -ForegroundColor White
$changes | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
Write-Host ''

if (-not $Message) {
    $Message = 'Site update ' + (Get-Date -Format 'MMM d, yyyy h:mm tt')
}

git add -A
git commit -m $Message | Out-Null
git push | Out-Null

Write-Host '  Pushed. GitHub Pages is rebuilding now.' -ForegroundColor Green
Write-Host '  Your changes will be live at https://catchwithaiden.com in a minute or two.' -ForegroundColor Green
Write-Host ''
Read-Host '  Press Enter to close'
