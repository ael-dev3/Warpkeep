# Credential-free local network integration test. Never registers a runner.
$ErrorActionPreference = 'Stop'
$taskSuffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$taskInternal = "warpkeep-egress-test-in-$taskSuffix"
$taskExternal = "warpkeep-egress-test-out-$taskSuffix"
$taskProxy = "warpkeep-egress-test-proxy-$taskSuffix"
$taskRunnerImage = 'sha256:4d90dea1fe43cf3bd2f4f6e3b319ae42cf72cce2f299d256f8e52fa44632cf5c'
$taskProxyImage = 'sha256:59a9b5038312c48ee4a787da0db7f81c1c1d48f74e070eece79b05db3a23c0ec'
$taskNetworks = [System.Collections.Generic.List[string]]::new()
$taskProxyCreated = $false

function Invoke-TaskDocker {
    param([string[]]$DockerArgs)
    $taskOutput = & wsl -d Ubuntu-24.04 --exec docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker test command failed: $($DockerArgs[0])" }
    return $taskOutput
}

function Invoke-TaskProbe {
    param([string]$Script, [string[]]$ModeArgs = @(), [string]$Address = '172.30.240.3')
    Get-Content -Raw (Join-Path $PSScriptRoot $Script) |
        & wsl -d Ubuntu-24.04 --exec docker run --rm --interactive --network $taskInternal --ip $Address --dns 127.0.0.1 --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 --entrypoint /usr/bin/python3 $taskRunnerImage - @ModeArgs
    if ($LASTEXITCODE -ne 0) { throw "Network probe failed: $Script" }
}

try {
    Invoke-TaskDocker @('image', 'inspect', $taskRunnerImage, $taskProxyImage, '--format', '{{.Id}}')
    Invoke-TaskDocker @('network', 'create', '--internal', '--subnet', '172.30.240.0/29', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated', '--label', "com.warpkeep.test=$taskSuffix", $taskInternal)
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
        Invoke-TaskDocker @('network', 'connect', '--ip', '172.30.240.2', '--alias', 'warpkeep-egress', $taskInternal, $taskProxy)
        Invoke-TaskDocker @('start', $taskProxy)
        # Bounded readiness retries only: never retry a failed acceptance test.
        Invoke-TaskProbe 'proxy-smoke.py' @('--ready')
        if ($taskPrivateAddress) { Invoke-TaskProbe 'proxy-smoke.py' @('--private-resolution') }
        else {
            # Inspect actual kernel listeners in the proxy namespace. No host
            # namespace, mount, credential, or additional capability is supplied.
            Get-Content -Raw (Join-Path $PSScriptRoot 'proxy-listener-smoke.py') |
                & wsl -d Ubuntu-24.04 --exec docker run --rm --interactive --network "container:$taskProxy" --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 --entrypoint /usr/bin/python3 $taskRunnerImage -
            if ($LASTEXITCODE -ne 0) { throw 'Proxy listener probe failed' }
            Invoke-TaskProbe 'proxy-smoke.py' @('--unauthorized-client') '172.30.240.4'
            Invoke-TaskProbe 'network-smoke.py'
            Invoke-TaskProbe 'proxy-smoke.py'
            Get-Content -Raw (Join-Path $PSScriptRoot 'node-proxy-smoke.mjs') |
                & wsl -d Ubuntu-24.04 --exec docker run --rm --interactive --network $taskInternal --ip 172.30.240.3 --dns 127.0.0.1 --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 --env HTTPS_PROXY=http://172.30.240.2:3128 --env NO_PROXY= --entrypoint /opt/node-v22.22.3-linux-x64/bin/node $taskRunnerImage --use-env-proxy --input-type=module -
            if ($LASTEXITCODE -ne 0) { throw 'Pinned Node proxy probe failed' }
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
