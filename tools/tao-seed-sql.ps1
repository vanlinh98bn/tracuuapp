# =============================================================
#  Sinh backend\db\seed.sql từ data\raw.js + js\catalog.js
#  để nạp nội dung quy chế vào PostgreSQL.
#  Cách dùng (PowerShell):  .\tools\tao-seed-sql.ps1
#  Yêu cầu: Google Chrome hoặc Microsoft Edge.
#  seed.sql chứa toàn bộ nội dung quy chế: KHÔNG đưa lên web, không gửi ra ngoài.
# =============================================================
$ErrorActionPreference = 'Stop'
$tools = $PSScriptRoot
$root = Split-Path $tools -Parent
$outFile = Join-Path $root 'backend\db\seed.sql'

$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { throw 'Không tìm thấy Chrome hoặc Edge.' }

$tmpProfile = Join-Path $env:TEMP ('qc-sql-' + [guid]::NewGuid().ToString('N'))
try {
  $url = ([Uri](Join-Path $tools 'xuat-sql.html')).AbsoluteUri
  $ErrorActionPreference = 'Continue'   # Chrome in cảnh báo ra stderr – không phải lỗi
  $dom = & $browser --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir="$tmpProfile" --dump-dom $url 2>$null | Out-String
} finally {
  $ErrorActionPreference = 'Stop'
  if (Test-Path -LiteralPath $tmpProfile) { Remove-Item -LiteralPath $tmpProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
$m = [regex]::Match($dom, '<pre id="o">@@BEGIN@@([A-Za-z0-9+/=]+)@@END@@</pre>')
if (-not $m.Success) { $e = [regex]::Match($dom, 'ERROR[^<]*'); throw ('Không sinh được SQL. ' + $e.Value) }

New-Item -ItemType Directory -Force (Split-Path $outFile) | Out-Null
[IO.File]::WriteAllBytes($outFile, [Convert]::FromBase64String($m.Groups[1].Value))
$last = (Get-Content $outFile -Encoding UTF8 | Select-Object -Last 1)
Write-Host "Đã tạo $outFile ($([math]::Round((Get-Item $outFile).Length / 1KB)) KB)"
Write-Host $last
