# =============================================================
#  Cập nhật dữ liệu cho web Tra cứu Quy chế
#  Đọc toàn bộ file Word (.doc/.docx) bằng Microsoft Word và biểu mẫu
#  Excel (.xls/.xlsx) bằng Microsoft Excel trong thư mục quy chế,
#  rồi ghi ra data/raw.js để trang web hiển thị.
#
#  Cách dùng (PowerShell):
#    .\tools\cap-nhat-du-lieu.ps1
#    .\tools\cap-nhat-du-lieu.ps1 -Src "D:\HCNS"
#  Yêu cầu: máy có cài Microsoft Word và Microsoft Excel.
# =============================================================
param([string]$Src = "$env:USERPROFILE\Desktop\HCNS")
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $root 'data\raw.js'
$enc = New-Object System.Text.UTF8Encoding($false)
if (-not (Test-Path $Src)) { throw "Không tìm thấy thư mục: $Src" }

function Clean([string]$s) {
  if ($null -eq $s) { return '' }
  # Giữ xuống dòng mềm (Shift+Enter = \x0b) và xuống dòng trong ô bảng (\r) thành \n
  $s = $s -replace '\x07', '' -replace '[\x0b\r]', "`n" -replace '\x0c', ' ' -replace '\u00a0', ' '
  $s = ($s -split "`n" | ForEach-Object { ($_ -replace '[ \t]+', ' ').Trim() } | Where-Object { $_ }) -join "`n"
  return $s.Trim()
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$docs = [ordered]@{}
$files = Get-ChildItem $Src -Recurse -File | Where-Object { $_.Name -notlike '~$*' }
# File không đưa lên web (tools\khong-dua-len-web.txt): không đọc nội dung, chỉ liệt kê tên
$exclFile = Join-Path $PSScriptRoot 'khong-dua-len-web.txt'
$excluded = @{}
if (Test-Path $exclFile) { Get-Content $exclFile -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $excluded[$_.Replace('\', '/').ToLower()] = $true } }
function IsExcluded($f) { $excluded.ContainsKey($f.FullName.Substring($Src.Length + 1).Replace('\', '/').ToLower()) }
if ($excluded.Count) { Write-Host "Bỏ qua $($excluded.Count) file trong khong-dua-len-web.txt" }
$wordFiles = $files | Where-Object { $_.Extension -in '.doc', '.docx' -and -not (IsExcluded $_) }
$i = 0
try {
  foreach ($f in $wordFiles) {
    $i++
    $rel = $f.FullName.Substring($Src.Length + 1).Replace('\', '/')
    $doc = $null
    try {
      $doc = $word.Documents.Open($f.FullName, $false, $true, $false)
      $blocks = New-Object System.Collections.ArrayList
      $doneTables = @{}
      $pc = $doc.Paragraphs.Count
      for ($p = 1; $p -le $pc; $p++) {
        $para = $doc.Paragraphs.Item($p)
        $rng = $para.Range
        if ($rng.Information(12)) {   # đoạn nằm trong bảng
          $t = $rng.Tables.Item(1)
          $key = $t.Range.Start
          if (-not $doneTables.ContainsKey($key)) {
            $doneTables[$key] = $true
            $rows = @{}
            foreach ($cell in $t.Range.Cells) {
              $r = $cell.RowIndex
              if (-not $rows.ContainsKey($r)) { $rows[$r] = New-Object System.Collections.ArrayList }
              [void]$rows[$r].Add((Clean $cell.Range.Text))
            }
            $data = @($rows.Keys | Sort-Object | ForEach-Object { , @($rows[$_]) })
            [void]$blocks.Add([ordered]@{ t = 'table'; rows = $data })
          }
          continue
        }
        $text = Clean $rng.Text
        if (-not $text) { continue }
        [void]$blocks.Add([ordered]@{
          t = 'p'; text = $text; list = (Clean $rng.ListFormat.ListString)
          bold = ($rng.Bold -eq -1); ol = [int]$para.OutlineLevel; al = [int]$para.Alignment
        })
      }
      $doc.Close([ref]0)
      $docs[$rel] = [ordered]@{ modified = $f.LastWriteTime.ToString('yyyy-MM-dd'); blocks = $blocks }
      Write-Host "[$i/$($wordFiles.Count)] OK  $rel"
    } catch {
      Write-Warning "[$i/$($wordFiles.Count)] Lỗi $rel : $($_.Exception.Message)"
      try { if ($doc) { $doc.Close([ref]0) } } catch { }
    }
  }
} finally { $word.Quit() }

# ---- Biểu mẫu Excel: đọc nội dung từng sheet bằng Microsoft Excel ----
function CellText($v) {
  if ($null -eq $v) { return '' }
  if ($v -is [datetime]) { return $v.ToString('dd/MM/yyyy') }
  if ($v -is [int] -and $v -lt -2146820000) { return '' }          # ô lỗi công thức (#N/A, #REF!…)
  if ($v -is [double] -or $v -is [decimal] -or $v -is [int]) {
    $d = [double]$v
    if ([math]::Abs($d - [math]::Round($d)) -lt 1e-9) { return ([math]::Round($d)).ToString('#,##0', [Globalization.CultureInfo]'vi-VN') }
    return ([math]::Round($d, 2)).ToString('#,##0.##', [Globalization.CultureInfo]'vi-VN')
  }
  return Clean ([string]$v)
}
$MAXR = 400; $MAXC = 30
$sheetsOut = [ordered]@{}
$xlFiles = $files | Where-Object { $_.Extension -in '.xls', '.xlsx', '.xlsm' -and -not (IsExcluded $_) }
if ($xlFiles) {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false; $excel.DisplayAlerts = $false; $excel.AskToUpdateLinks = $false
  $i = 0
  try {
    foreach ($f in $xlFiles) {
      $i++
      $rel = $f.FullName.Substring($Src.Length + 1).Replace('\', '/')
      $wb = $null
      try {
        $wb = $excel.Workbooks.Open($f.FullName, 0, $true)
        $list = New-Object System.Collections.ArrayList
        foreach ($ws in $wb.Worksheets) {
          if ($ws.Visible -ne -1) { continue }                        # bỏ sheet ẩn
          $ur = $ws.UsedRange
          $r0 = $ur.Row; $c0 = $ur.Column
          $nr = [math]::Min($ur.Rows.Count, $MAXR); $nc = [math]::Min($ur.Columns.Count, $MAXC)
          $vals = $ws.Range($ws.Cells($r0, $c0), $ws.Cells($r0 + $nr - 1, $c0 + $nc - 1)).Value(10)
          $rows = New-Object System.Collections.ArrayList
          for ($r = 1; $r -le $nr; $r++) {
            $row = @(for ($c = 1; $c -le $nc; $c++) { if ($nr -eq 1 -and $nc -eq 1) { CellText $vals } else { CellText $vals[$r, $c] } })
            [void]$rows.Add($row)
          }
          # Bỏ cột và dòng trống ở rìa, gộp nhiều dòng trống liên tiếp
          $used = @(0..($nc - 1) | Where-Object { $ci = $_; @($rows | Where-Object { $_[$ci] }).Count -gt 0 })
          if (-not $used.Count) { continue }
          $lastC = ($used | Measure-Object -Maximum).Maximum
          $clean = New-Object System.Collections.ArrayList; $blank = 0
          foreach ($row in $rows) {
            $cut = @($row[0..$lastC])
            if (-not ($cut -join '')) { $blank++; if ($blank -gt 1) { continue } } else { $blank = 0 }
            [void]$clean.Add($cut)
          }
          while ($clean.Count -and -not ($clean[$clean.Count - 1] -join '')) { $clean.RemoveAt($clean.Count - 1) }
          while ($clean.Count -and -not ($clean[0] -join '')) { $clean.RemoveAt(0) }
          [void]$list.Add([ordered]@{ name = [string]$ws.Name; rows = $clean; truncated = ($ur.Rows.Count -gt $MAXR -or $ur.Columns.Count -gt $MAXC) })
        }
        $wb.Close($false)
        $sheetsOut[$rel] = [ordered]@{ modified = $f.LastWriteTime.ToString('yyyy-MM-dd'); sheets = $list }
        Write-Host "[Excel $i/$($xlFiles.Count)] OK  $rel ($($list.Count) sheet)"
      } catch {
        Write-Warning "[Excel $i/$($xlFiles.Count)] Lỗi $rel : $($_.Exception.Message)"
        try { if ($wb) { $wb.Close($false) } } catch { }
      }
    }
  } finally { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}

# Danh sách mọi tệp (kể cả Excel) để trang web liệt kê biểu mẫu kèm theo
$list = @($files | ForEach-Object { [ordered]@{ path = $_.FullName.Substring($Src.Length + 1).Replace('\', '/'); kb = [math]::Ceiling($_.Length / 1KB); ext = $_.Extension.TrimStart('.').ToLower(); private = [bool](IsExcluded $_) } })

$json = $docs | ConvertTo-Json -Depth 10 -Compress
$filesJson = ConvertTo-Json -InputObject $list -Depth 4 -Compress
$sheetsJson = if ($sheetsOut.Count) { $sheetsOut | ConvertTo-Json -Depth 10 -Compress } else { '{}' }
$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm')
New-Item -ItemType Directory -Force (Split-Path $outFile) | Out-Null
[IO.File]::WriteAllText($outFile, "/* Tự sinh bởi tools/cap-nhat-du-lieu.ps1 lúc $stamp – không sửa tay */`nwindow.RAW_UPDATED = '$stamp';`nwindow.RAW_FILES = $filesJson;`nwindow.RAW_DOCS = $json;`nwindow.RAW_SHEETS = $sheetsJson;`n", $enc)
Write-Host "Đã ghi $outFile ($([math]::Round((Get-Item $outFile).Length / 1KB)) KB)"
