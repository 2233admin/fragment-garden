param(
  [Parameter(Mandatory = $true)]
  [string]$ReferenceRoot,

  [string]$AnalysisDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $ReferenceRoot "TileSheets\crops..png"
$outputDirectory = Join-Path $projectRoot "public\assets\garden\plants"
$atlasPath = Join-Path $outputDirectory "content-plants.png"
$shadowPath = Join-Path $outputDirectory "content-plant-shadow.png"

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Missing content plant source image: $sourcePath"
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$frameWidth = 64
$frameHeight = 80
$stageCount = 5

$families = @(
  @{
    Id = "sunflower"
    Label = "Warm sunflower"
    SourceX = 0
    SourceY = 480
    SourceFrames = @(2, 3, 4, 5, 5)
  },
  @{
    Id = "lavender"
    Label = "Cool globe flower"
    SourceX = 128
    SourceY = 416
    SourceFrames = @(2, 3, 4, 5, 5)
    OverlayFrame = 6
    OverlayTint = @(0.72, 0.58, 1.12)
  },
  @{
    Id = "dandelion"
    Label = "Soft star flower"
    SourceX = 128
    SourceY = 448
    SourceFrames = @(2, 3, 4, 5, 5)
    OverlayFrame = 6
    OverlayTint = @(1.08, 0.78, 0.9)
  }
)

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

function Draw-SourceCrop {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Source,
    [int]$SourceX,
    [int]$SourceY,
    [int]$Frame,
    [int]$CropX,
    [int]$CropY,
    [int]$CropWidth,
    [int]$CropHeight,
    [int]$Scale,
    [int]$DestinationX,
    [int]$DestinationY
  )

  $sourceRectangle = [System.Drawing.Rectangle]::new(
    $SourceX + ($Frame * 16) + $CropX,
    $SourceY + $CropY,
    $CropWidth,
    $CropHeight
  )
  $destinationRectangle = [System.Drawing.Rectangle]::new(
    $DestinationX,
    $DestinationY,
    $CropWidth * $Scale,
    $CropHeight * $Scale
  )

  $Graphics.DrawImage(
    $Source,
    $destinationRectangle,
    $sourceRectangle,
    [System.Drawing.GraphicsUnit]::Pixel
  )
}

function Draw-TintedSourceCrop {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Source,
    [int]$SourceX,
    [int]$SourceY,
    [int]$Frame,
    [int]$CropX,
    [int]$CropY,
    [int]$CropWidth,
    [int]$CropHeight,
    [int]$Scale,
    [double[]]$Tint,
    [int]$DestinationX,
    [int]$DestinationY
  )

  $overlay = New-TransparentBitmap -Width $CropWidth -Height $CropHeight

  try {
    for ($pixelY = 0; $pixelY -lt $CropHeight; $pixelY += 1) {
      for ($pixelX = 0; $pixelX -lt $CropWidth; $pixelX += 1) {
        $sourcePixel = $Source.GetPixel(
          $SourceX + ($Frame * 16) + $CropX + $pixelX,
          $SourceY + $CropY + $pixelY
        )

        if ($sourcePixel.A -eq 0) {
          continue
        }

        $red = [Math]::Min(255, [Math]::Round($sourcePixel.R * $Tint[0]))
        $green = [Math]::Min(255, [Math]::Round($sourcePixel.G * $Tint[1]))
        $blue = [Math]::Min(255, [Math]::Round($sourcePixel.B * $Tint[2]))
        $overlay.SetPixel(
          $pixelX,
          $pixelY,
          [System.Drawing.Color]::FromArgb(
            $sourcePixel.A,
            [int]$red,
            [int]$green,
            [int]$blue
          )
        )
      }
    }

    $sourceRectangle = [System.Drawing.Rectangle]::new(
      0,
      0,
      $CropWidth,
      $CropHeight
    )
    $destinationRectangle = [System.Drawing.Rectangle]::new(
      $DestinationX,
      $DestinationY,
      $CropWidth * $Scale,
      $CropHeight * $Scale
    )
    $Graphics.DrawImage(
      $overlay,
      $destinationRectangle,
      $sourceRectangle,
      [System.Drawing.GraphicsUnit]::Pixel
    )
  }
  finally {
    $overlay.Dispose()
  }
}

function Draw-WarmPlant {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Source,
    [hashtable]$Family,
    [int]$StageIndex,
    [int]$DestinationX,
    [int]$DestinationY
  )

  switch ($StageIndex) {
    0 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 2 3 21 9 6 4 `
        ($DestinationX + 14) ($DestinationY + 50)
    }
    1 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 3 2 12 13 15 2 `
        ($DestinationX + 19) ($DestinationY + 44)
    }
    2 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 4 1 3 15 24 2 `
        ($DestinationX + 17) ($DestinationY + 26)
    }
    3 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 2 0 13 27 2 `
        ($DestinationX + 19) ($DestinationY + 20)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 2 0 13 10 3 `
        ($DestinationX + 12) ($DestinationY + 15)
    }
    4 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 2 0 13 27 2 `
        ($DestinationX + 21) ($DestinationY + 20)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 2 0 13 10 3 `
        ($DestinationX + 12) ($DestinationY + 12)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 6 8 5 19 2 `
        ($DestinationX + 44) ($DestinationY + 36)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 2 0 13 10 2 `
        ($DestinationX + 36) ($DestinationY + 24)
    }
  }
}

function Draw-CoolPlant {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Source,
    [hashtable]$Family,
    [int]$StageIndex,
    [int]$DestinationX,
    [int]$DestinationY
  )

  $leafSourceY = 448

  switch ($StageIndex) {
    0 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 2 5 23 4 4 5 `
        ($DestinationX + 22) ($DestinationY + 54)
    }
    1 {
      Draw-SourceCrop $Graphics $Source 128 $leafSourceY 3 4 16 6 11 3 `
        ($DestinationX + 23) ($DestinationY + 41)
    }
    2 {
      Draw-SourceCrop $Graphics $Source 128 $leafSourceY 4 2 12 11 15 2 `
        ($DestinationX + 21) ($DestinationY + 44)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 3 9 9 8 2 `
        $Family.OverlayTint ($DestinationX + 23) ($DestinationY + 32)
    }
    3 {
      Draw-SourceCrop $Graphics $Source 128 $leafSourceY 4 2 12 11 15 3 `
        ($DestinationX + 15) ($DestinationY + 29)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 3 9 9 8 3 `
        $Family.OverlayTint ($DestinationX + 18) ($DestinationY + 17)
    }
    4 {
      Draw-SourceCrop $Graphics $Source 128 $leafSourceY 4 2 12 11 15 3 `
        ($DestinationX + 16) ($DestinationY + 29)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 3 9 9 8 3 `
        $Family.OverlayTint ($DestinationX + 18) ($DestinationY + 11)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 5 16 4 11 2 `
        ($DestinationX + 13) ($DestinationY + 46)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 3 9 9 8 2 `
        $Family.OverlayTint ($DestinationX + 8) ($DestinationY + 31)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 5 5 16 4 11 2 `
        ($DestinationX + 47) ($DestinationY + 41)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 3 9 9 8 2 `
        $Family.OverlayTint ($DestinationX + 41) ($DestinationY + 26)
    }
  }
}

function Draw-SoftPlant {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Source,
    [hashtable]$Family,
    [int]$StageIndex,
    [int]$DestinationX,
    [int]$DestinationY
  )

  switch ($StageIndex) {
    0 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 2 5 22 5 5 4 `
        ($DestinationX + 22) ($DestinationY + 54)
    }
    1 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 3 4 16 6 11 3 `
        ($DestinationX + 23) ($DestinationY + 41)
    }
    2 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 4 2 12 11 15 2 `
        ($DestinationX + 21) ($DestinationY + 44)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 2 7 11 9 2 `
        $Family.OverlayTint ($DestinationX + 21) ($DestinationY + 32)
    }
    3 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 4 2 12 11 15 3 `
        ($DestinationX + 15) ($DestinationY + 29)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 2 7 11 9 3 `
        $Family.OverlayTint ($DestinationX + 15) ($DestinationY + 12)
    }
    4 {
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 4 2 12 11 15 2 `
        ($DestinationX + 10) ($DestinationY + 44)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 4 2 12 11 15 2 `
        ($DestinationX + 34) ($DestinationY + 42)
      Draw-SourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 4 2 12 11 15 2 `
        ($DestinationX + 22) ($DestinationY + 38)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 2 7 11 9 3 `
        $Family.OverlayTint ($DestinationX + 15) ($DestinationY + 10)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 2 7 11 9 2 `
        $Family.OverlayTint ($DestinationX + 7) ($DestinationY + 29)
      Draw-TintedSourceCrop $Graphics $Source $Family.SourceX $Family.SourceY 6 2 7 11 9 2 `
        $Family.OverlayTint ($DestinationX + 39) ($DestinationY + 24)
    }
  }
}

function Draw-PlantFrame {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Source,
    [hashtable]$Family,
    [int]$StageIndex,
    [int]$DestinationX,
    [int]$DestinationY
  )

  switch ($Family.Id) {
    "sunflower" {
      Draw-WarmPlant $Graphics $Source $Family $StageIndex $DestinationX $DestinationY
    }
    "lavender" {
      Draw-CoolPlant $Graphics $Source $Family $StageIndex $DestinationX $DestinationY
    }
    "dandelion" {
      Draw-SoftPlant $Graphics $Source $Family $StageIndex $DestinationX $DestinationY
    }
  }
}

$source = [System.Drawing.Bitmap]::FromFile($sourcePath)

try {
  $atlas = New-TransparentBitmap `
    -Width ($frameWidth * $stageCount) `
    -Height ($frameHeight * $families.Count)
  $atlasGraphics = [System.Drawing.Graphics]::FromImage($atlas)

  try {
    Set-PixelArtGraphics -Graphics $atlasGraphics
    $atlasGraphics.Clear([System.Drawing.Color]::Transparent)

    for ($familyIndex = 0; $familyIndex -lt $families.Count; $familyIndex += 1) {
      $family = $families[$familyIndex]

      for ($stageIndex = 0; $stageIndex -lt $stageCount; $stageIndex += 1) {
        Draw-PlantFrame `
          -Graphics $atlasGraphics `
          -Source $source `
          -Family $family `
          -StageIndex $stageIndex `
          -DestinationX ($stageIndex * $frameWidth) `
          -DestinationY ($familyIndex * $frameHeight)
      }
    }

    $atlas.Save($atlasPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $atlasGraphics.Dispose()
    $atlas.Dispose()
  }

  $shadow = New-TransparentBitmap -Width 64 -Height 16
  $shadowGraphics = [System.Drawing.Graphics]::FromImage($shadow)

  try {
    Set-PixelArtGraphics -Graphics $shadowGraphics
    $shadowGraphics.Clear([System.Drawing.Color]::Transparent)
    $shadowGraphics.FillRectangle(
      [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(32, 24, 54, 38)),
      10,
      4,
      44,
      8
    )
    $shadowGraphics.FillRectangle(
      [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(52, 24, 54, 38)),
      16,
      2,
      32,
      12
    )
    $shadow.Save($shadowPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $shadowGraphics.Dispose()
    $shadow.Dispose()
  }
}
finally {
  $source.Dispose()
}

if (-not [string]::IsNullOrWhiteSpace($AnalysisDirectory)) {
  New-Item -ItemType Directory -Force -Path $AnalysisDirectory | Out-Null

  $atlas = [System.Drawing.Bitmap]::FromFile($atlasPath)
  $shadow = [System.Drawing.Bitmap]::FromFile($shadowPath)

  try {
    $growthSheet = New-TransparentBitmap -Width 1100 -Height 690
    $growthGraphics = [System.Drawing.Graphics]::FromImage($growthSheet)

    try {
      Set-PixelArtGraphics -Graphics $growthGraphics
      $growthGraphics.Clear([System.Drawing.Color]::FromArgb(255, 245, 241, 229))
      $titleFont = [System.Drawing.Font]::new(
        "Segoe UI",
        14,
        [System.Drawing.FontStyle]::Bold
      )
      $labelFont = [System.Drawing.Font]::new(
        "Consolas",
        10,
        [System.Drawing.FontStyle]::Regular
      )

      try {
        $stageLabels = @(
          "seedling",
          "growing",
          "budding",
          "blooming",
          "permanent_bloom"
        )

        for ($familyIndex = 0; $familyIndex -lt $families.Count; $familyIndex += 1) {
          $family = $families[$familyIndex]
          $top = 18 + ($familyIndex * 220)
          $growthGraphics.DrawString(
            "$($family.Label) / $($family.Id)",
            $titleFont,
            [System.Drawing.Brushes]::Black,
            18,
            $top
          )

          for ($stageIndex = 0; $stageIndex -lt $stageCount; $stageIndex += 1) {
            $sourceRectangle = [System.Drawing.Rectangle]::new(
              $stageIndex * $frameWidth,
              $familyIndex * $frameHeight,
              $frameWidth,
              $frameHeight
            )
            $destinationX = 22 + ($stageIndex * 210)
            $destinationRectangle = [System.Drawing.Rectangle]::new(
              $destinationX,
              $top + 32,
              $frameWidth,
              $frameHeight
            )
            $growthGraphics.DrawImage(
              $atlas,
              $destinationRectangle,
              $sourceRectangle,
              [System.Drawing.GraphicsUnit]::Pixel
            )
            $growthGraphics.DrawString(
              $stageLabels[$stageIndex],
              $labelFont,
              [System.Drawing.Brushes]::DimGray,
              $destinationX,
              $top + 126
            )
          }
        }

        $growthSheet.Save(
          (Join-Path $AnalysisDirectory "content-plant-growth-candidates.png"),
          [System.Drawing.Imaging.ImageFormat]::Png
        )
      }
      finally {
        $titleFont.Dispose()
        $labelFont.Dispose()
      }
    }
    finally {
      $growthGraphics.Dispose()
      $growthSheet.Dispose()
    }

    $runtimeSheet = New-TransparentBitmap -Width 900 -Height 360
    $runtimeGraphics = [System.Drawing.Graphics]::FromImage($runtimeSheet)

    try {
      Set-PixelArtGraphics -Graphics $runtimeGraphics
      $runtimeGraphics.Clear([System.Drawing.Color]::FromArgb(255, 114, 157, 86))
      $runtimeGraphics.FillRectangle(
        [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 100, 143, 75)),
        0,
        250,
        900,
        110
      )

      for ($familyIndex = 0; $familyIndex -lt $families.Count; $familyIndex += 1) {
        $x = 150 + ($familyIndex * 300)
        $runtimeGraphics.DrawImage($shadow, $x - 32, 237, 64, 16)
        $sourceRectangle = [System.Drawing.Rectangle]::new(
          (4 * $frameWidth),
          $familyIndex * $frameHeight,
          $frameWidth,
          $frameHeight
        )
        $destinationRectangle = [System.Drawing.Rectangle]::new(
          $x - 32,
          157,
          $frameWidth,
          $frameHeight
        )
        $runtimeGraphics.DrawImage(
          $atlas,
          $destinationRectangle,
          $sourceRectangle,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      }

      $runtimeSheet.Save(
        (Join-Path $AnalysisDirectory "content-plant-runtime-preview.png"),
        [System.Drawing.Imaging.ImageFormat]::Png
      )
    }
    finally {
      $runtimeGraphics.Dispose()
      $runtimeSheet.Dispose()
    }
  }
  finally {
    $atlas.Dispose()
    $shadow.Dispose()
  }
}

Write-Output "Generated $atlasPath"
Write-Output "Generated $shadowPath"
