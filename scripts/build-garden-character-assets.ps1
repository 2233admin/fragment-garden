param(
  [Parameter(Mandatory = $true)]
  [string]$ReferenceRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot "public\assets\garden\characters"
$playerSourcePath = Join-Path $ReferenceRoot "Characters\Leah..png"
$catSourcePath = Join-Path $ReferenceRoot "Animals\cat..png"
$dogSourcePath = Join-Path $ReferenceRoot "Animals\dog..png"

foreach ($sourcePath in @($playerSourcePath, $catSourcePath, $dogSourcePath)) {
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing garden character source image: $sourcePath"
  }
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function New-TransparentBitmap {
  param(
    [int]$Width,
    [int]$Height
  )

  return [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
}

function Set-PixelArtGraphics {
  param([System.Drawing.Graphics]$Graphics)

  $Graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $Graphics.CompositingQuality =
    [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $Graphics.InterpolationMode =
    [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
}

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Export-PlayerSheet {
  param(
    [string]$SourcePath,
    [string]$DestinationPath
  )

  $source = [System.Drawing.Bitmap]::new($SourcePath)
  $output = New-TransparentBitmap -Width 128 -Height 256
  $graphics = [System.Drawing.Graphics]::FromImage($output)

  try {
    Set-PixelArtGraphics -Graphics $graphics
    $sourceRectangle = [System.Drawing.Rectangle]::new(0, 0, 64, 128)
    $destinationRectangle = [System.Drawing.Rectangle]::new(0, 0, 128, 256)
    $graphics.DrawImage(
      $source,
      $destinationRectangle,
      $sourceRectangle,
      [System.Drawing.GraphicsUnit]::Pixel
    )
    Save-Png -Bitmap $output -Path $DestinationPath
  } finally {
    $graphics.Dispose()
    $output.Dispose()
    $source.Dispose()
  }
}

function Export-CompanionSheet {
  param(
    [string]$SourcePath,
    [string]$DestinationPath
  )

  $source = [System.Drawing.Bitmap]::new($SourcePath)
  $output = New-TransparentBitmap -Width 192 -Height 52
  $graphics = [System.Drawing.Graphics]::FromImage($output)

  try {
    Set-PixelArtGraphics -Graphics $graphics

    for ($frame = 0; $frame -lt 4; $frame += 1) {
      # The fifth 32px row is the calm front-facing pet pose. Crop away the
      # source frame's unused padding before the integer 2x enlargement.
      $sourceRectangle = [System.Drawing.Rectangle]::new(
        ($frame * 32) + 4,
        (4 * 32) + 6,
        24,
        26
      )
      $destinationRectangle = [System.Drawing.Rectangle]::new(
        $frame * 48,
        0,
        48,
        52
      )
      $graphics.DrawImage(
        $source,
        $destinationRectangle,
        $sourceRectangle,
        [System.Drawing.GraphicsUnit]::Pixel
      )
    }

    Save-Png -Bitmap $output -Path $DestinationPath
  } finally {
    $graphics.Dispose()
    $output.Dispose()
    $source.Dispose()
  }
}

function Export-EntityShadow {
  param([string]$DestinationPath)

  $output = New-TransparentBitmap -Width 48 -Height 12

  try {
    $shadowColor = [System.Drawing.Color]::FromArgb(50, 36, 54, 38)

    for ($y = 2; $y -le 9; $y += 1) {
      $normalizedY = ($y - 5.5) / 4

      for ($x = 5; $x -le 42; $x += 1) {
        $normalizedX = ($x - 23.5) / 19

        if (($normalizedX * $normalizedX) + ($normalizedY * $normalizedY) -le 1) {
          $output.SetPixel($x, $y, $shadowColor)
        }
      }
    }

    Save-Png -Bitmap $output -Path $DestinationPath
  } finally {
    $output.Dispose()
  }
}

Export-PlayerSheet `
  -SourcePath $playerSourcePath `
  -DestinationPath (Join-Path $outputDirectory "player.png")
Export-CompanionSheet `
  -SourcePath $catSourcePath `
  -DestinationPath (Join-Path $outputDirectory "companion-cat.png")
Export-CompanionSheet `
  -SourcePath $dogSourcePath `
  -DestinationPath (Join-Path $outputDirectory "companion-dog.png")
Export-EntityShadow `
  -DestinationPath (Join-Path $outputDirectory "entity-shadow.png")

Write-Output "Generated garden character assets in $outputDirectory"
