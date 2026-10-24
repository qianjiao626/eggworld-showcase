# ============================================================
# 蛋蛋世界 · 本地构建 + 自动上传（只上传，不切换线上）
#
# 用法（仓库根目录执行）：
#   powershell -ExecutionPolicy Bypass -File backend\upload-deploy.ps1 -Name "<上线名>" -Base <commit>
#
# 流程：
#   1. 调用 build-deploy.ps1 生成增量部署包（-SkipBuild 可跳过）
#   2. 检查 SSH 免密登录
#   3. 在服务器创建 ~/eggworld/incoming/<上线名>/
#   4. scp 上传 backend/ 与 frontend/（不传“部署说明.md”）
#   5. 打印下一步要在服务器执行的切换命令
#
# 安全边界：
#   · 只写服务器 incoming/<上线名>/，不碰 xs/、jar、数据库
#   · 上传失败即中止，线上保持原样
#   · 中文路径若 scp 编码异常，可改用 Xftp 上传到同一目录
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Base = '',
    [string]$Remote = 'xiaos@dsxnb.com',
    [string]$RemoteRoot = '/home/xiaos/eggworld',
    [switch]$SkipBuild,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$backend  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $backend
$pkg      = Join-Path $repoRoot (Join-Path 'releases\deploy' $Name)
$remoteIncoming = "$RemoteRoot/incoming/$Name"

foreach ($cmd in @('ssh', 'scp')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "未找到 $cmd：请安装 Windows OpenSSH 客户端（设置 → 应用 → 可选功能）"
    }
}

# 1) 构建
if (-not $SkipBuild) {
    $buildArgs = @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $backend 'build-deploy.ps1'), '-Name', $Name)
    if ($Base) { $buildArgs += @('-Base', $Base) }
    & powershell @buildArgs
    if ($LASTEXITCODE -ne 0) { throw 'build-deploy.ps1 执行失败，已中止上传' }
}

if (-not (Test-Path $pkg)) { throw "找不到部署包：$pkg" }

$files = @(Get-ChildItem $pkg -Force | Where-Object { $_.Name -ne '部署说明.md' })
if ($files.Count -eq 0) { throw "部署包为空：$pkg" }

Write-Host "==> 待上传 $($files.Count) 项："
$files | ForEach-Object { Write-Host ("    {0}" -f $_.Name) }

if ($DryRun) {
    Write-Host "[dry-run] ssh $Remote mkdir -p $remoteIncoming"
    Write-Host "[dry-run] scp -r <$($files.Count) 项> ${Remote}:$remoteIncoming/"
    return
}

# 2) SSH 免密检查（BatchMode 下不会弹密码，失败立即返回）
& ssh -o BatchMode=yes -o ConnectTimeout=8 $Remote 'echo OK' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "SSH 免密登录失败：先配置公钥（ssh-keygen，再把公钥加到服务器 ~/.ssh/authorized_keys），或改用 Xftp 上传"
}

# 3) 只创建 incoming 目录
& ssh $Remote "mkdir -p '$remoteIncoming'"
if ($LASTEXITCODE -ne 0) { throw "创建远端目录失败：$remoteIncoming" }

# 4) 上传
$paths = @($files | ForEach-Object { $_.FullName })
& scp -r @paths "${Remote}:$remoteIncoming/"
if ($LASTEXITCODE -ne 0) {
    throw "scp 上传失败。若因中文路径编码问题，请用 Xftp 把包内内容传到 $remoteIncoming/ 后继续"
}

# 5) 远端核对
Write-Host '==> 远端核对'
& ssh $Remote "du -sh '$remoteIncoming'; find '$remoteIncoming' -type f | wc -l"

Write-Host ''
Write-Host '上传完成，线上尚未切换。下一步在服务器执行：'
Write-Host "  $RemoteRoot/ops/remote-deploy.sh '$Name'"
Write-Host ''
Write-Host '如需先备份，在服务器执行：'
Write-Host "  $RemoteRoot/ops/backup.sh '$Name'"
