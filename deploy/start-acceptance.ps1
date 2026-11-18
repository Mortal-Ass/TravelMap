param([switch]$CheckOnly, [switch]$AllowStartupMigrations, [switch]$Share)
$ErrorActionPreference = 'Stop'
$db = 'travelmap-acceptance-db-1'
$api = 'travelmap-acceptance-api-1'
$web = 'travelmap-acceptance-web-1'
$site = 'https://localhost:18443'

function Invoke-Docker([string[]]$Arguments) {
    $result = & docker.exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($Arguments[0])" }
    $result
}

function Get-State($container) {
    Invoke-Docker @('inspect', '--format', '{{.State.Status}}', $container)
}

function Start-Existing($container) {
    if ((Get-State $container) -ne 'running') {
        Invoke-Docker @('start', $container) | Out-Null
    }
}

try {
    & docker.exe info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Open Docker Desktop, wait for its engine, then run this launcher again.' }
    $mounts = (Invoke-Docker @('inspect','--format','{{json .Mounts}}',$db)) | ConvertFrom-Json
    if (-not ($mounts | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' -and $_.Name -eq 'travelmap-acceptance_data' })) {
        throw 'Expected acceptance database volume is missing. Startup cancelled.'
    }
    $apiState = Get-State $api
    Write-Host "Database: $(Get-State $db)  API: $apiState  Web: $(Get-State $web)"
    if ($CheckOnly) { exit 0 }
    if ($apiState -ne 'running' -and -not $AllowStartupMigrations) {
        Write-Host 'The existing API startup command runs pending database migrations.'
        if ((Read-Host 'Type START to allow this startup, or press Enter to cancel') -cne 'START') { exit 0 }
    }
    Start-Existing $db
    $ready = $false
    for ($i=0; $i -lt 30; $i++) {
        & docker.exe exec $db pg_isready -U travelmap -d travelmap *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep 1
    }
    if (-not $ready) { throw 'Database did not become ready.' }
    if ($apiState -ne 'running') { Start-Existing $api }
    Start-Existing $web
    $healthy = $false
    for ($i=0; $i -lt 30; $i++) {
        $response = & curl.exe -kfsS --noproxy '*' --max-time 2 "$site/api/health" 2>$null
        if ($LASTEXITCODE -eq 0 -and ($response | ConvertFrom-Json).status -eq 'ok') { $healthy = $true; break }
        Start-Sleep 1
    }
    if (-not $healthy) { throw 'TravelMap health check failed.' }
    Start-Process $site
    Write-Host '固定域名共享需要本机 ngrok 已完成认证。共享期间请保持本窗口打开。'
    if ($Share -or ((Read-Host '是否开启固定域名，让同学访问？输入 Y 开启，直接回车仅在本机使用') -eq 'Y')) {
        $shareHost = $env:PUBLIC_TRAVELMAP_HOST
        $hostFile = Join-Path $PSScriptRoot 'share-host.env'
        if (!$shareHost -and (Test-Path $hostFile)) { $shareHost = (Get-Content -Raw $hostFile).Trim() }
        if (!$shareHost) { $shareHost = Read-Host '请输入 ngrok 为你分配的域名' }
        if ([Uri]::CheckHostName($shareHost) -ne [UriHostNameType]::Dns) { throw '请输入域名，例如 example.ngrok-free.dev' }
        & ngrok.exe http $site --host-header=localhost "--url=https://$shareHost"
        exit $LASTEXITCODE
    }
} catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}
