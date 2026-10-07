# =============================================================
#  Đóng gói backend + giao diện để triển khai lên Azure App Service
#  Cách dùng (PowerShell):  .\tools\dong-goi-azure.ps1
#  Kết quả: dist\tra-cuu-quy-che-azure.zip
#  Gói CHỈ gồm file cần chạy: không có tools\, data\, js\catalog.js, .env, seed.sql.
# =============================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $env:TEMP ('qc-goi-' + [guid]::NewGuid().ToString('N'))
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist 'tra-cuu-quy-che-azure.zip'
try {
  New-Item -ItemType Directory -Force "$stage\web\js", "$stage\web\css", $dist | Out-Null
  Copy-Item "$root\backend\package.json" $stage
  if (Test-Path "$root\backend\package-lock.json") { Copy-Item "$root\backend\package-lock.json" $stage }
  Copy-Item "$root\backend\src" "$stage\src" -Recurse
  Copy-Item "$root\server.html" "$stage\web\"
  Copy-Item "$root\css\style.css" "$stage\web\css\"
  Copy-Item "$root\assets" "$stage\web\assets" -Recurse
  foreach ($f in 'auth-server.js', 'normalize.js', 'app.js', 'export.js', 'feedback.js', 'admin.js') { Copy-Item "$root\js\$f" "$stage\web\js\" }

  # Kiểm tra lần cuối: không lọt file nhạy cảm
  $bad = Get-ChildItem $stage -Recurse -File | Where-Object { $_.Name -match '^(catalog\.js|raw\.js|secure\.js|seed\.sql|\.env|tai-khoan\.csv)$' }
  if ($bad) { throw ('Gói có file không được đưa lên: ' + ($bad.Name -join ', ')) }

  if (Test-Path $zip) { Remove-Item $zip }
  # tar không mở được đường dẫn có dấu (VD "Tuyển dụng"): tạo zip trong thư mục tạm rồi chuyển sang dist
  # (không dùng Compress-Archive: PowerShell 5.1 ghi đường dẫn bằng "\", Linux trên Azure giải nén sai)
  Push-Location $stage
  tar -a -c -f '_goi.zip' package.json src web $(if (Test-Path package-lock.json) { 'package-lock.json' })
  if ($LASTEXITCODE) { throw 'Không tạo được file zip' }
  Pop-Location
  Move-Item (Join-Path $stage '_goi.zip') $zip
  $n = (Get-ChildItem $stage -Recurse -File).Count   # sau khi chuyển zip đi: chỉ còn file trong gói
  Write-Host "Đã tạo $zip ($n file, $([math]::Round((Get-Item $zip).Length / 1KB)) KB)"
} finally {
  if ((Get-Location).Path -eq $stage) { Pop-Location }
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
}
