# Credential-free local network integration test. Never registers a runner.
$ErrorActionPreference = 'Stop'
$taskSuffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$taskInternal = "warpkeep-egress-test-in-$taskSuffix"
$taskExternal = "warpkeep-egress-test-out-$taskSuffix"
$taskProxy = "warpkeep-egress-test-proxy-$taskSuffix"
$taskRunnerImage = 'sha256:5027b7108810a0c601e43a77d9f4b2fefb6757d59c8f0def279dd6c64b4b745c'
$taskProxyImage = 'sha256:ca0567dfc0c47273f7af1522dddf04e135d17a578b5cef7f58b08f4843f99b1b'
$taskNetworks = [System.Collections.Generic.List[string]]::new()
$taskProxyCreated = $false

function Invoke-TaskDocker {
    param([string[]]$DockerArgs)
    $taskOutput = & wsl -d Ubuntu-24.04 --exec docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker test command failed: $($DockerArgs[0])" }
    return $taskOutput
}

function Invoke-TaskProbe {
    param([string]$Script, [string[]]$ModeArgs = @())
    Get-Content -Raw (Join-Path $PSScriptRoot $Script) |
        & wsl -d Ubuntu-24.04 --exec docker run --rm --interactive --network $taskInternal --dns 127.0.0.1 --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 --entrypoint /usr/bin/python3 $taskRunnerImage - @ModeArgs
    if ($LASTEXITCODE -ne 0) { throw "Network probe failed: $Script" }
}

try {
    Invoke-TaskDocker @('image', 'inspect', $taskRunnerImage, $taskProxyImage, '--format', '{{.Id}}')
    Invoke-TaskDocker @('network', 'create', '--internal', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated', '--label', "com.warpkeep.test=$taskSuffix", $taskInternal)
    $taskNetworks.Add($taskInternal)
    Invoke-TaskDocker @('network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.enable_icc=false', '--label', "com.warpkeep.test=$taskSuffix", $taskExternal)
    $taskNetworks.Add($taskExternal)

    foreach ($taskPrivateAddress in @('', '127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', 'fd00::1')) {
        $taskCreateArgs = @('create', '--name', $taskProxy, '--label', "com.warpkeep.test=$taskSuffix", '--network', $taskExternal,
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '64', '--memory', '256m', '--cpus', '1',
            '--tmpfs', '/run:mode=1777', '--tmpfs', '/var/log/squid:uid=13,gid=13,mode=0700')
        if ($taskPrivateAddress) { $taskCreateArgs += @('--add-host', "api.github.com=$taskPrivateAddress") }
        Invoke-TaskDocker ($taskCreateArgs + $taskProxyImage)
        $taskProxyCreated = $true
        Invoke-TaskDocker @('network', 'connect', '--alias', 'warpkeep-egress', $taskInternal, $taskProxy)
        Invoke-TaskDocker @('start', $taskProxy)
        # Bounded readiness retries only: never retry a failed acceptance test.
        Invoke-TaskProbe 'proxy-smoke.py' @('--ready')
        if ($taskPrivateAddress) { Invoke-TaskProbe 'proxy-smoke.py' @('--private-resolution') }
        else {
            Invoke-TaskProbe 'network-smoke.py'
            Invoke-TaskProbe 'proxy-smoke.py'
        }
        Invoke-TaskDocker @('stop', '--timeout', '5', $taskProxy)
        if (-not $taskPrivateAddress) {
            Invoke-TaskProbe 'proxy-smoke.py' @('--unavailable')
            Invoke-TaskProbe 'network-smoke.py'
        }
        Invoke-TaskDocker @('rm', $taskProxy)
        $taskProxyCreated = $false
    }
} finally {
    # Only unique resources successfully created by this invocation are removed.
    if ($taskProxyCreated) {
        Invoke-TaskDocker @('stop', '--timeout', '5', $taskProxy)
        Invoke-TaskDocker @('rm', $taskProxy)
    }
    foreach ($taskNetwork in $taskNetworks) { Invoke-TaskDocker @('network', 'rm', $taskNetwork) }
}
