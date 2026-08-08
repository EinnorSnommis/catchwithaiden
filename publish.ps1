<#
    publish.ps1 — push the site live to catchwithaiden.com

    Double-click this file (or run it) after editing the site. It stages every
    change, commits it, syncs with GitHub, and pushes. GitHub Pages redeploys
    on its own within a minute or two.

    Optional message:  .\publish.ps1 "changed the price to $35"
#>

param([string]$Message)

Set-Location -Path $PSScriptRoot

# Make sure git is reachable even when launched by double-click
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [System.Environment]::GetEnvironmentVariable('Path', 'User')

function Stop-WithError($what) {
    Write-Host ''
    Write-Host "  PUBLISH FAILED at: $what" -ForegroundColor Red
    Write-Host '  The site was NOT updated. The error above says why.' -ForegroundColor Red
    Write-Host '  Nothing is broken — your files are safe. Ask Claude to sort it out.' -ForegroundColor Yellow
    Write-Host ''
    Read-Host '  Press Enter to close'
    exit 1
}

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
if ($LASTEXITCODE -ne 0) { Stop-WithError 'staging your changes' }

git commit -m $Message | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-WithError 'saving the commit' }

# GitHub sometimes commits on its own (e.g. the CNAME file when the custom
# domain is changed), so sync before pushing or the push gets rejected.
Write-Host '  Syncing with GitHub...' -ForegroundColor Gray
git pull --rebase 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    git rebase --abort 2>&1 | Out-Null
    Stop-WithError 'syncing with GitHub (your commit is saved locally)'
}

git push 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-WithError 'pushing to GitHub (your commit is saved locally)' }

Write-Host ''
Write-Host '  Published successfully.' -ForegroundColor Green
Write-Host '  Live at https://catchwithaiden.com in a minute or two.' -ForegroundColor Green
Write-Host ''
Read-Host '  Press Enter to close'
