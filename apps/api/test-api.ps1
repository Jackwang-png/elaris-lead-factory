# 后端 API 全面测试脚本
$TOKEN = $null

# 1. 登录获取 token
$loginBody = '{"email":"admin@smartcs.com","password":"Admin@SmartCS2024!"}'
$loginResp = curl.exe -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d $loginBody
$loginObj = $loginResp | ConvertFrom-Json
$TOKEN = $loginObj.accessToken

Write-Host "=== 后端 API 全面测试 ===" -ForegroundColor Cyan
Write-Host ""

# 定义所有测试端点
$endpoints = @(
    @{ method="GET";  path="/auth/profile";       desc="获取当前用户信息" },
    @{ method="GET";  path="/admin/stats";         desc="平台总览统计" },
    @{ method="GET";  path="/admin/tenants";       desc="租户列表" },
    @{ method="GET";  path="/admin/users";         desc="用户列表" },
    @{ method="GET";  path="/admin/audit-logs";    desc="审计日志列表" },
    @{ method="GET";  path="/bots";                desc="机器人列表" },
    @{ method="GET";  path="/customers";           desc="客户列表" },
    @{ method="GET";  path="/conversations";       desc="会话列表" },
    @{ method="GET";  path="/knowledge";           desc="知识库列表" },
    @{ method="GET";  path="/leads";               desc="线索列表" },
    @{ method="GET";  path="/subscription/current"; desc="当前订阅" },
    @{ method="GET";  path="/channel-stats";       desc="渠道统计" },
    @{ method="GET";  path="/sales-memories";      desc="销售记忆" },
    @{ method="GET";  path="/products";            desc="产品列表" },
    @{ method="GET";  path="/prompts";             desc="Prompt管理" },
    @{ method="GET";  path="/ai-models";           desc="AI模型管理" },
    @{ method="GET";  path="/notifications";       desc="通知列表" },
    @{ method="GET";  path="/settings";            desc="系统设置" }
)

$results = @()
foreach ($ep in $endpoints) {
    try {
        $url = "http://localhost:3000$($ep.path)"
        $headers = @("-H", "Authorization: Bearer $TOKEN", "-H", "Content-Type: application/json")
        $resp = curl.exe -s -o NUL -w "%{http_code}" -X $ep.method $url @headers
        $status = if ($resp -match "^\d+$") { $resp } else { "ERR" }
        $icon = switch -Wildcard ($status) {
            "200*" { "OK" }
            "201*" { "OK" }
            "401*" { "AUTH" }
            "403*" { "FORBID" }
            "404*" { "NOTFOUND" }
            "500*" { "SERVER_ERR" }
            default { "UNKNOWN" }
        }
        $results += [PSCustomObject]@{
            Method = $ep.method
            Path = $ep.path
            Status = $status
            Result = $icon
            Desc = $ep.desc
        }
        Write-Host "[$icon] $status $($ep.method) $($ep.path) - $($ep.desc)" -ForegroundColor $(if ($status -like "200*" -or $status -like "201*") {"Green"} else {"Yellow"})
    } catch {
        Write-Host "[ERR] $($ep.method) $($ep.path) - $($ep.desc): $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== 测试完成 ===" -ForegroundColor Cyan
$ok = ($results | Where-Object { $_.Result -eq "OK" }).Count
$fail = ($results | Where-Object { $_.Result -ne "OK" }).Count
Write-Host "成功: $ok / $($results.Count)  失败: $fail"
