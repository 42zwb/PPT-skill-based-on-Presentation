[CmdletBinding()]
param(
    [string]$SourceSkillPath = (Join-Path $env:USERPROFILE ".codex\skills\presentation-polish"),
    [string]$CommitMessage = "sync: update presentation-polish skill",
    [string]$Branch = "main",
    [string]$GitProxy = "",
    [switch]$SkipPush,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$destinationSkillPath = Join-Path $repoRoot "skills\presentation-polish"

if (-not (Test-Path -Path $SourceSkillPath -PathType Container)) {
    throw "Source skill directory not found: $SourceSkillPath"
}
if (-not (Test-Path -Path (Join-Path $SourceSkillPath "SKILL.md") -PathType Leaf)) {
    throw "Source directory is not a valid skill: missing SKILL.md"
}
if (-not (Test-Path -Path (Join-Path $repoRoot ".git") -PathType Container)) {
    throw "Repository metadata not found under: $repoRoot"
}

function Resolve-GitProxy {
    if ($GitProxy) {
        return $GitProxy
    }

    $configured = & git -C $repoRoot config --get http.proxy 2>$null
    if ($LASTEXITCODE -eq 0 -and $configured) {
        return ($configured | Select-Object -First 1)
    }

    $internetSettings = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction SilentlyContinue
    if ($internetSettings.ProxyEnable -eq 1 -and $internetSettings.ProxyServer) {
        $server = [string]$internetSettings.ProxyServer
        if ($server -match "^[a-z]+://") {
            return $server
        }
        return "http://$server"
    }

    return ""
}

function Invoke-GitChecked {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $proxy = Resolve-GitProxy
    $prefix = @()
    if ($proxy) {
        $prefix = @("-c", "http.proxy=$proxy")
    }

    & git @prefix -C $repoRoot @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BasePath,
        [Parameter(Mandatory = $true)]
        [string]$ChildPath
    )

    $base = [System.IO.Path]::GetFullPath($BasePath).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $child = [System.IO.Path]::GetFullPath($ChildPath)
    return $child.Substring($base.Length)
}

if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $destinationSkillPath | Out-Null

    $sourceFiles = Get-ChildItem -Path $SourceSkillPath -File -Recurse | Where-Object {
        $_.FullName -notmatch "[\\/]__pycache__[\\/]" -and $_.Extension -notin @(".pyc", ".pyo")
    }

    foreach ($sourceFile in $sourceFiles) {
        $relative = Get-RelativePath -BasePath $SourceSkillPath -ChildPath $sourceFile.FullName
        $target = Join-Path $destinationSkillPath $relative
        $targetDirectory = Split-Path -Parent $target
        New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
        Copy-Item -Path $sourceFile.FullName -Destination $target -Force
    }

    $sourceRelative = @($sourceFiles | ForEach-Object { Get-RelativePath -BasePath $SourceSkillPath -ChildPath $_.FullName })
    $destinationFiles = Get-ChildItem -Path $destinationSkillPath -File -Recurse
    foreach ($destinationFile in $destinationFiles) {
        $relative = Get-RelativePath -BasePath $destinationSkillPath -ChildPath $destinationFile.FullName
        if ($relative -notin $sourceRelative) {
            Remove-Item -Path $destinationFile.FullName -Force
        }
    }
}

$status = & git -C $repoRoot status --short
if (-not $status) {
    Write-Output "No changes to commit. Repository is already synchronized."
    exit 0
}

Write-Output $status
if ($DryRun) {
    Write-Output "Dry run: no commit or push performed."
    exit 0
}

Invoke-GitChecked -Arguments @("add", "--all")
Invoke-GitChecked -Arguments @("commit", "-m", $CommitMessage)

if (-not $SkipPush) {
    Invoke-GitChecked -Arguments @("push", "-u", "origin", $Branch)
    Write-Output "Pushed to origin/$Branch."
} else {
    Write-Output "Commit created locally; push skipped."
}
