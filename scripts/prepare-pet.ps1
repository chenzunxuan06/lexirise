# 跃跃素材处理：透明版裁边 + 归一 512px → web/public/pet/ + PWA 图标
Add-Type -AssemblyName System.Drawing
$src = "E:\初二\跃跃三形态\透明版"
$out = "E:\初二\web\public\pet"
New-Item -ItemType Directory -Force $out | Out-Null

function Prep($inFile, $outFile, $size) {
  $bmp = [System.Drawing.Bitmap]::FromFile($inFile)
  $minX=$bmp.Width; $minY=$bmp.Height; $maxX=0; $maxY=0
  for ($y=0; $y -lt $bmp.Height; $y+=4) { for ($x=0; $x -lt $bmp.Width; $x+=4) {
    $a = $bmp.GetPixel($x,$y).A
    if ($a -gt 16) { if ($x -lt $minX) {$minX=$x}; if ($x -gt $maxX) {$maxX=$x}; if ($y -lt $minY) {$minY=$y}; if ($y -gt $maxY) {$maxY=$y} }
  } }
  $pad = 10
  $sx = [Math]::Max(0, $minX - $pad); $sy = [Math]::Max(0, $minY - $pad)
  $sw = [Math]::Min($bmp.Width - $sx, $maxX - $minX + $pad * 2)
  $sh = [Math]::Min($bmp.Height - $sy, $maxY - $minY + $pad * 2)
  $crop = $bmp.Clone([System.Drawing.Rectangle]::new($sx, $sy, $sw, $sh), $bmp.PixelFormat)
  $side = [Math]::Max($sw, $sh)
  $canvas = [System.Drawing.Bitmap]::new($side, $side)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($crop, (($side - $sw) / 2), (($side - $sh) / 2), $sw, $sh)
  $res = [System.Drawing.Bitmap]::new($size, $size)
  $g2 = [System.Drawing.Graphics]::FromImage($res)
  $g2.Clear([System.Drawing.Color]::Transparent)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($canvas, 0, 0, $size, $size)
  $res.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $crop.Dispose(); $canvas.Dispose(); $res.Dispose(); $g.Dispose(); $g2.Dispose()
}

$map = @{
  "AI-形态1-幼狐-v2.png"   = "s1-idle.png"
  "AI-形态2-少年狐-v3.png" = "s2-idle.png"
  "AI-形态3-词霸狐-v5.png" = "s3-idle.png"
}
foreach ($k in $map.Keys) { Prep (Join-Path $src $k) (Join-Path $out $map[$k]) 512; Write-Output ("pet: " + $map[$k]) }

$stage = @{ "幼狐" = "s1"; "少年狐" = "s2"; "词霸狐" = "s3" }
$acts = @{ "欢呼" = "cheer"; "捧书" = "book"; "趴睡" = "sleep"; "挨饿" = "hungry" }
foreach ($s in $stage.Keys) {
  foreach ($a in $acts.Keys) {
    $f = Join-Path $src ("动作库\" + $s + "-" + $a + ".png")
    if (Test-Path $f) { Prep $f (Join-Path $out ($stage[$s] + "-" + $acts[$a] + ".png")) 512; Write-Output ("pet: " + $stage[$s] + "-" + $acts[$a] + ".png") }
  }
}

# PWA 图标（s1 idle 主图，192/512/180）
$ic = "E:\初二\web\public\icons"
New-Item -ItemType Directory -Force $ic | Out-Null
Prep (Join-Path $out "s1-idle.png") (Join-Path $ic "icon-192.png") 192
Prep (Join-Path $out "s1-idle.png") (Join-Path $ic "icon-512.png") 512
Prep (Join-Path $out "s1-idle.png") (Join-Path $ic "icon-180.png") 180
Write-Output "icons done"
Get-ChildItem $out | Select-Object Name, Length | Format-Table -AutoSize