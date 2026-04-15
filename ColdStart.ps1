$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$InvincibleDir = Join-Path $Root "Invincible"
$BackendDir = Join-Path $InvincibleDir "backend"
$SharedFrontendDir = Join-Path $InvincibleDir "frontend"
$OmniFrontendDir = Join-Path $Root "Omni\frontend"
$SentinelDir = Join-Path $Root "sentinel_monitor"
$InfraDir = Join-Path $Root "infrastructure"
$NgrokConfig = Join-Path $Root "ngrok.yml"
$FrontendProxyScript = Join-Path $Root "tools\spa_proxy_server.py"
$RuntimeDir = Join-Path $env:TEMP "InvincibleColdStart"
$DockerConfigDir = Join-Path $env:TEMP "InvincibleColdStartDocker"
$VenvPy = Join-Path $InvincibleDir ".venv\Scripts\python.exe"
$Python = if (Test-Path $VenvPy) { $VenvPy } else { "python" }
$DockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$TwingateDesktopExe = "C:\Program Files\Twingate\Twingate.exe"
$TwingateCompose = Join-Path $InfraDir "twingate\docker-compose.yml"
$TwingateEnv = Join-Path $InfraDir "twingate\.env"

$SiteRoots = @(
    @{ Name = "Oracle site"; Path = (Join-Path $Root "oracle-site") },
    @{ Name = "Omni site"; Path = (Join-Path $Root "Omni\omni-site") },
    @{ Name = "Grid site"; Path = (Join-Path $Root "grid-site") },
    @{ Name = "Invincible site"; Path = (Join-Path $Root "invincible-site") }
)

function Write-Step($n, $total, $message, $color = "Cyan") {
    Write-Host "  [$n/$total] $message" -ForegroundColor $color
}

function Add-ManualAction($message) {
    if (-not $script:ManualActions) {
        $script:ManualActions = New-Object System.Collections.Generic.List[string]
    }
    if ($message -and -not $script:ManualActions.Contains($message)) {
        [void]$script:ManualActions.Add($message)
    }
}

function Test-ProcessRunning($processName) {
    return [bool](Get-Process -Name $processName -ErrorAction SilentlyContinue)
}

function Wait-ProcessRunning($processName, $timeoutSec = 20) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-ProcessRunning -processName $processName) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Test-Port($port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("127.0.0.1", $port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Wait-Port($port, $timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port $port) {
            return $true
        }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Stop-PortListener($port) {
    $hits = netstat -ano 2>$null | Select-String ":$port\s" | Where-Object { $_ -match "LISTENING" }
    foreach ($hit in $hits) {
        $processId = ($hit.ToString().Trim() -split '\s+')[-1]
        if ($processId -match '^\d+$' -and $processId -ne '0') {
            Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-HttpProbe($url, $method = "GET", $timeoutSec = 8) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method $method -UseBasicParsing -TimeoutSec $timeoutSec
        return @{
            Ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
            StatusCode = $response.StatusCode
            Error = $null
        }
    } catch {
        $statusCode = $null
        try {
            $statusCode = [int]$_.Exception.Response.StatusCode
        } catch {}
        return @{
            Ok = ($statusCode -ge 200 -and $statusCode -lt 400)
            StatusCode = $statusCode
            Error = $_.Exception.Message
        }
    }
}

function Wait-HttpOk($url, $method = "GET", $timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $probe = Invoke-HttpProbe -url $url -method $method -timeoutSec 5
        if ($probe.Ok) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Ensure-Venv() {
    if (-not (Test-Path $VenvPy)) {
        Write-Host "    Creating Python virtual environment..." -ForegroundColor Yellow
        & python -m venv "$InvincibleDir\.venv"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create .venv."
        }
    }
    $script:Python = if (Test-Path $VenvPy) { $VenvPy } else { "python" }
}

function Ensure-PythonImports() {
    & $Python -c "import fastapi, uvicorn, jwt, aiohttp" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Installing backend Python dependencies..." -ForegroundColor Yellow
        & $Python -m pip install -r "$BackendDir\requirements.txt" --quiet
        if ($LASTEXITCODE -ne 0) {
            throw "pip install failed for backend requirements."
        }
    }
}

function Ensure-NodeModules($projectDir, $label) {
    $nodeModules = Join-Path $projectDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "    Installing npm dependencies for $label..." -ForegroundColor Yellow
        Push-Location $projectDir
        try {
            & npm.cmd install --silent
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed in $projectDir"
            }
        } finally {
            Pop-Location
        }
    }
}

function Ensure-FrontendBuild($projectDir, $label, $scriptName, $artifactPath) {
    if (Test-Path $artifactPath) {
        Write-Host "    $label build artifact present." -ForegroundColor DarkGray
        return
    }

    Write-Host "    Building $label ($scriptName)..." -ForegroundColor Yellow
    Push-Location $projectDir
    try {
        & npm.cmd run $scriptName
        if ($LASTEXITCODE -ne 0) {
            throw "npm run $scriptName failed in $projectDir"
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $artifactPath)) {
        throw "$label build completed without producing $artifactPath"
    }
}

function Resolve-FirstExistingFile($patterns) {
    $matches = @()
    foreach ($pattern in $patterns) {
        $parent = Split-Path -Parent $pattern
        $leaf = Split-Path -Leaf $pattern
        if (-not (Test-Path $parent)) {
            continue
        }
        $items = Get-ChildItem -Path $parent -Filter $leaf -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending
        if ($items) {
            $matches += $items
        }
    }
    return $matches | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
}

function Start-DesktopAppIfNeeded($label, $processName, $exePath) {
    if (Test-ProcessRunning -processName $processName) {
        Write-Host "    $label already running." -ForegroundColor DarkGray
        return $true
    }

    if (-not (Test-Path $exePath)) {
        return $false
    }

    try {
        Start-Process -FilePath $exePath -WindowStyle Minimized | Out-Null
        if (Wait-ProcessRunning -processName $processName -timeoutSec 25) {
            Write-Host "    Started $label." -ForegroundColor DarkGray
            return $true
        }
    } catch {}

    return $false
}

function Initialize-DockerEnv() {
    if (-not (Test-Path $DockerConfigDir)) {
        New-Item -ItemType Directory -Force -Path $DockerConfigDir | Out-Null
    }
    $env:DOCKER_CONFIG = $DockerConfigDir
}

function Test-DockerReady() {
    $dockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        return $false
    }

    try {
        Initialize-DockerEnv
        & $dockerCmd.Source info *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Wait-DockerReady($timeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerReady) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Test-TwingateEnvConfigured($envPath) {
    if (-not (Test-Path $envPath)) {
        return $false
    }

    $requiredKeys = @("TWINGATE_NETWORK", "TWINGATE_ACCESS_TOKEN", "TWINGATE_REFRESH_TOKEN")
    $values = @{}
    foreach ($line in Get-Content -Path $envPath -ErrorAction SilentlyContinue) {
        if ($line -match '^\s*#' -or $line -notmatch '=') {
            continue
        }
        $parts = $line -split '=', 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"')
        $values[$key] = $value
    }

    foreach ($key in $requiredKeys) {
        if (-not $values.ContainsKey($key)) {
            return $false
        }
        $value = $values[$key]
        if ([string]::IsNullOrWhiteSpace($value) -or $value -match '^your-' -or $value -match '^<') {
            return $false
        }
    }

    return $true
}

function Get-TwingateConnectorStatus() {
    if (-not (Test-DockerReady)) {
        return [pscustomobject]@{
            AnyRunning = $false
            AnyHealthy = $false
            HealthyName = $null
            ComposePresent = $false
            ComposeRunning = $false
            ComposeHealthy = $false
            ComposeUnhealthy = $false
            ComposeStatus = $null
            ComposeUnregistered = $false
        }
    }

    try {
        Initialize-DockerEnv
        $rawRows = & docker ps --format "{{.Names}}|{{.Status}}|{{.Image}}" 2>$null
        $rows = @()
        foreach ($row in $rawRows) {
            $parts = $row -split '\|', 3
            if ($parts.Count -ne 3) {
                continue
            }
            $rows += [pscustomobject]@{
                Name = $parts[0]
                Status = $parts[1]
                Image = $parts[2]
            }
        }

        $connectorRows = @($rows | Where-Object { $_.Image -like "twingate/connector*" })
        $composeRow = @($connectorRows | Where-Object { $_.Name -eq "invincible-twingate-connector" } | Select-Object -First 1)
        $healthyRow = @($connectorRows | Where-Object { $_.Status -match '\(healthy\)' } | Select-Object -First 1)
        $composeUnregistered = $false
        if ($composeRow -and $composeRow.Status -match '\(unhealthy\)') {
            try {
                $logTail = (& docker logs --tail 20 invincible-twingate-connector 2>$null) -join "`n"
                $composeUnregistered = $logTail -match 'unregistered via Admin Console'
            } catch {}
        }

        return [pscustomobject]@{
            AnyRunning = ($connectorRows.Count -gt 0)
            AnyHealthy = [bool]$healthyRow
            HealthyName = if ($healthyRow) { $healthyRow.Name } else { $null }
            ComposePresent = [bool]$composeRow
            ComposeRunning = [bool]($composeRow -and $composeRow.Status -match '^Up ')
            ComposeHealthy = [bool]($composeRow -and $composeRow.Status -match '\(healthy\)')
            ComposeUnhealthy = [bool]($composeRow -and $composeRow.Status -match '\(unhealthy\)')
            ComposeStatus = if ($composeRow) { $composeRow.Status } else { $null }
            ComposeUnregistered = $composeUnregistered
        }
    } catch {
        return [pscustomobject]@{
            AnyRunning = $false
            AnyHealthy = $false
            HealthyName = $null
            ComposePresent = $false
            ComposeRunning = $false
            ComposeHealthy = $false
            ComposeUnhealthy = $false
            ComposeStatus = $null
            ComposeUnregistered = $false
        }
    }
}

function Test-TwingateConnectorRunning() {
    $status = Get-TwingateConnectorStatus
    return ($status.AnyHealthy -or $status.ComposeRunning)
}

function Resolve-NgrokExecutable() {
    $candidates = New-Object System.Collections.Generic.List[string]
    $cmd = Get-Command "ngrok" -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        [void]$candidates.Add($cmd.Source)
    }

    foreach ($path in @(
        (Join-Path $env:LOCALAPPDATA "ngrok\ngrok.exe"),
        (Join-Path $env:ProgramFiles "ngrok\ngrok.exe"),
        (Join-Path $env:ProgramData "chocolatey\bin\ngrok.exe"),
        (Join-Path $env:USERPROFILE "bin\ngrok.exe")
    )) {
        if ($path) {
            [void]$candidates.Add($path)
        }
    }

    $winGetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    if (Test-Path $winGetRoot) {
        $found = Get-ChildItem -Path $winGetRoot -Filter "ngrok.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 1
        if ($found) {
            [void]$candidates.Add($found)
        }
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not $candidate -or -not (Test-Path $candidate)) {
            continue
        }
        try {
            & $candidate version *> $null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        } catch {}
    }

    return $null
}

function Start-ServiceShell($name, $scriptName, $scriptBody, $port, $waitUrl = $null, $waitMethod = "GET") {
    $scriptPath = Join-Path $RuntimeDir $scriptName
    $pidPath = Join-Path $RuntimeDir "$name.pid"
    $scriptBody | Set-Content -Path $scriptPath -Encoding UTF8

    $process = Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $scriptPath
    ) -WindowStyle Minimized -PassThru

    Set-Content -Path $pidPath -Value $process.Id -Encoding ASCII

    if ($port) {
        [void](Wait-Port -port $port -timeoutSec 40)
    }
    if ($waitUrl) {
        [void](Wait-HttpOk -url $waitUrl -method $waitMethod -timeoutSec 40)
    }
}

function Start-ServiceCommand($name, $commandText, $port, $waitUrl = $null, $waitMethod = "GET") {
    $pidPath = Join-Path $RuntimeDir "$name.pid"
    $process = Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", $commandText
    ) -WindowStyle Minimized -PassThru

    Set-Content -Path $pidPath -Value $process.Id -Encoding ASCII

    if ($port) {
        [void](Wait-Port -port $port -timeoutSec 40)
    }
    if ($waitUrl) {
        [void](Wait-HttpOk -url $waitUrl -method $waitMethod -timeoutSec 40)
    }
}

function Start-DetachedCmd($name, $commandText, $port, $waitUrl = $null, $waitMethod = "GET") {
    $pidPath = Join-Path $RuntimeDir "$name.pid"
    $process = Start-Process cmd.exe -ArgumentList "/c", $commandText -WorkingDirectory $Root -WindowStyle Minimized -PassThru
    Set-Content -Path $pidPath -Value $process.Id -Encoding ASCII

    if ($port) {
        [void](Wait-Port -port $port -timeoutSec 40)
    }
    if ($waitUrl) {
        [void](Wait-HttpOk -url $waitUrl -method $waitMethod -timeoutSec 40)
    }
}

function Start-TrackedProcess($name, $filePath, $arguments, $workingDirectory, $port, $waitUrl = $null, $waitMethod = "GET") {
    $pidPath = Join-Path $RuntimeDir "$name.pid"
    $process = Start-Process -FilePath $filePath -ArgumentList $arguments -WorkingDirectory $workingDirectory -WindowStyle Minimized -PassThru
    Set-Content -Path $pidPath -Value $process.Id -Encoding ASCII

    if ($port) {
        [void](Wait-Port -port $port -timeoutSec 40)
    }
    if ($waitUrl) {
        [void](Wait-HttpOk -url $waitUrl -method $waitMethod -timeoutSec 40)
    }
}

function Invoke-StackChecks($checks) {
    $results = @()
    foreach ($check in $checks) {
        $probe = Invoke-HttpProbe -url $check.Url -method $check.Method -timeoutSec 8
        $acceptedStatuses = @()
        if ($check.ContainsKey("AcceptStatus") -and $check.AcceptStatus) {
            $acceptedStatuses = @($check.AcceptStatus)
        }
        $ok = [bool]$probe.Ok
        if (-not $ok -and $probe.StatusCode -and $acceptedStatuses.Count -gt 0) {
            $ok = @($acceptedStatuses | ForEach-Object { [int]$_ }) -contains [int]$probe.StatusCode
        }
        $results += [pscustomobject]@{
            Name = $check.Name
            Url = $check.Url
            Method = $check.Method
            Required = [bool]$check.Required
            Ok = $ok
            StatusCode = $probe.StatusCode
            Error = $probe.Error
        }
    }
    return $results
}

function Write-CheckResults($results, $label) {
    Write-Host "    $label" -ForegroundColor DarkGray
    foreach ($result in $results) {
        $status = if ($result.StatusCode) { $result.StatusCode } else { "ERR" }
        if ($result.Ok) {
            Write-Host "      [OK] $($result.Name) -> $($result.Url) ($status)" -ForegroundColor Green
        } elseif ($result.Required) {
            Write-Host "      [FAIL] $($result.Name) -> $($result.Url) ($status)" -ForegroundColor Yellow
        } else {
            Write-Host "      [WARN] $($result.Name) -> $($result.Url) ($status)" -ForegroundColor DarkYellow
        }
    }
}

function Write-StatusConsole($serviceRows, $initialResults, $stabilityResults) {
    $serviceFailures = @($serviceRows | Where-Object { $_.Required -and -not $_.Ok })
    $requiredFailures = @($stabilityResults | Where-Object { $_.Required -and -not $_.Ok })
    $optionalFailures = @($stabilityResults | Where-Object { -not $_.Required -and -not $_.Ok })
    $overallOk = ($serviceFailures.Count -eq 0 -and $requiredFailures.Count -eq 0)

    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor Cyan
    Write-Host "   STATUS CONSOLE" -ForegroundColor White
    Write-Host "   STACK: $(if ($overallOk) { 'UP' } else { 'ATTENTION NEEDED' })" -ForegroundColor $(if ($overallOk) { "Green" } else { "Yellow" })
    Write-Host "  ================================================" -ForegroundColor Cyan

    foreach ($row in $serviceRows) {
        $tag = if ($row.Required) { "required" } else { "support " }
        Write-Host "  $($row.Name.PadRight(24)) $(if ($row.Ok) { 'RUNNING' } else { 'NOT RUNNING' })  [$tag] $($row.Detail)" -ForegroundColor $(if ($row.Ok) { "Green" } else { "Yellow" })
    }

    Write-Host ""
    Write-Host "  Initial required checks : $((@($initialResults | Where-Object { $_.Required -and $_.Ok })).Count)/$((@($initialResults | Where-Object { $_.Required })).Count)" -ForegroundColor DarkGray
    Write-Host "  Stability required checks: $((@($stabilityResults | Where-Object { $_.Required -and $_.Ok })).Count)/$((@($stabilityResults | Where-Object { $_.Required })).Count)" -ForegroundColor DarkGray

    if ($requiredFailures.Count -gt 0 -or $optionalFailures.Count -gt 0) {
        Write-Host ""
        foreach ($result in $requiredFailures) {
            $status = if ($result.StatusCode) { $result.StatusCode } else { "ERR" }
            Write-Host "  REQUIRED CHECK FAILED: $($result.Name) ($status)" -ForegroundColor Yellow
        }
        foreach ($result in $optionalFailures) {
            $status = if ($result.StatusCode) { $result.StatusCode } else { "ERR" }
            Write-Host "  OPTIONAL CHECK WARN : $($result.Name) ($status)" -ForegroundColor DarkYellow
        }
    }

    if ($script:ManualActions -and $script:ManualActions.Count -gt 0) {
        Write-Host ""
        Write-Host "  Manual actions needed:" -ForegroundColor Yellow
        foreach ($action in $script:ManualActions) {
            Write-Host "  - $action" -ForegroundColor Yellow
        }
    } elseif ($overallOk) {
        Write-Host ""
        Write-Host "  Everything required for the local stack responded and remained up after 10 seconds." -ForegroundColor Green
    }
}

Clear-Host
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "   INVINCIBLE.INC COLD START" -ForegroundColor Cyan
Write-Host "   Oracle | Omni | Grid | Invincible.Inc" -ForegroundColor White
Write-Host "   $(Get-Date -Format 'yyyy-MM-dd  HH:mm:ss')" -ForegroundColor DarkGray
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
$ManualActions = New-Object System.Collections.Generic.List[string]

Write-Step 1 10 "Verifying required directories..."
$missingRequired = $false
foreach ($required in @(
    @{ Name = "Invincible backend"; Path = $BackendDir },
    @{ Name = "Shared frontend"; Path = $SharedFrontendDir },
    @{ Name = "Omni frontend"; Path = $OmniFrontendDir },
    @{ Name = "Sentinel"; Path = $SentinelDir },
    @{ Name = "Frontend proxy"; Path = $FrontendProxyScript }
) + $SiteRoots) {
    if (Test-Path $required.Path) {
        Write-Host "    [OK] $($required.Name) -> $($required.Path)" -ForegroundColor DarkGray
    } else {
        Write-Host "    [MISS] $($required.Name) -> $($required.Path)" -ForegroundColor Yellow
        $missingRequired = $true
    }
}
if ($missingRequired) {
    throw "Cold start aborted because one or more required directories are missing."
}

Write-Step 2 10 "Checking Python environment..."
Ensure-Venv
Ensure-PythonImports
Write-Host "    Python ready: $Python" -ForegroundColor DarkGray

Write-Step 3 10 "Checking frontend dependencies..."
Ensure-NodeModules -projectDir $SharedFrontendDir -label "Invincible shared frontend"
Ensure-NodeModules -projectDir $OmniFrontendDir -label "Omni frontend"
Write-Host "    npm dependencies ready." -ForegroundColor DarkGray

Write-Step 4 10 "Ensuring backend-served app bundles exist..."
Ensure-FrontendBuild -projectDir $SharedFrontendDir -label "Invincible shared frontend dev bundle" -scriptName "build:dev" -artifactPath (Join-Path $SharedFrontendDir "dist-dev\index.html")
Ensure-FrontendBuild -projectDir $SharedFrontendDir -label "Invincible shared frontend user bundle" -scriptName "build:user" -artifactPath (Join-Path $SharedFrontendDir "dist-user\index.html")
Ensure-FrontendBuild -projectDir $OmniFrontendDir -label "Omni standalone bundle" -scriptName "build" -artifactPath (Join-Path $OmniFrontendDir "dist\index.html")

Write-Step 5 10 "Verifying download artifacts..."
$windowsInstaller = Resolve-FirstExistingFile @(
    (Join-Path $InvincibleDir "dist_installer\Invincible_Setup_v*.exe"),
    (Join-Path $InvincibleDir "dist_installer\InvincibleInc_Setup_v*.exe"),
    (Join-Path $InvincibleDir "explainer\Invincible_Setup_v*.exe"),
    (Join-Path $InvincibleDir "explainer\InvincibleInc_Setup_v*.exe"),
    (Join-Path $InvincibleDir "dist\InvincibleInc\InvincibleInc.exe"),
    (Join-Path $InvincibleDir "dist\Invincible\Invincible.exe")
)
if ($windowsInstaller) {
    Write-Host "    Windows download artifact: $($windowsInstaller.FullName)" -ForegroundColor DarkGray
} else {
    throw "No Windows download artifact found. /download/windows would return 404."
}

$secureDevArtifact = Resolve-FirstExistingFile @(
    (Join-Path $InvincibleDir "dist_installer\DevInvincible_Setup_v*.exe"),
    (Join-Path $env:LOCALAPPDATA "Invincible.Inc\secure-builds\Invincible_Inc_Sovereign_Dev*.zip"),
    (Join-Path $env:LOCALAPPDATA "Invincible.Inc\secure-builds\Invincible_Inc_Sovereign_Dev*.exe"),
    (Join-Path $InvincibleDir "dist\DevInvincibleInc\DevInvincibleInc.exe")
)
if ($secureDevArtifact) {
    Write-Host "    Secure dev artifact: $($secureDevArtifact.FullName)" -ForegroundColor DarkGray
} else {
    Write-Host "    WARNING: no secure dev artifact found for ticket-gated distribution." -ForegroundColor Yellow
}

Write-Step 6 10 "Checking prerequisites and supporting apps..."
$dockerInstalled = [bool](Get-Command "docker" -ErrorAction SilentlyContinue)
$dockerDesktopRunning = Test-ProcessRunning -processName "Docker Desktop"
$dockerReady = Test-DockerReady
if (-not $dockerReady) {
    if ($dockerInstalled -and -not $dockerDesktopRunning -and (Start-DesktopAppIfNeeded -label "Docker Desktop" -processName "Docker Desktop" -exePath $DockerDesktopExe)) {
        $dockerDesktopRunning = Test-ProcessRunning -processName "Docker Desktop"
    }
    if ($dockerInstalled -and $dockerDesktopRunning) {
        Write-Host "    Waiting for Docker engine to become ready..." -ForegroundColor DarkGray
        $dockerReady = Wait-DockerReady -timeoutSec 75
    }
}
if ($dockerReady) {
    Write-Host "    Docker engine ready." -ForegroundColor DarkGray
} elseif ($dockerInstalled -and $dockerDesktopRunning) {
    Write-Host "    Docker Desktop is open, but the engine is not ready yet." -ForegroundColor Yellow
    Add-ManualAction "Wait for Docker Desktop to finish starting, or restart it, until `docker info` succeeds."
} elseif ($dockerInstalled) {
    Add-ManualAction "Start Docker Desktop and wait for the engine to report healthy before rerunning ColdStart."
} else {
    Add-ManualAction "Install Docker Desktop or add docker.exe to PATH if Twingate connector support is required."
}

$twingateClientUp = Test-ProcessRunning -processName "Twingate"
if (-not $twingateClientUp) {
    $twingateClientUp = Start-DesktopAppIfNeeded -label "Twingate client" -processName "Twingate" -exePath $TwingateDesktopExe
}
if ($twingateClientUp) {
    Write-Host "    Twingate client ready." -ForegroundColor DarkGray
} else {
    Add-ManualAction "Launch the Twingate desktop client and sign in if remote private-network access is required."
}

$twingateEnvReady = Test-TwingateEnvConfigured -envPath $TwingateEnv
if ((Test-Path $TwingateCompose) -and -not $twingateEnvReady) {
    Add-ManualAction "Populate infrastructure\\twingate\\.env with real TWINGATE_NETWORK, TWINGATE_ACCESS_TOKEN, and TWINGATE_REFRESH_TOKEN values."
}

$twingateConnectorStatus = Get-TwingateConnectorStatus
if (-not $twingateConnectorStatus.ComposeHealthy -and $dockerReady -and $twingateEnvReady -and (Test-Path $TwingateCompose)) {
    try {
        Initialize-DockerEnv
        & docker-compose -f $TwingateCompose up -d >$null 2>$null
        Start-Sleep -Seconds 3
        $twingateConnectorStatus = Get-TwingateConnectorStatus
    } catch {}
}
if ($twingateConnectorStatus.AnyHealthy) {
    Write-Host "    Twingate connector ready: $($twingateConnectorStatus.HealthyName)" -ForegroundColor DarkGray
}
if ($twingateConnectorStatus.ComposeUnregistered) {
    Add-ManualAction "Recreate the Twingate connector in the Twingate Admin Console and replace the tokens in infrastructure\\twingate\\.env; the current compose-managed connector has been unregistered."
} elseif (-not $twingateConnectorStatus.AnyHealthy -and (Test-Path $TwingateCompose)) {
    if ($dockerReady -and $twingateEnvReady) {
        Add-ManualAction "Run `docker-compose -f infrastructure\\twingate\\docker-compose.yml up -d` after Docker and Twingate connector tokens are ready."
    }
}

Write-Step 7 10 "Checking current service state..."
$backendUp = Test-Port 8742
$sharedFrontendUp = Test-Port 5173
$omniFrontendUp = Test-Port 5174
$sentinelUp = Test-Port 9999
$ngrokUp = [bool](Get-Process -Name "ngrok" -ErrorAction SilentlyContinue)

if ($backendUp -and -not (Invoke-HttpProbe -url "http://127.0.0.1:8742/health" -method "GET" -timeoutSec 5).Ok) {
    Stop-PortListener -port 8742
    $backendUp = $false
}
if ($sharedFrontendUp -and -not (Invoke-HttpProbe -url "http://127.0.0.1:5173/" -method "GET" -timeoutSec 5).Ok) {
    Stop-PortListener -port 5173
    $sharedFrontendUp = $false
}
if ($omniFrontendUp -and -not (Invoke-HttpProbe -url "http://127.0.0.1:5174/" -method "GET" -timeoutSec 5).Ok) {
    Stop-PortListener -port 5174
    $omniFrontendUp = $false
}
if ($sentinelUp -and -not (Invoke-HttpProbe -url "http://127.0.0.1:9999/heartbeat" -method "GET" -timeoutSec 5).Ok) {
    Stop-PortListener -port 9999
    $sentinelUp = $false
}

Write-Host "    Backend :8742        -> $(if ($backendUp) { 'UP' } else { 'DOWN' })" -ForegroundColor $(if ($backendUp) { "Green" } else { "DarkGray" })
Write-Host "    Shared app :5173     -> $(if ($sharedFrontendUp) { 'UP' } else { 'DOWN' })" -ForegroundColor $(if ($sharedFrontendUp) { "Green" } else { "DarkGray" })
Write-Host "    Omni app :5174       -> $(if ($omniFrontendUp) { 'UP' } else { 'DOWN' })" -ForegroundColor $(if ($omniFrontendUp) { "Green" } else { "DarkGray" })
Write-Host "    Sentinel :9999       -> $(if ($sentinelUp) { 'UP' } else { 'DOWN' })" -ForegroundColor $(if ($sentinelUp) { "Green" } else { "DarkGray" })
Write-Host "    ngrok                -> $(if ($ngrokUp) { 'UP' } else { 'DOWN' })" -ForegroundColor $(if ($ngrokUp) { "Green" } else { "DarkGray" })

Write-Step 8 10 "Launching missing services..." "Green"

if (-not $backendUp) {
    Stop-PortListener -port 8742
    $backendCommand = "Set-Location '$BackendDir'; `$env:PYTHONPATH = '$BackendDir\src'; `$env:INVINCIBLE_APP_MODE = 'sovereign'; & '$Python' -m uvicorn app.main:app --host 0.0.0.0 --port 8742"
    Start-ServiceCommand -name "backend-shell" -commandText $backendCommand -port 8742 -waitUrl "http://127.0.0.1:8742/health"
}

if (-not $sharedFrontendUp) {
    Stop-PortListener -port 5173
    $sharedFrontendCommand = "start """" /min ""$Python"" ""$FrontendProxyScript"" --root ""$SharedFrontendDir\dist-dev"" --host 127.0.0.1 --port 5173 --backend http://127.0.0.1:8742 --proxy-prefix /auth --proxy-prefix /api --proxy-prefix /health --proxy-prefix /control --proxy-prefix /targets --proxy-prefix /heatmap --proxy-prefix /encounters --proxy-prefix /export --proxy-prefix /settings --proxy-prefix /route --proxy-prefix /stats --proxy-prefix /data --proxy-prefix /gps --proxy-prefix /phone-gps --proxy-prefix /users --proxy-prefix /scan --proxy-prefix /devices --proxy-prefix /flock --proxy-prefix /hotspots --proxy-prefix /stoppers --proxy-prefix /accounts --proxy-prefix /achievements --proxy-prefix /replay --proxy-prefix /alfred --proxy-prefix /geo --proxy-prefix /identity --proxy-prefix /assistant --proxy-prefix /ws"
    Start-DetachedCmd -name "shared-frontend-shell" -commandText $sharedFrontendCommand -port 5173 -waitUrl "http://127.0.0.1:5173/"
}

if (-not $omniFrontendUp) {
    Stop-PortListener -port 5174
    $omniFrontendCommand = "start """" /min ""$Python"" ""$FrontendProxyScript"" --root ""$OmniFrontendDir\dist"" --host 127.0.0.1 --port 5174 --backend http://127.0.0.1:8742 --proxy-prefix /auth --proxy-prefix /api --proxy-prefix /alfred --proxy-prefix /identity --proxy-prefix /geo --proxy-prefix /health --proxy-prefix /ws"
    Start-DetachedCmd -name "omni-frontend-shell" -commandText $omniFrontendCommand -port 5174 -waitUrl "http://127.0.0.1:5174/"
}

if (-not $sentinelUp) {
    Stop-PortListener -port 9999
    $sentinelScript = @"
`$Host.UI.RawUI.WindowTitle = 'Sentinel :9999'
Set-Location '$SentinelDir'
Write-Host ''
Write-Host 'Sentinel monitor on :9999' -ForegroundColor Cyan
& '$Python' sentinel_server.py
"@
    Start-ServiceShell -name "sentinel-shell" -scriptName "sentinel.ps1" -scriptBody $sentinelScript -port 9999 -waitUrl "http://127.0.0.1:9999/heartbeat"
}

if (-not $ngrokUp) {
    $ngrokExe = Resolve-NgrokExecutable
    if ($ngrokExe) {
        $ngrokArgs = if (Test-Path $NgrokConfig) { "--config `"$NgrokConfig`"" } else { "" }
        $ngrokScript = @"
`$Host.UI.RawUI.WindowTitle = 'ngrok -> :8742'
Set-Location '$Root'
Write-Host ''
Write-Host 'ngrok tunnel for :8742' -ForegroundColor Yellow
& '$ngrokExe' http 8742 $ngrokArgs
"@
        Start-ServiceShell -name "ngrok-shell" -scriptName "ngrok.ps1" -scriptBody $ngrokScript -port $null
    } else {
        Add-ManualAction "Repair the ngrok CLI installation or install a direct ngrok.exe binary; the current PATH entry resolves to an unusable WindowsApps alias."
    }
}

Write-Step 9 10 "Probing stack endpoints..."
$checks = @(
    @{ Name = "Backend health"; Url = "http://127.0.0.1:8742/health"; Method = "GET"; Required = $true },
    @{ Name = "Backend distribution status"; Url = "http://127.0.0.1:8742/api/dist/status"; Method = "GET"; Required = $true; AcceptStatus = @(200, 401) },
    @{ Name = "Shared app via backend"; Url = "http://127.0.0.1:8742/"; Method = "GET"; Required = $true },
    @{ Name = "Oracle marketing site"; Url = "http://127.0.0.1:8742/sites/oracle/"; Method = "GET"; Required = $true },
    @{ Name = "Omni marketing site"; Url = "http://127.0.0.1:8742/sites/omni/"; Method = "GET"; Required = $true },
    @{ Name = "Grid marketing site"; Url = "http://127.0.0.1:8742/sites/grid/"; Method = "GET"; Required = $true },
    @{ Name = "Invincible marketing site"; Url = "http://127.0.0.1:8742/sites/invincible/"; Method = "GET"; Required = $true },
    @{ Name = "Omni backend-served app"; Url = "http://127.0.0.1:8742/omni/"; Method = "GET"; Required = $true },
    @{ Name = "Windows download"; Url = "http://127.0.0.1:8742/download/windows"; Method = "HEAD"; Required = $true },
    @{ Name = "Shared frontend mirror"; Url = "http://127.0.0.1:5173/"; Method = "GET"; Required = $false },
    @{ Name = "Omni frontend mirror"; Url = "http://127.0.0.1:5174/"; Method = "GET"; Required = $true },
    @{ Name = "Sentinel"; Url = "http://127.0.0.1:9999/heartbeat"; Method = "GET"; Required = $true }
)

$initialResults = Invoke-StackChecks -checks $checks
Write-CheckResults -results $initialResults -label "Initial probe"

if (@($initialResults | Where-Object { $_.Name -eq "Backend distribution status" -and ($_.StatusCode -eq 404 -or -not $_.StatusCode) }).Count -gt 0) {
    Add-ManualAction "Free port 8742 from the older backend instance or restart that service with the latest code so `/api/dist/status` responds successfully."
}

Write-Step 10 10 "Waiting 10 seconds and confirming stability..."
Start-Sleep -Seconds 10
$stabilityResults = Invoke-StackChecks -checks $checks
Write-CheckResults -results $stabilityResults -label "10-second stability probe"

$serviceRows = @(
    [pscustomobject]@{ Name = "Backend :8742"; Ok = (Test-Port 8742); Required = $true; Detail = "health + app routes" },
    [pscustomobject]@{ Name = "Shared mirror :5173"; Ok = (Test-Port 5173); Required = $true; Detail = "frontend mirror" },
    [pscustomobject]@{ Name = "Omni mirror :5174"; Ok = (Test-Port 5174); Required = $true; Detail = "frontend mirror" },
    [pscustomobject]@{ Name = "Sentinel :9999"; Ok = (Test-Port 9999); Required = $true; Detail = "heartbeat monitor" },
    [pscustomobject]@{ Name = "Docker engine"; Ok = (Test-DockerReady); Required = $false; Detail = "local infra" },
    [pscustomobject]@{ Name = "Twingate client"; Ok = (Test-ProcessRunning -processName "Twingate"); Required = $false; Detail = "remote access client" },
    [pscustomobject]@{ Name = "Twingate connector"; Ok = ($twingateConnectorStatus.AnyHealthy -or $twingateConnectorStatus.ComposeRunning); Required = $false; Detail = if ($twingateConnectorStatus.AnyHealthy) { "docker container [$($twingateConnectorStatus.HealthyName)]" } elseif ($twingateConnectorStatus.ComposeStatus) { "docker container [$($twingateConnectorStatus.ComposeStatus)]" } else { "docker container" } },
    [pscustomobject]@{ Name = "ngrok"; Ok = [bool](Get-Process -Name "ngrok" -ErrorAction SilentlyContinue); Required = $false; Detail = "external tunnel" }
)

if (@($serviceRows | Where-Object { $_.Name -eq "Twingate connector" -and -not $_.Ok }).Count -gt 0 -and -not (Test-Path $TwingateCompose)) {
    Add-ManualAction "Add infrastructure\\twingate\\docker-compose.yml if the Twingate connector should be managed by ColdStart."
}

Write-StatusConsole -serviceRows $serviceRows -initialResults $initialResults -stabilityResults $stabilityResults

$requiredFailures = @($stabilityResults | Where-Object { $_.Required -and -not $_.Ok })
if ($requiredFailures.Count -gt 0) {
    Write-Host ""
    Write-Host "  Startup completed, but required checks are still failing." -ForegroundColor Yellow
    Write-Host "  Inspect the launched service windows and the manual-action lines above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Shared app      http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "  Omni app        http://127.0.0.1:5174" -ForegroundColor Cyan
Write-Host "  Backend         http://127.0.0.1:8742" -ForegroundColor DarkGray
Write-Host "  Oracle site     http://127.0.0.1:8742/sites/oracle/" -ForegroundColor DarkGray
Write-Host "  Omni site       http://127.0.0.1:8742/sites/omni/" -ForegroundColor DarkGray
Write-Host "  Grid site       http://127.0.0.1:8742/sites/grid/" -ForegroundColor DarkGray
Write-Host "  Invincible site http://127.0.0.1:8742/sites/invincible/" -ForegroundColor DarkGray
Write-Host "  Omni build      http://127.0.0.1:8742/omni/" -ForegroundColor DarkGray
Write-Host "  Windows dl      http://127.0.0.1:8742/download/windows" -ForegroundColor DarkGray
Write-Host "  Sentinel        http://127.0.0.1:9999/heartbeat" -ForegroundColor DarkGray
Write-Host ""
if ($env:INVINCIBLE_COLDSTART_NONINTERACTIVE -ne "1") {
    Read-Host "  Press Enter to close this launcher window"
}
