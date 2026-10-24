# ============================================================
# 蛋蛋世界一键打包脚本（本地 Windows 执行）
# 用法：powershell -ExecutionPolicy Bypass -File backend\build-release.ps1
# 可选参数：
#   -Jdk17Home  本机 JDK17 目录（默认 D:\env\sdk\jdk-17）
#   -HtmlFile   前端入口 html（默认项目根 growth-schoolv3.html）
# 产出：backend\release\eggworld.jar  +  backend\release\index.html
# 之后只需把这两个文件上传服务器，再重启服务即可完成发布。
# ============================================================
[CmdletBinding()]
param(
    [string]$Jdk17Home = 'D:\env\jdk\jdk17',
    [string]$HtmlFile = ''
)

$ErrorActionPreference = 'Stop'

# 脚本所在目录即 backend/，据此推出仓库根目录与发布目录
$backend  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $backend
$release  = Join-Path $backend 'release'

if (-not $HtmlFile) { $HtmlFile = Join-Path $repoRoot 'growth-schoolv3.html' }

Write-Host "==> JDK17: $Jdk17Home"
if (-not (Test-Path $Jdk17Home)) { throw "未找到 JDK17：$Jdk17Home（可加参数 -Jdk17Home 指定）" }
if (-not (Test-Path $HtmlFile))  { throw "未找到前端文件：$HtmlFile（可加参数 -HtmlFile 指定）" }

# 1) 用 JDK17 编译打包（本机默认 JAVA_HOME 是 1.8，Spring Boot 3 必须用 17）
$env:JAVA_HOME = $Jdk17Home
Write-Host '==> mvn clean package -DskipTests ...'
Push-Location $backend
try {
    mvn -q clean package -DskipTests
    if ($LASTEXITCODE -ne 0) { throw "Maven 打包失败（exit code = $LASTEXITCODE），请检查上方日志" }
}
finally { Pop-Location }

# 2) 定位可执行 jar（排除 original / sources / javadoc 等附属产物）
$jar = Get-ChildItem (Join-Path $backend 'target') -Filter '*.jar' |
       Where-Object { $_.Name -notmatch 'original|sources|javadoc' } |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $jar) { throw '未找到打包产物 target/*.jar' }

# 3) 按服务器约定文件名复制到 release/（eggworld.jar 与 index.html 即全部要上传的内容）
New-Item -ItemType Directory -Force -Path $release | Out-Null
Copy-Item $jar.FullName (Join-Path $release 'eggworld.jar') -Force
Copy-Item $HtmlFile    (Join-Path $release 'index.html')     -Force

# 3.1) 前端外联资源（新手引导/记住我/解锁角色/开屏弹窗/用户管理/吐槽改分/工单/学校名单/管理后台工作台）
#      统一放在仓库根目录的 js/ 下；打包时保持同名子目录，上传后对应服务器 /home/xiaos/eggworld/xs/js/
#      ⚠️ 新增外联文件时必须同步加进下面的清单，否则线上少文件（bl-schools.js 缺失会导致 BL_SCHOOLS 未定义，
#         黑榜页搜索/选校与注册页学校联想全部报错；admin-workbench.js 或 chart.umd.min.js 缺失会导致
#         管理员工作台不渲染图表）
$extDir = Join-Path $release 'js'
New-Item -ItemType Directory -Force -Path $extDir | Out-Null
foreach ($ext in @('onboarding-guide.js', 'onboarding-guide.css', 'login-remember.js', 'unlock-character.js', 'info-popup.js', 'user-actions.js', 'profile-mbti.js', 'career-test.js', 'pet-system.js', 'cat-system.js', 'cat-cabin-bridge.js', 'student-workshop.js', 'student-workshop.css', 'pet-data.js', 'pet-engine.js', 'pet-renderer.js', 'pet-ui.js', 'cat-chat.js', 'pet-module.css', 'cat-cabin.css', 'complaint-edit.js', 'feedback-center.js', 'feedback-admin.js', 'bl-schools.js', 'dormitory-facts.js', 'dormitory.js', 'admin-workbench.js', 'admin-permissions.js', 'admin-task-manage.js', 'admin-settings.js', 'cowork-workbench.js', 'achievement-page.css', 'achievement-page.js', 'deco.css', 'deco.js', 'deco-integration.js', 'chart.umd.min.js', 'pk-module.js', 'plaza-mobile.css', 'plaza-swipe.js', 'publish-mobile.css', 'publish-mobile.js', 'mytasks-mobile.css', 'mytasks-mobile.js', 'task-detail-modal.css', 'task-detail-modal.js', 'chatroom.css', 'chatroom.js', 'chatroom-admin.css', 'chatroom-admin.js', 'announcements.css', 'announcements.js', 'gossip-reports.css', 'gossip-reports.js', 'vendor/sockjs.min.js', 'vendor/stomp.umd.min.js')) {
    $src = Join-Path $repoRoot (Join-Path 'js' $ext)
    if (-not (Test-Path $src)) { throw "缺少前端外联文件：js\$ext" }
    Copy-Item $src (Join-Path $extDir $ext) -Force
}

# 4) 简历子模块（resume/）：静态导出后整包拷进 release\rs\
#    由 nginx 当静态文件直接发（服务器 /home/xiaos/eggworld/xs/rs/），没有独立进程，
#    也不需要单独启动 —— 重启 eggworld 即全部完成。改了 resume/ 源码就要重新跑本脚本。
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
$rsDir = Join-Path $release 'rs'
if (Test-Path $rsDir) { Remove-Item -Recurse -Force $rsDir }
Copy-Item (Join-Path $resumeDir 'out') $rsDir -Recurse -Force

# 5) 汇总提示
Write-Host ''
Write-Host '===== 打包完成 ====='
Get-ChildItem $release -Recurse -File | Select-Object @{n='文件'; e={$_.FullName.Substring($release.Length + 1)}}, @{n='大小(KB)'; e={[math]::Round($_.Length / 1KB)}}, LastWriteTime |
    Format-Table -AutoSize
Write-Host '发布步骤：'
Write-Host "  1) 上传 backend\release\eggworld.jar  -> 服务器 /home/xiaos/eggworld/eggworld.jar"
Write-Host '  2) 上传 backend\release\ 下的 index.html 与 js\ 目录（保持 js 子目录结构）-> 服务器 /home/xiaos/eggworld/xs/'
Write-Host '     scp -r backend\release\index.html backend\release\js xiaos@dsxnb.com:/home/xiaos/eggworld/xs/'
Write-Host '  2.1) 上传 backend\release\rs\ 整个目录（简历子模块静态产物）-> 服务器 /home/xiaos/eggworld/xs/rs/'
Write-Host '     scp -r backend\release\rs xiaos@dsxnb.com:/home/xiaos/eggworld/xs/'
Write-Host '  3) 单独上传 assets\ 下的 8 张图片（7 张 char-eggy-*.jpg + logo-char.png，图片不在本脚本打包范围内）-> 服务器 /home/xiaos/eggworld/xs/assets/'
Write-Host '  4) SSH 执行：systemctl restart eggworld'
