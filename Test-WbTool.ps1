# Загрузи один раз в текущую сессию PowerShell:
#   . .\Test-WbTool.ps1
# Дальше вызывай в одну строку:
#   Test-WbTool -Name "wb_account_balance"
#   Test-WbTool -Name "wb_finance_summary" -Args @{ dateFrom = "2026-08-24"; dateTo = "2026-08-31"; topN = 10 }

function Test-WbTool {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [hashtable]$Args = @{},

        [string]$Uri = "https://anthology-attribute-sanding.ngrok-free.dev/mcp",

        [string]$McpApiKey = $null
    )

    $body = @{
        jsonrpc = "2.0"
        id      = 1
        method  = "tools/call"
        params  = @{
            name      = $Name
            arguments = $Args
        }
    } | ConvertTo-Json -Depth 20

    $headers = @{ "ngrok-skip-browser-warning" = "true" }
    if ($McpApiKey) { $headers["Authorization"] = "Bearer $McpApiKey" }

    try {
        $response = Invoke-RestMethod -Uri $Uri -Method Post -ContentType "application/json" -Headers $headers -Body $body

        if ($response.result.isError) {
            Write-Host "[$Name] Ошибка от инструмента:" -ForegroundColor Red
        } else {
            Write-Host "[$Name] OK" -ForegroundColor Green
        }

        $response.result | ConvertTo-Json -Depth 20
    }
    catch {
        Write-Host "[$Name] HTTP-ошибка запроса:" -ForegroundColor Red
        $_.Exception.Message
        if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message }
    }
}
