# 本地高并发/安全回归入口：没有生产 URL、SSH、部署或真实邮件参数。
[CmdletBinding()]
param(
    [ValidateSet('Regression','Mysql','Microbench','Smoke','Soak')][string]$Mode = 'Regression',
    [string]$MavenPath = 'D:\CodexData\devtools\maven\apache-maven-3.9.16\bin\mvn.cmd',
    [string]$JavaHome = 'D:\CodexData\devtools\jdk\jdk-17.0.20.1+1',
    [ValidatePattern('^eggworld(?:_preview|_team_security_[a-f0-9]{32})?$')][string]$FixtureSchema = 'eggworld_preview',
    [string]$LogDirectory = 'D:\CodexData\local\eggworld'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!(Test-Path -LiteralPath $MavenPath -PathType Leaf)) { throw '找不到 Maven；请传入本机 MavenPath。' }
if (!(Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) { throw '找不到 Java 17；请传入本机 JavaHome。' }
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$old = @{}
foreach ($name in @('JAVA_HOME','PATH','CHATROOM_MYSQL_IT','TEAM_SECURITY_MYSQL_IT','TEAM_SECURITY_DDL_SCHEMA','PERF_SEC_MICROBENCH','PERF_SEC_LOAD_IT','PERF_SEC_SOAK_SECONDS','PERF_SEC_TASK_CHAT_IT','EGGWORLD_LOCAL_MYSQL_IT')) {
    $old[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
}
function Invoke-LocalMaven([string[]]$MavenArguments,[string]$Label) {
    $log = Join-Path $LogDirectory ("perf-sec-run-{0}-{1}.log" -f $Label,(Get-Date -Format 'yyyyMMdd-HHmmss'))
    # Windows PowerShell 5 把 JVM 的普通 stderr 警告包装成 NativeCommandError；以真实退出码判定。
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $MavenPath -o -f (Join-Path $PSScriptRoot 'pom.xml') @MavenArguments *> $log
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    Write-Output "PERF_SEC_LOG $log"
    Select-String -LiteralPath $log -Pattern 'Tests run:|BUILD |PERF_SEC_BENCH|PERF_SEC_LOAD_' | ForEach-Object { $_.Line }
    if ($code -ne 0) { throw "本地验证失败，未执行后续步骤。日志：$log" }
}
Push-Location -LiteralPath $root
try {
    $env:JAVA_HOME=$JavaHome; $env:PATH="$JavaHome\bin;$env:PATH"
    $env:CHATROOM_MYSQL_IT='false'; $env:TEAM_SECURITY_MYSQL_IT='false'; $env:PERF_SEC_MICROBENCH='false'
    $env:PERF_SEC_LOAD_IT='false'; $env:PERF_SEC_SOAK_SECONDS='30'
    $env:PERF_SEC_TASK_CHAT_IT='false'; $env:EGGWORLD_LOCAL_MYSQL_IT='false'
    if ($Mode -eq 'Regression') {
        Invoke-LocalMaven @('test') 'backend'
        Invoke-LocalMaven @('compile') 'compile'
        & node --check (Join-Path $root 'js\chatroom.js')
        if ($LASTEXITCODE -ne 0) { throw '聊天脚本语法检查失败。' }
        $log=Join-Path $LogDirectory ("perf-sec-run-frontend-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        & node --test tests/*.cjs *> $log
        $code=$LASTEXITCODE
        Select-String -LiteralPath $log -Pattern '^# tests|^# pass|^# fail|^# skipped|^not ok' | ForEach-Object { $_.Line }
        if ($code -ne 0) { throw "前端回归失败：$log" }
    } elseif ($Mode -in @('Smoke','Soak')) {
        $env:PERF_SEC_LOAD_IT='true'; $env:TEAM_SECURITY_DDL_SCHEMA=$FixtureSchema
        if ($Mode -eq 'Soak') { $env:PERF_SEC_SOAK_SECONDS='1800' }
        Invoke-LocalMaven @('-Dtest=PerformanceSecurityLoadIT','test') $Mode.ToLowerInvariant()
    } else {
        # 测试本身在任何 DDL 前强制校验 URL=127.0.0.1:3307、@@port、@@datadir；
        # 仅在随机隔离库写合成数据，样板库仅复制 DDL、不复制用户数据、不修改样板库。
        $env:CHATROOM_MYSQL_IT='true'; $env:TEAM_SECURITY_DDL_SCHEMA=$FixtureSchema
        if ($Mode -eq 'Mysql') {
            $env:TEAM_SECURITY_MYSQL_IT='true'
            # Enable only the guarded subclass, never the legacy 3306 fixture.
            $env:PERF_SEC_TASK_CHAT_IT='true'
            Invoke-LocalMaven @('-Dtest=ChatroomMysqlIT,TeamFundsMysqlIT,TaskChatBindingIsolatedMysqlIT','test') 'mysql'
        } else {
            $env:PERF_SEC_MICROBENCH='true'
            Invoke-LocalMaven @('-Dtest=ChatroomMysqlIT#unreadUpdateMicrobenchmark','test') 'microbench'
        }
    }
} finally {
    Pop-Location
    foreach ($name in $old.Keys) { [Environment]::SetEnvironmentVariable($name,$old[$name],'Process') }
}
