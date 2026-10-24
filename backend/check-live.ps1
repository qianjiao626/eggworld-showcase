# check-live.ps1 —— 与线上版本的同步自检（只读，不做任何修改）
#
# 核对三处锚点是否一致：
#   ① 线上版本   GET https://dsxnb.com/api/health → data.gitSha
#   ② 版本锚点   最近一个 release/* tag 指向的 commit
#   ③ 发布总账   releases/发布记录.md 是否记载该 gitSha
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File backend\check-live.ps1
#
# 建议先执行 git fetch --all --tags，否则本地 origin/* 可能过期（本脚本不自动 fetch）。
# 退出码：0 = 三处锚点一致；1 = 存在不一致；2 = 线上 gitSha 在本仓库中不存在（无法计算基线）
# 规范见 PROJECT_RULES.md 2.6；命令说明见 releases/上线文档.md 第二节第 0 步。

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = 'https://dsxnb.com/api/health'
$recordsFile = Join-Path $repoRoot 'releases\发布记录.md'

function Show-Field([string]$label, [string]$value) {
    Write-Host ('  {0,-16}{1}' -f $label, $value)
}

# git 子命令向 stderr 写内容时，在 $ErrorActionPreference='Stop' 下会中断整个脚本
# （典型场景：线上 gitSha 不在本地对象库 → "malformed object name"）。
# 统一用本函数包裹，只通过退出码判断成败，不因 stderr 中断。
function Invoke-Git([string[]]$gitArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & git @gitArgs 2>$null
    $script:GitExitCode = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return $out
}

Write-Host ''
Write-Host '=== 与线上版本的同步自检 ===' -ForegroundColor Cyan

# ---------- ① 线上版本 ----------
Write-Host ''
Write-Host '[1/3] 线上版本' -ForegroundColor Cyan
# 注意：PowerShell 5.1 的 Invoke-RestMethod 在响应未声明 charset 时会按非 UTF-8 解码，
# 导致 /api/health 里的中文 version 乱码；故优先用 curl.exe 取原始字节、按 UTF-8 自行解码。
$liveSha = ''
$tmpJson = Join-Path $env:TEMP ('check-live-{0}.json' -f $PID)
try {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -s --max-time 20 -o $tmpJson $healthUrl | Out-Null
        $rawText = [System.IO.File]::ReadAllText($tmpJson, [System.Text.UTF8Encoding]::new($false))
        $resp = $rawText | ConvertFrom-Json
    } else {
        $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 20
    }
    $liveSha = [string]$resp.data.gitSha
    Show-Field 'version' ([string]$resp.data.version)
    Show-Field 'gitSha' $liveSha
    Show-Field 'buildTime' ([string]$resp.data.buildTime)
    if ([string]::IsNullOrWhiteSpace($liveSha)) {
        Write-Host '  ! /api/health 未返回 gitSha：线上 jar 未注入版本信息' -ForegroundColor Yellow
    }
} catch {
    Write-Host ('  X 无法访问 {0}' -f $healthUrl) -ForegroundColor Red
    Write-Host ('    {0}' -f $_.Exception.Message) -ForegroundColor DarkGray
    Write-Host '    （若提示连接被重置，通常是本机需要走代理；本脚本不修改任何网络配置）' -ForegroundColor DarkGray
} finally {
    if (Test-Path $tmpJson) { Remove-Item $tmpJson -Force -ErrorAction SilentlyContinue }
}

Push-Location $repoRoot
try {
    # ---------- ② 版本锚点 ----------
    Write-Host ''
    Write-Host '[2/3] 版本锚点（最近一个 release/* tag）' -ForegroundColor Cyan
    $tag = (git tag -l 'release/*' --sort=-creatordate | Select-Object -First 1)
    $tagSha = ''
    $liveKnown = $false
    if ([string]::IsNullOrWhiteSpace($tag)) {
        Write-Host '  X 本地没有任何 release/* tag：增量打包无法确定基线' -ForegroundColor Red
    } else {
        $tagSha = (git log -1 --format='%H' $tag).Trim()
        Show-Field 'tag' $tag
        Show-Field 'commit' $tagSha.Substring(0, 7)
        if ($liveSha) {
            # 线上 gitSha 可能根本不在本地对象库：发布方用未推送的提交构建上传过
            $null = Invoke-Git @('cat-file', '-e', "$liveSha^{commit}")
            $liveKnown = ($script:GitExitCode -eq 0)
            if (-not $liveKnown) {
                Write-Host '  X 线上 gitSha 在本仓库中不存在：发布方未推送该提交（或本地未 fetch 到）' -ForegroundColor Red
                Write-Host '    → 无法计算增量基线；按 PROJECT_RULES 2.6.3 请发布方补推提交并补 tag' -ForegroundColor Red
                Write-Host '    → 补齐之前不要打包上线，否则变更 / 删除清单会算错' -ForegroundColor Red
            } else {
                $tagsWithLive = @(Invoke-Git @('tag', '-l', 'release/*', '--contains', $liveSha))
                if ($tagsWithLive.Count -gt 0) {
                    Show-Field '线上 gitSha 落在' ($tagsWithLive -join ', ')
                } else {
                    Write-Host '  ! 线上 gitSha 不在任何 release/* tag 上：打包必须显式 -Base（PROJECT_RULES 2.6.2）' -ForegroundColor Yellow
                }
            }
        }
    }

    # ---------- ③ 发布总账 ----------
    Write-Host ''
    Write-Host '[3/3] 发布总账（releases/发布记录.md）' -ForegroundColor Cyan
    $recorded = $false
    if ($liveSha) {
        $recorded = (Select-String -Path $recordsFile -Pattern $liveSha -SimpleMatch -Quiet) -eq $true
    }
    if ($recorded) {
        Show-Field '记载' ('已记录 ' + $liveSha)
    } else {
        Write-Host ('  ! 发布记录.md 中找不到 {0}：他人发布未回收，或线上被手工改过（PROJECT_RULES 2.6.3）' -f $liveSha) -ForegroundColor Yellow
    }

    # ---------- 附：本地工作区 ----------
    Write-Host ''
    Write-Host '[附] 本地工作区' -ForegroundColor Cyan
    $dirtyCount = @(git status --porcelain).Count
    if ($dirtyCount -eq 0) {
        Show-Field '状态' '干净'
    } else {
        Write-Host ('  ! 有 {0} 项未提交改动：上线打包要求工作区干净，否则 jar 内 gitSha 会带 -dirty' -f $dirtyCount) -ForegroundColor Yellow
    }

    # ---------- 结论 ----------
    Write-Host ''
    if ($liveSha -and -not $liveKnown) {
        Write-Host '结论：线上版本未同步到本地 - 线上 gitSha 在本仓库中不存在。' -ForegroundColor Red
        Write-Host '  处置（PROJECT_RULES 2.6.3）：请发布方把该提交推送到远端并补 release/* tag；' -ForegroundColor Red
        Write-Host '  在补齐之前不要打包上线（增量基线不可信）。' -ForegroundColor Red
        exit 2
    }
    $tagMatchesLive = ($tagSha -and $liveSha -and $tagSha.StartsWith($liveSha))
    if ($liveSha -and $tagMatchesLive -and $recorded) {
        Write-Host '结论：三处锚点一致 - 线上 = 最近 tag = 发布记录。' -ForegroundColor Green
        if ($dirtyCount -gt 0) {
            Write-Host '  提醒：工作区有未提交改动；上线打包前必须先 commit（否则 jar 内 gitSha 会带 -dirty）。' -ForegroundColor Yellow
        }
        exit 0
    }
    Write-Host '结论：存在不一致 - 先按 PROJECT_RULES.md 2.6 处理，不要直接开工或上线。' -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
