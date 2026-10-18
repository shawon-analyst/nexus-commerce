# Renders public/og-default.png — the 1200x630 card Facebook, WhatsApp and X
# show when a link to the site is shared. Drawn with GDI+ (System.Drawing) so it
# needs no extra npm dependency; the palette mirrors app/icon.svg.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-og-image.ps1
#
# Re-run whenever the logo or the tagline changes, then commit the PNG.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $PSScriptRoot) { $root = (Get-Location).Path }
$outDir = Join-Path $root 'public'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$out = Join-Path $outDir 'og-default.png'

$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# ------------------------------------------------------------------ backdrop --
$bgRect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect,
  [System.Drawing.Color]::FromArgb(255, 11, 17, 32),
  [System.Drawing.Color]::FromArgb(255, 30, 22, 66), 35.0)
$g.FillRectangle($bg, $bgRect)

# two soft glows so the flat gradient never looks like a solid block
foreach ($glow in @(
    @{ x = 980; y = 90;  r = 330; c = [System.Drawing.Color]::FromArgb(120, 99, 102, 241) },
    @{ x = 180; y = 600; r = 300; c = [System.Drawing.Color]::FromArgb(90, 6, 182, 212) }
  )) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($glow.x - $glow.r, $glow.y - $glow.r, $glow.r * 2, $glow.r * 2)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterColor = $glow.c
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.FillPath($brush, $path)
  $brush.Dispose(); $path.Dispose()
}

# --------------------------------------------------------------- logo tile ----
$tile = New-RoundedPath 92 246 148 148 34
$tileBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(92, 246, 148, 148)),
  [System.Drawing.Color]::FromArgb(255, 79, 70, 229),
  [System.Drawing.Color]::FromArgb(255, 6, 182, 212), 45.0)
$blend = New-Object System.Drawing.Drawing2D.ColorBlend(3)
$blend.Colors = @(
  [System.Drawing.Color]::FromArgb(255, 79, 70, 229),
  [System.Drawing.Color]::FromArgb(255, 124, 58, 237),
  [System.Drawing.Color]::FromArgb(255, 6, 182, 212))
$blend.Positions = @(0.0, 0.52, 1.0)
$tileBrush.InterpolationColors = $blend
$g.FillPath($tileBrush, $tile)

# shopping-bag glyph (handle + body + spark), mirroring app/icon.svg
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 9)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawArc($pen, 140, 278, 52, 46, 180, 180)
$pen.Dispose()

$bodyPath = New-RoundedPath 128 300 76 68 12
$bodyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(128, 300, 76, 68)),
  [System.Drawing.Color]::White, [System.Drawing.Color]::FromArgb(255, 214, 224, 255), 90.0)
$g.FillPath($bodyBrush, $bodyPath)

$sparkPts = @(
  (New-Object System.Drawing.PointF(152, 320)),
  (New-Object System.Drawing.PointF(180, 320)),
  (New-Object System.Drawing.PointF(164, 340)),
  (New-Object System.Drawing.PointF(177, 340)),
  (New-Object System.Drawing.PointF(146, 364)),
  (New-Object System.Drawing.PointF(156, 342)),
  (New-Object System.Drawing.PointF(144, 342)))
$spark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 91, 33, 182))
$g.FillPolygon($spark, $sparkPts)

# ------------------------------------------------------------------- copy -----
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 199, 210, 254))
$chipText = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 232, 255))

$fTitle = New-Object System.Drawing.Font('Segoe UI', 74, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fSub = New-Object System.Drawing.Font('Segoe UI', 32, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fChip = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fFoot = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

$g.DrawString('Nexus Commerce', $fTitle, $white, 286, 246)
$g.DrawString('Premium gear, delivered fast', $fSub, $muted, 292, 344)

# trust chips along the bottom
$x = 292
foreach ($label in @('Cash on delivery', 'bKash', 'Live order tracking')) {
  $size = $g.MeasureString($label, $fChip)
  $cw = [single]($size.Width + 46)
  $chip = New-RoundedPath $x 438 $cw 52 26
  $chipFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(46, 148, 163, 255))
  $chipEdge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 165, 180, 252), 1.5)
  $g.FillPath($chipFill, $chip)
  $g.DrawPath($chipEdge, $chip)
  $g.DrawString($label, $fChip, $chipText, ($x + 23), 452)
  $x += $cw + 16
  $chip.Dispose(); $chipFill.Dispose(); $chipEdge.Dispose()
}

# hairline accent + delivery promise
$accent = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), 4)
$g.DrawLine($accent, 92, 540, 1108, 540)
$g.DrawString('Nationwide delivery across Bangladesh   |   Free over BDT 1,000', $fFoot, $muted, 92, 560)

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

foreach ($o in @($white, $muted, $chipText, $fTitle, $fSub, $fChip, $fFoot, $accent, $bodyBrush, $tileBrush, $bg, $spark)) { $o.Dispose() }
$g.Dispose(); $bmp.Dispose()

$fi = Get-Item $out
$img = [System.Drawing.Image]::FromFile($out)
Write-Output ("wrote {0}  {1}x{2}  {3:N0} bytes" -f $fi.FullName, $img.Width, $img.Height, $fi.Length)
$img.Dispose()
