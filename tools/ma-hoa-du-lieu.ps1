# =============================================================
#  Mã hóa dữ liệu & cấp tài khoản cho web Tra cứu Quy chế
#  - Đọc danh sách tài khoản trong tools\tai-khoan.csv (TaiKhoan, MatKhau, HoTen)
#  - Mã hóa data\raw.js + js\catalog.js thành data\secure.js
#  Chạy lại mỗi khi: thêm/xóa/đổi mật khẩu tài khoản, hoặc cập nhật quy chế.
#  Cách dùng (PowerShell):  .\tools\ma-hoa-du-lieu.ps1
#  Yêu cầu: Windows có .NET Framework 4.7.2+ và Google Chrome hoặc Microsoft Edge.
#
#  Thuật toán (giải mã trong js/auth.js bằng WebCrypto):
#   - Nội dung: AES-256-CBC + HMAC-SHA256 (mã hóa rồi xác thực), khóa ngẫu nhiên 64 byte.
#   - Mỗi tài khoản: PBKDF2-SHA256 (310.000 vòng) từ mật khẩu → bọc khóa nội dung.
# =============================================================
param([string]$Src = "$env:USERPROFILE\Desktop\HCNS")   # thư mục chứa file Word/Excel gốc
$ErrorActionPreference = 'Stop'
$tools = $PSScriptRoot
$root = Split-Path $tools -Parent
$csv = Join-Path $tools 'tai-khoan.csv'
$outFile = Join-Path $root 'data\secure.js'
$ITER = 310000

if (-not (Test-Path $csv)) { throw "Không tìm thấy $csv" }
$rows = Import-Csv $csv -Encoding UTF8 | Where-Object { $_.TaiKhoan -and $_.TaiKhoan.Trim() }
if (-not $rows) { throw 'tai-khoan.csv chưa có tài khoản nào.' }
$seen = @{}
$users = foreach ($r in $rows) {
  $u = $r.TaiKhoan.Trim().ToLower()
  if ($seen.ContainsKey($u)) { throw "Tài khoản bị trùng: $u" }
  $seen[$u] = $true
  if (-not $r.MatKhau -or $r.MatKhau.Length -lt 8) { throw "Mật khẩu của '$u' phải có ít nhất 8 ký tự." }
  [pscustomobject]@{ u = $u; p = $r.MatKhau; name = $(if ($r.HoTen) { $r.HoTen.Trim() } else { $u }) }
}

# ---- 1. Đọc dữ liệu gốc dưới dạng JSON bằng trình duyệt chạy ẩn ----
$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { throw 'Không tìm thấy Chrome hoặc Edge.' }
$tmpProfile = Join-Path $env:TEMP ('qc-mahoa-' + [guid]::NewGuid().ToString('N'))
try {
  $url = ([Uri](Join-Path $tools 'xuat-du-lieu.html')).AbsoluteUri
  $ErrorActionPreference = 'Continue'   # Chrome in cảnh báo ra stderr – không phải lỗi
  $dom = & $browser --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir="$tmpProfile" --dump-dom $url 2>$null | Out-String
} finally {
  $ErrorActionPreference = 'Stop'
  if (Test-Path -LiteralPath $tmpProfile) { Remove-Item -LiteralPath $tmpProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
$m = [regex]::Match($dom, '<pre id="o">@@BEGIN@@([A-Za-z0-9+/=]+)@@END@@</pre>')
if (-not $m.Success) { $e = [regex]::Match($dom, 'ERROR[^<]*'); throw ('Không đọc được dữ liệu gốc. ' + $e.Value) }
$plain = [Convert]::FromBase64String($m.Groups[1].Value)
$check = [Text.Encoding]::UTF8.GetString($plain)
if (-not $check.StartsWith('{"globals":{"RAW_DOCS":{')) { throw 'Dữ liệu gốc không đúng định dạng.' }

# ---- 2. Mã hóa bằng .NET ----
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Security.Cryptography;
public static class QcCrypto {
  static readonly RandomNumberGenerator Rng = RandomNumberGenerator.Create();
  public static byte[] Rand(int n) { var b = new byte[n]; Rng.GetBytes(b); return b; }
  public static byte[] Pbkdf2(string pass, byte[] salt, int iter) {
    using (var d = new Rfc2898DeriveBytes(Encoding.UTF8.GetBytes(pass), salt, iter, HashAlgorithmName.SHA256)) return d.GetBytes(64);
  }
  static byte[] Sub(byte[] a, int o, int n) { var r = new byte[n]; Buffer.BlockCopy(a, o, r, 0, n); return r; }
  /// key64 = 32 byte khóa AES || 32 byte khóa HMAC. Trả về [iv, ct, mac].
  public static byte[][] Seal(byte[] key64, byte[] plain) {
    var iv = Rand(16); byte[] ct;
    using (var a = Aes.Create()) { a.KeySize = 256; a.Key = Sub(key64, 0, 32); a.IV = iv; a.Mode = CipherMode.CBC; a.Padding = PaddingMode.PKCS7;
      using (var e = a.CreateEncryptor()) ct = e.TransformFinalBlock(plain, 0, plain.Length); }
    var buf = new byte[iv.Length + ct.Length]; Buffer.BlockCopy(iv, 0, buf, 0, 16); Buffer.BlockCopy(ct, 0, buf, 16, ct.Length);
    byte[] mac; using (var h = new HMACSHA256(Sub(key64, 32, 32))) mac = h.ComputeHash(buf);
    return new[] { iv, ct, mac };
  }
  public static string UserId(string user) {
    using (var s = SHA256.Create()) { var h = s.ComputeHash(Encoding.UTF8.GetBytes("qc:" + user)); var sb = new StringBuilder(); foreach (var b in h) sb.Append(b.ToString("x2")); return sb.ToString(); }
  }
}
'@
$b64 = { param($x) [Convert]::ToBase64String($x) }
$contentKey = [QcCrypto]::Rand(64)

# ---- File Excel gốc: mỗi file mã hóa thành data/files/<mã ngẫu nhiên>.js, chỉ tải khi người dùng bấm "Tải file gốc" ----
$blobDir = Join-Path $root 'data\files'
if (Test-Path $blobDir) { Get-ChildItem $blobDir -Filter '*.js' | ForEach-Object { [IO.File]::Delete($_.FullName) } }
New-Item -ItemType Directory -Force $blobDir | Out-Null
$excluded = @{}
$exclFile = Join-Path $tools 'khong-dua-len-web.txt'
if (Test-Path $exclFile) { Get-Content $exclFile -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $excluded[$_.Replace('\', '/').ToLower()] = $true } }
$blobMap = [ordered]@{}
if (Test-Path $Src) {
  Get-ChildItem $Src -Recurse -File | Where-Object { $_.Extension -in '.xls', '.xlsx', '.xlsm' -and $_.Name -notlike '~$*' } | ForEach-Object {
    $rel = $_.FullName.Substring($Src.Length + 1).Replace('\', '/')
    if ($excluded.ContainsKey($rel.ToLower())) { return }
    $bx = [QcCrypto]::Seal($contentKey, [IO.File]::ReadAllBytes($_.FullName))
    $id = -join ([QcCrypto]::Rand(12) | ForEach-Object { $_.ToString('x2') })
    $js = "window.QC_BLOB=window.QC_BLOB||{};QC_BLOB['$id']={iv:'$(& $b64 $bx[0])',ct:'$(& $b64 $bx[1])',mac:'$(& $b64 $bx[2])'};"
    [IO.File]::WriteAllText((Join-Path $blobDir "$id.js"), $js, (New-Object System.Text.UTF8Encoding($false)))
    $blobMap[$rel] = [ordered]@{ id = $id; name = $_.Name; kb = [math]::Ceiling($_.Length / 1KB) }
  }
}
$mapJson = if ($blobMap.Count) { ConvertTo-Json -Compress -Depth 4 -InputObject $blobMap } else { '{}' }
$plain = [Text.Encoding]::UTF8.GetBytes('{"globals":{"FILE_BLOBS":' + $mapJson + ',' + $check.Substring('{"globals":{'.Length))
Write-Host "Đã mã hóa $($blobMap.Count) file Excel gốc vào data\files ($($excluded.Count) file trong danh sách không đưa lên web)"

$box = [QcCrypto]::Seal($contentKey, $plain)
$userMap = [ordered]@{}
foreach ($u in $users) {
  $salt = [QcCrypto]::Rand(16)
  $kek = [QcCrypto]::Pbkdf2($u.p, $salt, $ITER)
  $payload = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress -InputObject ([ordered]@{ k = (& $b64 $contentKey); name = $u.name })))
  $w = [QcCrypto]::Seal($kek, $payload)
  $userMap[[QcCrypto]::UserId($u.u)] = [ordered]@{ salt = (& $b64 $salt); iv = (& $b64 $w[0]); wk = (& $b64 $w[1]); mac = (& $b64 $w[2]) }
}
$secure = [ordered]@{ v = 2; alg = 'AES-256-CBC+HMAC-SHA256/PBKDF2-SHA256'; iter = $ITER; iv = (& $b64 $box[0]); ct = (& $b64 $box[1]); mac = (& $b64 $box[2]); users = $userMap }
$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$js = "/* Du lieu da ma hoa - tao boi tools/ma-hoa-du-lieu.ps1 luc $stamp. Khong sua tay. */`nwindow.SECURE = " + (ConvertTo-Json -Compress -Depth 5 -InputObject $secure) + ";`n"
[IO.File]::WriteAllText($outFile, $js, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("Da ma hoa cho {0} tai khoan -> {1} ({2:N0} KB)" -f @($users).Count, $outFile, ((Get-Item $outFile).Length / 1KB))
