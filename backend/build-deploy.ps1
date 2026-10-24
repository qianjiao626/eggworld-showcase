# ============================================================
# 蛋蛋世界 · 增量部署包生成脚本（本地 Windows 执行）
#
# 作用：对比 git 变更，把「本次要上传的文件」拷进
#       releases/deploy/<Name>/，目录结构与服务器上传路径一一对应：
#         backend/eggworld.jar    ->  /home/xiaos/eggworld/eggworld.jar
#         frontend/index.html     ->  /home/xiaos/eggworld/xs/index.html
#         frontend/js/xxx.js      ->  /home/xiaos/eggworld/xs/js/xxx.js
#         frontend/assets/xxx.jpg ->  /home/xiaos/eggworld/xs/assets/xxx.jpg
#       同时生成「部署说明.md」：上传命令 + 本次删除的文件清单。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File backend\build-deploy.ps1 -Name 2026-09-13_用户管理改密
#
# 参数：
#   -Name       本次上线名称（建议与迁移文档同名，用于生成目录名，同时注入 jar 作为版本号）
#   -Base       对比基准 ref。默认自动取「最近一个 release/* tag」= 线上正在运行的版本，
#               从而精确算出「本次要传什么」；无 tag（首次引导）或特例时显式传入。
#   -TagPrefix  release tag 前缀，默认 release/
#   -MainRemote 主远端名，默认 gitee（2026-09-23 起仓库主远端为 Gitee；该远端找不到 main 时回退 origin）
#   -Jdk17Home  本机 JDK17 目录（默认 D:\env\jdk\jdk17）
#   -AllowNonMain  放行「HEAD 不是 <主远端>/main」，默认拒绝（版本号会带 -notmain）
#   -AllowDirty    放行「工作区不干净」，默认拒绝（版本号会带 -dirty）
#
# 版本注入：jar 内置 build-info.properties（version=本次上线名 / gitSha=当前 commit / buildTime），
#           线上可用 GET /api/health 自查；该文件打包后自动删除，不入库。
#
# 规则：
#   · 来源校验：HEAD 必须 = <主远端，默认 gitee>/main 且工作区干净，否则拒绝打包（可用 -AllowNonMain / -AllowDirty 显式放行）；
#               打包后自动核对 jar 内 build-info 与构建来源一致
#   · 后端：backend/src/main/**、backend/src/main/resources/**、backend/pom.xml 有变更 → 重新打包 jar
#   · 前端：只复制本次变更/新增的文件；growth-schoolv3.html 自动改名为 index.html
#   · 删除：git 检测到的删除写入「部署说明.md」，需在迁移文档中登记并在服务器删除
#   · 不打包：docs / releases / tasks / TODO / README / backend/src/test 等非部署物
#   · 另行提示：backend/sql/*.sql（数据库脚本）、backend/deploy/*.conf（nginx）不会进入部署包
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Base = '',
    [string]$TagPrefix = 'release/',
    [string]$MainRemote = 'gitee',
    [string]$Jdk17Home = 'D:\env\jdk\jdk17',
    [switch]$AllowNonMain,
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'

$backend  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $backend
$outDir   = Join-Path $repoRoot (Join-Path 'releases\deploy' $Name)

function Invoke-Git([string[]]$GitArgs) {
    $out = & git -c core.quotepath=false @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') 执行失败（exit=$LASTEXITCODE）" }
    return @($out)
}

# ---------- 0) 发布来源校验（防呆：2026-09-18 事故根因 = 从开发分支 + 脏工作区打包） ----------
Invoke-Git @('rev-parse', '--git-dir') | Out-Null

$curBranch = (& git -c core.quotepath=false rev-parse --abbrev-ref HEAD).Trim()
$curHead   = (& git -c core.quotepath=false rev-parse HEAD).Trim()
# 判定基准取「主远端/main」，不写死 origin/main：2026-09-23 仓库主远端已切到 gitee，
# 写死会让这道防呆检查在每次打包时误报（本地 main 已是合并后的最新，而 origin/main 还停在迁移前）。
# 主远端找不到 main 时回退 origin，保持对旧环境的兼容。
$mainRemote = $MainRemote
$remoteMain = ''
try { $remoteMain = (& git -c core.quotepath=false rev-parse "$mainRemote/main" 2>$null | Select-Object -First 1).Trim() } catch { }
if (-not $remoteMain -and $mainRemote -ne 'origin') {
    try {
        $remoteMain = (& git -c core.quotepath=false rev-parse 'origin/main' 2>$null | Select-Object -First 1).Trim()
        if ($remoteMain) { $mainRemote = 'origin' }
    } catch { }
}
if (-not $remoteMain) { throw "找不到 $MainRemote/main（回退 origin/main 也没有），请先执行 git fetch --all 再打包。" }

Write-Host "==> 打包来源：分支 $curBranch / HEAD $($curHead.Substring(0,7)) / $mainRemote/main $($remoteMain.Substring(0,7))"

if ($curHead -ne $remoteMain) {
    if (-not $AllowNonMain) {
        $nl = [Environment]::NewLine
        throw ("HEAD 不是 $mainRemote/main，拒绝打包。" + $nl +
               '  2026-09-18 事故就是这种情形：在开发分支 fix/admin-api-500 的 1236ec0 上打包，' + $nl +
               '  该提交虽已并入 main，却不含 main 后续的修复（如 8e7ec22 成就系统抽离下线），' + $nl +
               '  结果把 main 已经修掉的缺表问题又带回线上（登录接口 500）。' + $nl +
               "  正确做法：git checkout main ; git pull（主远端 $mainRemote），确认 PR 已合并后再打包。" + $nl +
               '  确属特例请显式加 -AllowNonMain（版本号会带 -notmain 便于事后识别）。')
    }
    Write-Host "  ⚠ 已用 -AllowNonMain 放行：HEAD 不等于 $mainRemote/main，版本号将带 -notmain" -ForegroundColor Yellow
}

$dirtyLines = @(& git -c core.quotepath=false status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'git status 执行失败' }
if ($dirtyLines.Count -gt 0) {
    if (-not $AllowDirty) {
        Write-Host '工作区存在下列改动：'
        $dirtyLines | ForEach-Object { Write-Host ('    ' + $_) }
        throw '工作区不干净，拒绝打包（否则 jar 内 gitSha 带 -dirty，可能夹带未提交改动）。请先提交或清理；确需放行请加 -AllowDirty。'
    }
    Write-Host '  ⚠ 已用 -AllowDirty 放行：工作区不干净，版本号将带 -dirty' -ForegroundColor Yellow
}

# ---------- 0.1) 解析对比基准 ----------
if (-not $Base) {
    # 默认以上一个 release tag 为基准 = 线上正在运行的版本
    $tag = & git -c core.quotepath=false describe --tags --abbrev=0 --match "$TagPrefix*" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $tag) {
        throw "未找到任何 '$TagPrefix*' tag，无法自动确定基准。请显式传 -Base <ref>（首次引导可传上一个已上线的 commit）。"
    }
    $Base = $tag.Trim()
}
Write-Host "==> 对比基准：$Base"

# ---------- 1) 收集变更 ----------
$trackedRaw   = Invoke-Git @('diff', '--name-status', '-M', $Base)
$untrackedRaw = Invoke-Git @('ls-files', '--others', '--exclude-standard')

$changed = New-Object System.Collections.Generic.HashSet[string]
$deleted = New-Object System.Collections.Generic.List[string]

# 未跟踪文件 = 本次新增
foreach ($p in $untrackedRaw) { if ($p -and $p.Trim()) { [void]$changed.Add($p.Trim()) } }

# 已跟踪文件 = A/M/D/R
foreach ($line in $trackedRaw) {
    if (-not $line -or -not $line.Trim()) { continue }
    $parts = $line -split "`t"
    $st = $parts[0]
    if ($st -like 'R*' -or $st -like 'C*') {
        [void]$changed.Add($parts[2])
        $deleted.Add($parts[1])          # 重命名 = 旧路径要在服务器删除
    } elseif ($st -eq 'D') {
        $deleted.Add($parts[1])
    } else {
        [void]$changed.Add($parts[1])
    }
}

# ---------- 2) 分类 ----------
$frontendFiles  = New-Object System.Collections.Generic.List[hashtable]  # @{ src; dest }
$backendChanged = $false
$resumeChanged  = $false   # resume/ 源码有变更 → 重新静态导出并整包替换 frontend/rs/
$sqlFiles       = New-Object System.Collections.Generic.List[string]
$confFiles      = New-Object System.Collections.Generic.List[string]
$deletedWeb     = New-Object System.Collections.Generic.List[string]     # 需在服务器删除的前端文件
$deletedOther   = New-Object System.Collections.Generic.List[string]

function Add-Frontend([string]$src, [string]$dest) {
    $frontendFiles.Add(@{ src = $src; dest = $dest })
}

foreach ($p in $changed) {
    if ($p -like 'backend/src/main/*' -or $p -eq 'backend/pom.xml') {
        $backendChanged = $true
    } elseif ($p -like 'backend/sql/*') {
        $sqlFiles.Add($p)
    } elseif ($p -like 'backend/deploy/*' -and $p -notlike '*.deprecated') {
        $confFiles.Add($p)
    } elseif ($p -eq 'growth-schoolv3.html') {
        Add-Frontend $p 'index.html'
    } elseif ($p -like 'resume/*') {
        # 简历子模块：静态导出后是整目录产物（文件带 hash），不能按单文件增量
        $resumeChanged = $true
    } elseif ($p -like 'js/*' -or $p -like '*.jpg' -or $p -like '*.png') {
        Add-Frontend $p $p
    }
    # 其余（releases/ tasks/ TODO/ README/ 测试文件/ 构建脚本等）不参与部署
}

foreach ($p in $deleted) {
    if ($p -eq 'growth-schoolv3.html' -or $p -like 'js/*' -or $p -like '*.jpg' -or $p -like '*.png') {
        $deletedWeb.Add($p)
    } else {
        $deletedOther.Add($p)
    }
}

# ---------- 2.1) 外联资源版本号：本次变更的 js/css 自动升版 ----------
# 主站 index.html 是 no-cache，但 js/css 走 7 天缓存；靠人工改 ?v= 会漏（2026-10-21 用户看不到新版即此因）。
# 这里用当前 commit 短 SHA 作版本串，只替换本次变更的文件；未变更文件保持原 URL 继续命中缓存。
$assetVer = (& git -c core.quotepath=false rev-parse --short HEAD).Trim()
$changedAssets = @($frontendFiles | Where-Object { $_.dest -like 'js/*' -and ($_.dest -like '*.js' -or $_.dest -like '*.css') })
if ($changedAssets.Count -gt 0) {
    # 只改 js、没改 HTML 时线上 index.html 不会变，旧版本号仍指向旧文件 → 必须把入口一起打包
    if (-not ($frontendFiles | Where-Object { $_.dest -eq 'index.html' })) {
        Add-Frontend 'growth-schoolv3.html' 'index.html'
    }
    Write-Host "==> 外联资源升版：$($changedAssets.Count) 个文件 → ?v=$assetVer"
}

# ---------- 3) 准备输出目录（清空重来，避免残留上次文件） ----------
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# ---------- 4) 后端：注入版本信息 + 重新打包 jar ----------
$jarProduced = $false
if ($backendChanged) {
    Write-Host "==> 检测到后端变更，使用 JDK17 重新打包：$Jdk17Home"
    if (-not (Test-Path $Jdk17Home)) { throw "未找到 JDK17：$Jdk17Home（可加参数 -Jdk17Home 指定）" }

    # 注入 build-info.properties（打包后删除；文件已在 .gitignore 忽略，不入库）
    $buildSha = (& git rev-parse --short HEAD).Trim()
    if ($curHead -ne $remoteMain) { $buildSha = "$buildSha-notmain" }
    if ($dirtyLines.Count -gt 0) { $buildSha = "$buildSha-dirty" }
    $buildTime = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $buildInfoFile = Join-Path $backend 'src\main\resources\build-info.properties'
    $buildInfoLines = @("version=$Name", "gitSha=$buildSha", "buildTime=$buildTime")
    [System.IO.File]::WriteAllLines($buildInfoFile, $buildInfoLines, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "==> 注入版本信息：version=$Name  gitSha=$buildSha"

    $env:JAVA_HOME = $Jdk17Home
    Push-Location $backend
    try {
        mvn -q clean package -DskipTests
        if ($LASTEXITCODE -ne 0) { throw "Maven 打包失败（exit code = $LASTEXITCODE），请检查上方日志" }
    }
    finally {
        Pop-Location
        if (Test-Path $buildInfoFile) { Remove-Item $buildInfoFile -Force }
    }

    $jar = Get-ChildItem (Join-Path $backend 'target') -Filter '*.jar' |
           Where-Object { $_.Name -notmatch 'original|sources|javadoc' } |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $jar) { throw '未找到打包产物 target/*.jar' }

    # 自检：jar 内 build-info 必须与本次构建来源一致（防止打错来源 / 打错包）
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($jar.FullName)
    try {
        $entry = @($zip.Entries | Where-Object { $_.FullName -eq 'BOOT-INF/classes/build-info.properties' })[0]
        if (-not $entry) { throw 'jar 内未找到 BOOT-INF/classes/build-info.properties，无法自检版本来源' }
        $reader = New-Object System.IO.StreamReader($entry.Open())
        $jarInfo = $reader.ReadToEnd()
        $reader.Close()
    }
    finally {
        $zip.Dispose()
    }
    $jarSha = (($jarInfo -split "`n" | Where-Object { $_ -match '^gitSha=' }) -replace '^gitSha=', '').Trim()
    if ($jarSha -ne $buildSha) {
        throw "自检失败：jar 内 gitSha=$jarSha，与本次构建来源 $buildSha 不一致，部署包不可用。"
    }
    Write-Host "==> 自检通过：jar 内 gitSha=$jarSha 与构建来源一致"

    $outBackend = Join-Path $outDir 'backend'
    New-Item -ItemType Directory -Force -Path $outBackend | Out-Null
    Copy-Item $jar.FullName (Join-Path $outBackend 'eggworld.jar') -Force
    $jarProduced = $true
}

# ---------- 5) 前端：只拷本次变更/新增 ----------
foreach ($f in $frontendFiles) {
    $srcPath = Join-Path $repoRoot $f.src
    if (-not (Test-Path $srcPath)) { Write-Host "  [跳过] 文件不存在：$($f.src)"; continue }
    $destPath = Join-Path (Join-Path $outDir 'frontend') $f.dest
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destPath) | Out-Null
    Copy-Item $srcPath $destPath -Force
}

# ---------- 5.0) 给包内 index.html 中本次变更的 js/css 替换版本串（只改部署包，不改仓库源码） ----------
if ($changedAssets.Count -gt 0) {
    $indexOut = Join-Path (Join-Path $outDir 'frontend') 'index.html'
    if (-not (Test-Path $indexOut)) { throw '外联资源升版失败：部署包内缺少 frontend/index.html' }
    $html = [System.IO.File]::ReadAllText($indexOut, [System.Text.Encoding]::UTF8)
    foreach ($f in $changedAssets) {
        $esc = [regex]::Escape($f.dest)
        $withVer = $f.dest + '?v=' + $assetVer
        # 只改 src= / href= 属性，避免误伤注释与正文里出现的文件名
        $attr = '((?:src|href)=["''])' + $esc
        # 已有 ?v= 的引用：替换版本串
        $html = [regex]::Replace($html, $attr + '\?v=[^"'']*', '$1' + $withVer)
        # 漏写 ?v= 的引用：补上
        $html = [regex]::Replace($html, $attr + '(?=["''])', '$1' + $withVer)
    }
    [System.IO.File]::WriteAllText($indexOut, $html, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------- 5.1) 简历子模块：静态导出 + 整包替换 frontend/rs/ ----------
$resumeBundled = $false
if ($resumeChanged) {
    $resumeDir = Join-Path $repoRoot 'resume'
    if (-not (Test-Path $resumeDir)) { throw "缺少简历子模块目录：$resumeDir" }
    Push-Location $resumeDir
    try {
        if (-not (Test-Path 'node_modules')) {
            Write-Host '==> 简历子模块首次构建，安装依赖 npm ci ...'
            npm ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "简历子模块依赖安装失败（exit code = $LASTEXITCODE）" }
        }
        Write-Host '==> 简历子模块静态导出 npm run build ...'
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "简历子模块构建失败（exit code = $LASTEXITCODE）" }
    }
    finally { Pop-Location }
    if (-not (Test-Path (Join-Path $resumeDir 'out\index.html'))) { throw '简历子模块构建产物缺失：resume\out\index.html' }
    $rsDest = Join-Path (Join-Path $outDir 'frontend') 'rs'
    if (Test-Path $rsDest) { Remove-Item -Recurse -Force $rsDest }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $rsDest) | Out-Null
    Copy-Item (Join-Path $resumeDir 'out') $rsDest -Recurse -Force
    $resumeBundled = $true
}

# ---------- 6) 生成部署说明 ----------
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# 部署包 · $Name")
$lines.Add('')
$lines.Add("- 生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("- 对比基准：$Base")
$lines.Add("- 外联资源版本号：$(if ($changedAssets.Count -gt 0) { "本次变更的 $($changedAssets.Count) 个 js/css 已替换为 ?v=$assetVer（入口 index.html 一并打包）" } else { '本次无 js/css 变更，未替换' })")
$lines.Add("- 包含后端 jar：$(if ($jarProduced) { '是' } else { '否（本次后端无变更）' })")
$lines.Add('')
$lines.Add('## 一、包内文件与上传目标')
$lines.Add('')
$lines.Add('| 包内路径 | 服务器目标 |')
$lines.Add('|---|---|')
if ($jarProduced) { $lines.Add('| `backend/eggworld.jar` | `/home/xiaos/eggworld/eggworld.jar` |') }
foreach ($f in $frontendFiles) {
    $lines.Add('| `frontend/' + $f.dest + '` | `/home/xiaos/eggworld/xs/' + $f.dest + '` |')
}
if ($resumeBundled) { $lines.Add('| `frontend/rs/`（整个目录） | `/home/xiaos/eggworld/xs/rs/` |') }
if (-not $jarProduced -and $frontendFiles.Count -eq 0 -and -not $resumeBundled) { $lines.Add('| （无） | — |') }
$lines.Add('')
$lines.Add('## 二、上传命令')
$lines.Add('')
$lines.Add('```bash')
if ($jarProduced) {
    $lines.Add('scp releases/deploy/' + $Name + '/backend/eggworld.jar xiaos@dsxnb.com:/home/xiaos/eggworld/eggworld.jar')
}
if ($frontendFiles.Count -gt 0 -or $resumeBundled) {
    $lines.Add('cd releases/deploy/' + $Name + '/frontend && scp -r . xiaos@dsxnb.com:/home/xiaos/eggworld/xs/')
}
$lines.Add('```')
$lines.Add('')
if ($resumeBundled) {
    $lines.Add('> `rs/` 是简历子模块的静态导出整包（文件名带构建 hash），随前端一起上传；')
    $lines.Add('> 服务器上不需要 Node、不需要额外端口和服务，重启 eggworld 即完成发布。旧 hash 残留文件可忽略。')
    $lines.Add('')
}
$lines.Add('## 三、本次删除的文件（需在服务器删除，并在迁移文档中登记）')
$lines.Add('')
if ($deletedWeb.Count -eq 0 -and $deletedOther.Count -eq 0) {
    $lines.Add('无。')
} else {
    foreach ($p in $deletedWeb) {
        $lines.Add('- `' + $p + '`（前端，服务器上删除）：ssh xiaos@dsxnb.com "rm -f /home/xiaos/eggworld/xs/' + $p + '"')
    }
    foreach ($p in $deletedOther) {
        $lines.Add('- `' + $p + '`（非前端，请人工确认处理）')
    }
}
$lines.Add('')
$lines.Add('## 四、未进入部署包、需另行处理的变更')
$lines.Add('')
if ($sqlFiles.Count -eq 0 -and $confFiles.Count -eq 0) {
    $lines.Add('无。')
} else {
    foreach ($p in $sqlFiles)   { $lines.Add('- 数据库脚本：`' + $p + '`（按迁移文档 / docs/迁移计划.md 执行，切勿直接跑 init.sql）') }
    foreach ($p in $confFiles)  { $lines.Add('- nginx/systemd 配置：`' + $p + '`（上传后执行 nginx -t 与 systemctl reload nginx）') }
}
$lines.Add('')
$lines.Add('## 五、上线后')
$lines.Add('')
$lines.Add('```bash')
if ($jarProduced) { $lines.Add("ssh xiaos@dsxnb.com 'systemctl restart eggworld && systemctl status eggworld --no-pager'") }
$lines.Add('curl -s https://dsxnb.com/api/health')
$lines.Add('```')
$lines.Add('')
$lines.Add('> 验证清单见同名迁移文档：`releases/迁移文档/' + $Name + '.md`')

$readme = Join-Path $outDir '部署说明.md'
Set-Content -Path $readme -Value $lines -Encoding UTF8

# ---------- 7) 汇总 ----------
Write-Host ''
Write-Host '===== 部署包已生成 ====='
Get-ChildItem $outDir -Recurse -File |
    Select-Object @{n = '文件'; e = { $_.FullName.Substring($outDir.Length + 1) } },
                  @{n = '大小(KB)'; e = { [math]::Round($_.Length / 1KB) } } |
    Format-Table -AutoSize
Write-Host "输出目录：$outDir"
Write-Host "上传与删除清单见：$readme"
if (-not $jarProduced) { Write-Host '提示：本次后端无变更，未重新打包 jar。' }
if ($resumeBundled) { Write-Host '提示：检测到 resume/ 变更，已重新静态导出并打进 frontend\rs\。' }
if ($frontendFiles.Count -eq 0 -and -not $resumeBundled) { Write-Host '提示：本次前端无变更，部署包内无前端文件。' }
if ($deletedWeb.Count -or $deletedOther.Count) { Write-Host '⚠ 本次存在删除文件，请务必登记到迁移文档并在服务器删除（见部署说明.md）。' }

Write-Host ''
Write-Host '上线验证通过后，记得锚定版本并登记：'
Write-Host ('  git tag -a ' + $TagPrefix + (Get-Date -Format 'yyyy-MM-dd') + ' -m "' + $Name + '"')
Write-Host '  git push origin --tags'
Write-Host '  回填 releases/发布记录.md（版本 / commit / 结果）'
