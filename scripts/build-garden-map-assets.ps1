param(
  [Parameter(Mandatory = $true)]
  [string] $SourceRoot
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$resolvedSourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot "public\assets\garden"

$tilesDirectory = Join-Path $assetRoot "tiles"
$decorDirectory = Join-Path $assetRoot "decor"

New-Item -ItemType Directory -Force -Path $tilesDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $decorDirectory | Out-Null

function Get-SourcePath {
  param([Parameter(Mandatory = $true)][string] $RelativePath)

  $path = Join-Path $resolvedSourceRoot $RelativePath

  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing required garden source image: $RelativePath"
  }

  return $path
}

function New-TransparentBitmap {
  param(
    [Parameter(Mandatory = $true)][int] $Width,
    [Parameter(Mandatory = $true)][int] $Height
  )

  $bitmap = [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
  }
  finally {
    $graphics.Dispose()
  }

  return $bitmap
}

function Copy-NearestRegion {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Destination,
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][int] $SourceX,
    [Parameter(Mandatory = $true)][int] $SourceY,
    [Parameter(Mandatory = $true)][int] $SourceWidth,
    [Parameter(Mandatory = $true)][int] $SourceHeight,
    [Parameter(Mandatory = $true)][int] $DestinationX,
    [Parameter(Mandatory = $true)][int] $DestinationY,
    [int] $Scale = 2
  )

  $source = [System.Drawing.Bitmap]::FromFile($SourcePath)
  $graphics = [System.Drawing.Graphics]::FromImage($Destination)

  try {
    if (
      $SourceX -lt 0 -or
      $SourceY -lt 0 -or
      $SourceX + $SourceWidth -gt $source.Width -or
      $SourceY + $SourceHeight -gt $source.Height
    ) {
      throw "Crop is outside source image bounds: $SourcePath"
    }

    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality =
      [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $graphics.InterpolationMode =
      [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

    $sourceRectangle = [System.Drawing.Rectangle]::new(
      $SourceX,
      $SourceY,
      $SourceWidth,
      $SourceHeight
    )
    $destinationRectangle = [System.Drawing.Rectangle]::new(
      $DestinationX,
      $DestinationY,
      $SourceWidth * $Scale,
      $SourceHeight * $Scale
    )

    $graphics.DrawImage(
      $source,
      $destinationRectangle,
      $sourceRectangle,
      [System.Drawing.GraphicsUnit]::Pixel
    )
  }
  finally {
    $graphics.Dispose()
    $source.Dispose()
  }
}

function Overlay-NearestRegion {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Destination,
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][int] $SourceX,
    [Parameter(Mandatory = $true)][int] $SourceY,
    [Parameter(Mandatory = $true)][int] $SourceWidth,
    [Parameter(Mandatory = $true)][int] $SourceHeight,
    [Parameter(Mandatory = $true)][int] $DestinationX,
    [Parameter(Mandatory = $true)][int] $DestinationY,
    [int] $Scale = 2
  )

  $source = [System.Drawing.Bitmap]::FromFile($SourcePath)
  $graphics = [System.Drawing.Graphics]::FromImage($Destination)

  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality =
      [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $graphics.InterpolationMode =
      [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

    $graphics.DrawImage(
      $source,
      [System.Drawing.Rectangle]::new(
        $DestinationX,
        $DestinationY,
        $SourceWidth * $Scale,
        $SourceHeight * $Scale
      ),
      [System.Drawing.Rectangle]::new(
        $SourceX,
        $SourceY,
        $SourceWidth,
        $SourceHeight
      ),
      [System.Drawing.GraphicsUnit]::Pixel
    )
  }
  finally {
    $graphics.Dispose()
    $source.Dispose()
  }
}

function Overlay-NearestRegionSized {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Destination,
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][int] $SourceX,
    [Parameter(Mandatory = $true)][int] $SourceY,
    [Parameter(Mandatory = $true)][int] $SourceWidth,
    [Parameter(Mandatory = $true)][int] $SourceHeight,
    [Parameter(Mandatory = $true)][int] $DestinationX,
    [Parameter(Mandatory = $true)][int] $DestinationY,
    [Parameter(Mandatory = $true)][int] $DestinationWidth,
    [Parameter(Mandatory = $true)][int] $DestinationHeight
  )

  $source = [System.Drawing.Bitmap]::FromFile($SourcePath)
  $graphics = [System.Drawing.Graphics]::FromImage($Destination)

  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality =
      [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $graphics.InterpolationMode =
      [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

    $graphics.DrawImage(
      $source,
      [System.Drawing.Rectangle]::new(
        $DestinationX,
        $DestinationY,
        $DestinationWidth,
        $DestinationHeight
      ),
      [System.Drawing.Rectangle]::new(
        $SourceX,
        $SourceY,
        $SourceWidth,
        $SourceHeight
      ),
      [System.Drawing.GraphicsUnit]::Pixel
    )
  }
  finally {
    $graphics.Dispose()
    $source.Dispose()
  }
}

function Blend-WarmPixelsToGardenGreen {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][double] $Amount
  )

  $target = [System.Drawing.Color]::FromArgb(91, 137, 73)

  for ($row = 0; $row -lt $Bitmap.Height; $row += 1) {
    for ($column = 0; $column -lt $Bitmap.Width; $column += 1) {
      $color = $Bitmap.GetPixel($column, $row)

      $isWater = $color.B -gt $color.R + 12 -and $color.B -gt $color.G
      $isGardenBank =
        $color.A -gt 0 -and
        -not $isWater -and
        $color.R -gt 85 -and
        $color.G -gt 80 -and
        $color.B -lt 120

      if ($isGardenBank) {
        $red = [Math]::Round($color.R * (1 - $Amount) + $target.R * $Amount)
        $green = [Math]::Round($color.G * (1 - $Amount) + $target.G * $Amount)
        $blue = [Math]::Round($color.B * (1 - $Amount) + $target.B * $Amount)
        $Bitmap.SetPixel(
          $column,
          $row,
          [System.Drawing.Color]::FromArgb($color.A, $red, $green, $blue)
        )
      }
    }
  }
}

function Carve-PondOuterBank {
  param([Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap)

  $centerX = ($Bitmap.Width - 1) / 2
  $centerY = ($Bitmap.Height - 1) / 2

  for ($row = 0; $row -lt $Bitmap.Height; $row += 1) {
    for ($column = 0; $column -lt $Bitmap.Width; $column += 1) {
      $normalizedX = ($column - $centerX) / 76
      $normalizedY = ($row - $centerY) / 74
      $edgeNoise = (([Math]::Floor($column / 10) + [Math]::Floor($row / 14)) % 3) * 0.018

      if (($normalizedX * $normalizedX) + ($normalizedY * $normalizedY) -gt 1 + $edgeNoise) {
        $Bitmap.SetPixel($column, $row, [System.Drawing.Color]::Transparent)
      }
    }
  }
}

function Recolor-FlowerPetals {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileIndex,
    [Parameter(Mandatory = $true)][System.Drawing.Color] $Target
  )

  $startX = $TileIndex * 32

  for ($row = 0; $row -lt 32; $row += 1) {
    for ($column = $startX; $column -lt $startX + 32; $column += 1) {
      $color = $Bitmap.GetPixel($column, $row)
      $isLightPetal =
        $color.A -gt 0 -and
        $color.R -gt 145 -and
        $color.B -gt 115 -and
        ($color.G -gt 105 -or $color.R -gt $color.G + 35)

      if ($isLightPetal) {
        $red = [Math]::Round($color.R * 0.25 + $Target.R * 0.75)
        $green = [Math]::Round($color.G * 0.25 + $Target.G * 0.75)
        $blue = [Math]::Round($color.B * 0.25 + $Target.B * 0.75)
        $Bitmap.SetPixel(
          $column,
          $row,
          [System.Drawing.Color]::FromArgb($color.A, $red, $green, $blue)
        )
      }
    }
  }
}

function Set-PixelBlock {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $X,
    [Parameter(Mandatory = $true)][int] $Y,
    [Parameter(Mandatory = $true)][System.Drawing.Color] $Color,
    [int] $Size = 2
  )

  for ($row = $Y; $row -lt [Math]::Min($Y + $Size, $Bitmap.Height); $row += 1) {
    for ($column = $X; $column -lt [Math]::Min($X + $Size, $Bitmap.Width); $column += 1) {
      if ($column -ge 0 -and $row -ge 0) {
        $Bitmap.SetPixel($column, $row, $Color)
      }
    }
  }
}

function Paint-QuietGrassTile {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileIndex
  )

  $bases = @(
    [System.Drawing.Color]::FromArgb(101, 151, 78),
    [System.Drawing.Color]::FromArgb(104, 153, 80),
    [System.Drawing.Color]::FromArgb(99, 148, 76),
    [System.Drawing.Color]::FromArgb(106, 154, 81)
  )
  $base = $bases[$TileIndex % $bases.Count]
  $shade = [System.Drawing.Color]::FromArgb(91, 139, 70)
  $light = [System.Drawing.Color]::FromArgb(116, 164, 90)
  $tileStartX = $TileIndex * 32

  for ($row = 0; $row -lt 32; $row += 1) {
    for ($column = 0; $column -lt 32; $column += 1) {
      $Bitmap.SetPixel($tileStartX + $column, $row, $base)
    }
  }

  foreach ($tuft in @(
      @(6, 9),
      @(22, 23)
    )) {
    $offsetX = ($tuft[0] + $TileIndex * 5) % 28
    $offsetY = ($tuft[1] + $TileIndex * 3) % 28
    Set-PixelBlock $Bitmap ($tileStartX + $offsetX) $offsetY $shade 2
    Set-PixelBlock $Bitmap ($tileStartX + $offsetX + 2) ($offsetY - 2) $light 2
  }
}

function Add-FlowerCarpetPattern {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileIndex,
    [Parameter(Mandatory = $true)][int] $FlowerCount,
    [Parameter(Mandatory = $true)][int] $Variant
  )

  $tileStartX = $TileIndex * 32
  $themePalettes = @(
    @(
      [System.Drawing.Color]::FromArgb(239, 218, 151),
      [System.Drawing.Color]::FromArgb(225, 139, 161)
    ),
    @(
      [System.Drawing.Color]::FromArgb(115, 169, 222),
      [System.Drawing.Color]::FromArgb(183, 139, 205)
    ),
    @(
      [System.Drawing.Color]::FromArgb(224, 135, 169),
      [System.Drawing.Color]::FromArgb(235, 221, 184)
    ),
    @(
      [System.Drawing.Color]::FromArgb(236, 190, 112),
      [System.Drawing.Color]::FromArgb(219, 125, 155)
    ),
    @(
      [System.Drawing.Color]::FromArgb(126, 178, 220),
      [System.Drawing.Color]::FromArgb(229, 225, 192)
    ),
    @(
      [System.Drawing.Color]::FromArgb(190, 145, 210),
      [System.Drawing.Color]::FromArgb(226, 146, 177)
    )
  )
  $petalPalette = $themePalettes[$Variant % $themePalettes.Count]
  $leafDark = [System.Drawing.Color]::FromArgb(45, 105, 49)
  $leafMid = [System.Drawing.Color]::FromArgb(62, 128, 57)
  $leafLight = [System.Drawing.Color]::FromArgb(82, 145, 67)
  $flowerPositions = @(
    @(1, 1),
    @(11, 0),
    @(20, 2),
    @(4, 7),
    @(14, 7),
    @(21, 10),
    @(0, 15),
    @(10, 14),
    @(19, 16),
    @(3, 22),
    @(13, 21),
    @(21, 22),
    @(1, 10),
    @(16, 11),
    @(8, 24),
    @(22, 5)
  )

  for ($index = 0; $index -lt $FlowerCount; $index += 1) {
    $position = $flowerPositions[
      ($index + $Variant * 2 + $TileIndex) % $flowerPositions.Count
    ]
    $localX = $position[0]
    $localY = $position[1]
    $petal = $petalPalette[($index + $Variant) % $petalPalette.Count]
    $secondaryPetal = $petalPalette[($index + $Variant + 1) % $petalPalette.Count]

    # Each entry is a low, asymmetric patch of foliage with tiny colour
    # accents. Keeping the overlay transparent makes neighbouring cells read
    # as one flower carpet instead of a grid of opaque square icons.
    Set-PixelBlock $Bitmap ($tileStartX + $localX - 1) ($localY + 3) $leafDark 6
    Set-PixelBlock $Bitmap ($tileStartX + $localX + 3) ($localY + 1) $leafMid 6
    Set-PixelBlock $Bitmap ($tileStartX + $localX + 7) ($localY + 5) $leafLight 5
    Set-PixelBlock $Bitmap ($tileStartX + $localX + 1) ($localY + 7) $leafMid 5

    Set-PixelBlock $Bitmap ($tileStartX + $localX + 1) ($localY + 2) $petal 2
    Set-PixelBlock $Bitmap ($tileStartX + $localX + 5) ($localY + 4) $petal 2
    Set-PixelBlock $Bitmap ($tileStartX + $localX + 2) ($localY + 7) $secondaryPetal 2
    Set-PixelBlock $Bitmap ($tileStartX + $localX + 8) ($localY + 6) $secondaryPetal 2
  }
}

function Add-LeafCluster {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileStartX,
    [Parameter(Mandatory = $true)][int] $LocalX,
    [Parameter(Mandatory = $true)][int] $LocalY,
    [Parameter(Mandatory = $true)][int] $Variant,
    [switch] $WithFlower
  )

  $leafDark = [System.Drawing.Color]::FromArgb(61, 125, 56)
  $leafMid = [System.Drawing.Color]::FromArgb(77, 146, 65)
  $leafLight = [System.Drawing.Color]::FromArgb(100, 164, 79)
  $petals = @(
    [System.Drawing.Color]::FromArgb(235, 207, 162),
    [System.Drawing.Color]::FromArgb(126, 172, 216),
    [System.Drawing.Color]::FromArgb(187, 142, 203),
    [System.Drawing.Color]::FromArgb(219, 131, 165)
  )

  Set-PixelBlock $Bitmap ($TileStartX + $LocalX) ($LocalY + 2) $leafDark 4
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 4) $LocalY $leafMid 4
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 7) ($LocalY + 3) $leafLight 3
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 2) ($LocalY + 6) $leafMid 3

  if ($WithFlower) {
    $petal = $petals[$Variant % $petals.Count]
    Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 4) $LocalY $petal 3
    Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 7) ($LocalY + 3) $petal 3
    Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 3) ($LocalY + 4) $petal 2
    Set-PixelBlock `
      $Bitmap `
      ($TileStartX + $LocalX + 6) `
      ($LocalY + 3) `
      ([System.Drawing.Color]::FromArgb(224, 184, 83)) `
      2
  }
}

function Add-FlowerbedEdge {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileIndex,
    [switch] $Top,
    [switch] $Right,
    [switch] $Bottom,
    [switch] $Left
  )

  $tileStartX = $TileIndex * 32
  $leafDark = [System.Drawing.Color]::FromArgb(220, 38, 91, 45)
  $leafMid = [System.Drawing.Color]::FromArgb(218, 54, 119, 54)
  $leafLight = [System.Drawing.Color]::FromArgb(210, 81, 143, 64)

  # Only the natural leafy rim is opaque. The centre stays transparent so a
  # Stage 0 bed reads as a garden outline on grass instead of a flat planning
  # polygon. Later growth layers fill the same silhouette.
  $paintHorizontalEdge = {
    param([int] $BaseY, [int] $Direction)

    for ($column = 0; $column -lt 32; $column += 4) {
      $jitter = (($column * 7 + $TileIndex * 5) % 5) - 2
      $localY = $BaseY + $jitter * $Direction
      Set-PixelBlock $Bitmap ($tileStartX + $column - 2) $localY $leafDark 8
      Set-PixelBlock `
        $Bitmap `
        ($tileStartX + $column + 1) `
        ($localY + 3 * $Direction) `
        $leafMid `
        7
      Set-PixelBlock `
        $Bitmap `
        ($tileStartX + $column + 4) `
        ($localY + 1 * $Direction) `
        $leafLight `
        4
    }
  }
  $paintVerticalEdge = {
    param([int] $BaseX, [int] $Direction)

    for ($row = 0; $row -lt 32; $row += 4) {
      $jitter = (($row * 5 + $TileIndex * 3) % 5) - 2
      $localX = $BaseX + $jitter * $Direction
      Set-PixelBlock $Bitmap ($tileStartX + $localX) ($row - 2) $leafDark 8
      Set-PixelBlock `
        $Bitmap `
        ($tileStartX + $localX + 3 * $Direction) `
        ($row + 1) `
        $leafMid `
        7
      Set-PixelBlock `
        $Bitmap `
        ($tileStartX + $localX + 1 * $Direction) `
        ($row + 4) `
        $leafLight `
        4
    }
  }

  if ($Top) {
    & $paintHorizontalEdge 1 1
  }

  if ($Bottom) {
    & $paintHorizontalEdge 27 -1
  }

  if ($Left) {
    & $paintVerticalEdge 1 1
  }

  if ($Right) {
    & $paintVerticalEdge 27 -1
  }
}

function Set-MacroPixelBlock {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $MacroStartTile,
    [Parameter(Mandatory = $true)][int] $X,
    [Parameter(Mandatory = $true)][int] $Y,
    [Parameter(Mandatory = $true)][System.Drawing.Color] $Color,
    [int] $Size = 2
  )

  for ($row = $Y; $row -lt $Y + $Size; $row += 1) {
    for ($column = $X; $column -lt $X + $Size; $column += 1) {
      if ($column -lt 0 -or $column -ge 64 -or $row -lt 0 -or $row -ge 64) {
        continue
      }

      $quadrantColumn = [Math]::Floor($column / 32)
      $quadrantRow = [Math]::Floor($row / 32)
      $tileIndex = $MacroStartTile + $quadrantRow * 2 + $quadrantColumn
      $targetX = $tileIndex * 32 + ($column % 32)
      $targetY = $row % 32
      $Bitmap.SetPixel($targetX, $targetY, $Color)
    }
  }
}

function Add-MacroLeafPatch {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $MacroStartTile,
    [Parameter(Mandatory = $true)][int] $CenterX,
    [Parameter(Mandatory = $true)][int] $CenterY,
    [Parameter(Mandatory = $true)][int] $RadiusX,
    [Parameter(Mandatory = $true)][int] $RadiusY,
    [Parameter(Mandatory = $true)][int] $Variant
  )

  $dark = [System.Drawing.Color]::FromArgb(238, 25, 73, 38)
  $mid = [System.Drawing.Color]::FromArgb(236, 39, 97, 45)
  $light = [System.Drawing.Color]::FromArgb(230, 58, 122, 55)

  for ($row = $CenterY - $RadiusY; $row -le $CenterY + $RadiusY; $row += 2) {
    for ($column = $CenterX - $RadiusX; $column -le $CenterX + $RadiusX; $column += 2) {
      $normalized =
        ((($column - $CenterX) / $RadiusX) * (($column - $CenterX) / $RadiusX)) +
        ((($row - $CenterY) / $RadiusY) * (($row - $CenterY) / $RadiusY))
      $edgeNoise = (($column * 13 + $row * 7 + $Variant * 11) % 9) * 0.025

      if ($normalized -gt 1 + $edgeNoise) {
        continue
      }

      $hash = [Math]::Abs(($column * 509) -bxor ($row * 379) -bxor ($Variant * 997))
      $color = if ($hash % 11 -eq 0) {
        $light
      }
      elseif ($hash % 5 -eq 0) {
        $dark
      }
      else {
        $mid
      }
      Set-MacroPixelBlock $Bitmap $MacroStartTile $column $row $color 2
    }
  }
}

function Add-FlowerbedMacro {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $MacroStartTile,
    [Parameter(Mandatory = $true)][int] $Theme,
    [Parameter(Mandatory = $true)][int] $Tier
  )

  $palettes = @(
    @(
      [System.Drawing.Color]::FromArgb(231, 145, 171),
      [System.Drawing.Color]::FromArgb(244, 219, 170),
      [System.Drawing.Color]::FromArgb(205, 118, 151)
    ),
    @(
      [System.Drawing.Color]::FromArgb(125, 176, 219),
      [System.Drawing.Color]::FromArgb(188, 150, 211),
      [System.Drawing.Color]::FromArgb(228, 222, 190)
    ),
    @(
      [System.Drawing.Color]::FromArgb(240, 214, 159),
      [System.Drawing.Color]::FromArgb(218, 136, 166),
      [System.Drawing.Color]::FromArgb(137, 184, 212)
    )
  )
  $palette = $palettes[$Theme % $palettes.Count]
  $leafDark = [System.Drawing.Color]::FromArgb(40, 96, 45)
  $leafLight = [System.Drawing.Color]::FromArgb(85, 151, 68)
  $patches = @(
    @(13, 15, 14, 10),
    @(39, 12, 16, 10),
    @(50, 34, 13, 12),
    @(27, 33, 18, 13),
    @(14, 50, 15, 11),
    @(43, 52, 17, 10)
  )
  $flowerClusterCenters = @(
    @(17, 18),
    @(34, 18),
    @(48, 27),
    @(22, 40),
    @(41, 46)
  )
  $patchCount = if ($Tier -eq 1) { 3 } elseif ($Tier -eq 2) { 5 } else { 6 }
  $flowerCount = if ($Tier -eq 1) { 7 } elseif ($Tier -eq 2) { 13 } else { 19 }

  # A broad central leaf mass makes the four quadrants read as one designed
  # flowerbed. Higher tiers enlarge the same mass instead of scattering more
  # unrelated sprites across the map.
  $mainRadiusX = if ($Tier -eq 1) { 20 } elseif ($Tier -eq 2) { 27 } else { 32 }
  $mainRadiusY = if ($Tier -eq 1) { 16 } elseif ($Tier -eq 2) { 23 } else { 29 }
  Add-MacroLeafPatch `
    $Bitmap `
    $MacroStartTile `
    32 `
    33 `
    $mainRadiusX `
    $mainRadiusY `
    ($Theme * 17 + $Tier * 29)

  for ($patchIndex = 0; $patchIndex -lt $patchCount; $patchIndex += 1) {
    $patch = $patches[($patchIndex + $Theme) % $patches.Count]
    Add-MacroLeafPatch `
      $Bitmap `
      $MacroStartTile `
      $patch[0] `
      $patch[1] `
      $patch[2] `
      $patch[3] `
      ($patchIndex + $Theme * 7 + $Tier * 13)
  }

  for ($flowerIndex = 0; $flowerIndex -lt $flowerCount; $flowerIndex += 1) {
    $clusterCount = if ($Tier -eq 1) { 2 } elseif ($Tier -eq 2) { 4 } else { 5 }
    $cluster =
      $flowerClusterCenters[($flowerIndex + $Theme + $Tier) % $clusterCount]
    $petal = $palette[$flowerIndex % $palette.Count]
    $accent = $palette[($flowerIndex + 1) % $palette.Count]
    $offsetX = (($flowerIndex * 7 + $Theme * 3) % 13) - 6
    $offsetY = (($flowerIndex * 5 + $Tier * 2) % 11) - 5
    $x = $cluster[0] + $offsetX
    $y = $cluster[1] + $offsetY

    Set-MacroPixelBlock $Bitmap $MacroStartTile ($x - 4) ($y + 3) $leafDark 6
    Set-MacroPixelBlock $Bitmap $MacroStartTile ($x + 3) ($y + 1) $leafLight 6
    Set-MacroPixelBlock $Bitmap $MacroStartTile ($x - 1) ($y - 1) $petal 4
    Set-MacroPixelBlock $Bitmap $MacroStartTile ($x + 4) ($y + 3) $accent 3
    Set-MacroPixelBlock $Bitmap $MacroStartTile ($x - 2) ($y + 6) $petal 3
  }
}

function New-HedgeAtlas {
  $atlas = New-TransparentBitmap -Width 128 -Height 32
  $shadow = [System.Drawing.Color]::FromArgb(105, 30, 64, 39)
  $dark = [System.Drawing.Color]::FromArgb(39, 91, 48)
  $mid = [System.Drawing.Color]::FromArgb(55, 119, 57)
  $light = [System.Drawing.Color]::FromArgb(82, 148, 69)

  for ($tileIndex = 0; $tileIndex -lt 4; $tileIndex += 1) {
    $tileStartX = $tileIndex * 32

    for ($localX = 1; $localX -lt 31; $localX += 2) {
      $edgeInset = if ($tileIndex -eq 0 -and $localX -lt 5) {
        5 - $localX
      }
      elseif ($tileIndex -eq 3 -and $localX -gt 26) {
        $localX - 26
      }
      else {
        0
      }
      $top = 7 + (($localX * 5 + $tileIndex * 7) % 6) + $edgeInset

      Set-PixelBlock $atlas ($tileStartX + $localX) 28 $shadow 3

      for ($localY = $top; $localY -lt 30; $localY += 2) {
        $hash = [Math]::Abs(($localX * 211) -bxor ($localY * 307) -bxor ($tileIndex * 619))
        $color = if ($hash % 7 -eq 0) {
          $light
        }
        elseif ($hash % 5 -eq 0) {
          $dark
        }
        else {
          $mid
        }
        Set-PixelBlock $atlas ($tileStartX + $localX) $localY $color 3
      }
    }
  }

  return $atlas
}

function New-GardenPond {
  $pond = New-TransparentBitmap -Width 160 -Height 160
  $bankDark = [System.Drawing.Color]::FromArgb(49, 99, 54)
  $bankMid = [System.Drawing.Color]::FromArgb(68, 124, 62)
  $bankLight = [System.Drawing.Color]::FromArgb(91, 145, 73)
  $earth = [System.Drawing.Color]::FromArgb(118, 113, 76)
  $waterDark = [System.Drawing.Color]::FromArgb(49, 116, 131)
  $waterMid = [System.Drawing.Color]::FromArgb(63, 137, 150)
  $waterLight = [System.Drawing.Color]::FromArgb(88, 158, 165)

  for ($row = 0; $row -lt 160; $row += 2) {
    for ($column = 0; $column -lt 160; $column += 2) {
      $rowWave = [Math]::Sin($row / 19.0) * 6
      $outerX = ($column - 78 - $rowWave) / 72
      $outerY = ($row - 80) / 68
      $outerNoise =
        (([Math]::Floor($column / 12) * 2 + [Math]::Floor($row / 10)) % 4) * 0.022
      $outerDistance = ($outerX * $outerX) + ($outerY * $outerY)

      $isNorthEastNotch = $column -gt 119 -and $row -lt 53
      $isSouthWestNotch = $column -lt 28 -and $row -gt 108

      if ($outerDistance -gt 1 + $outerNoise -or $isNorthEastNotch -or $isSouthWestNotch) {
        continue
      }

      $innerX = ($column - 78 - $rowWave * 0.75) / 58
      $innerY = ($row - 80) / 52
      $innerDistance = ($innerX * $innerX) + ($innerY * $innerY)
      $hash = [Math]::Abs(($column * 919) -bxor ($row * 631))

      $color = if ($innerDistance -le 1) {
        if ($hash % 19 -eq 0) {
          $waterLight
        }
        elseif ($hash % 7 -eq 0) {
          $waterDark
        }
        else {
          $waterMid
        }
      }
      elseif ($innerDistance -le 1.22) {
        if ($hash % 5 -eq 0) { $bankDark } else { $earth }
      }
      elseif ($hash % 11 -eq 0) {
        $bankLight
      }
      elseif ($hash % 5 -eq 0) {
        $bankDark
      }
      else {
        $bankMid
      }

      Set-PixelBlock $pond $column $row $color 2
    }
  }

  foreach ($ripple in @(
      @(46, 64, 14),
      @(92, 50, 18),
      @(70, 93, 20),
      @(104, 111, 12)
    )) {
    for ($offset = 0; $offset -lt $ripple[2]; $offset += 2) {
      Set-PixelBlock $pond ($ripple[0] + $offset) $ripple[1] $waterLight 2
    }
  }

  foreach ($tuft in @(
      @(20, 72),
      @(36, 126),
      @(121, 48),
      @(132, 103),
      @(104, 137)
    )) {
    Set-PixelBlock $pond $tuft[0] $tuft[1] $bankDark 4
    Set-PixelBlock $pond ($tuft[0] + 4) ($tuft[1] - 4) $bankLight 4
    Set-PixelBlock $pond ($tuft[0] + 7) ($tuft[1] + 1) $bankMid 3
  }

  # Two small lily pads and asymmetric bankside flowers make the pond feel
  # tended without introducing character-like silhouettes.
  foreach ($pad in @(
      @(62, 72),
      @(101, 98)
    )) {
    Set-PixelBlock $pond $pad[0] $pad[1] $bankDark 10
    Set-PixelBlock $pond ($pad[0] + 2) ($pad[1] - 2) $bankMid 7
    Set-PixelBlock $pond ($pad[0] + 7) ($pad[1] + 1) $waterMid 4
  }
  foreach ($flower in @(
      @(30, 54, 0),
      @(119, 119, 1),
      @(44, 133, 2)
    )) {
    $petal = if ($flower[2] -eq 0) {
      [System.Drawing.Color]::FromArgb(230, 151, 177)
    }
    elseif ($flower[2] -eq 1) {
      [System.Drawing.Color]::FromArgb(135, 181, 221)
    }
    else {
      [System.Drawing.Color]::FromArgb(241, 221, 171)
    }
    Set-PixelBlock $pond $flower[0] $flower[1] $petal 4
    Set-PixelBlock $pond ($flower[0] + 4) ($flower[1] + 3) $petal 3
    Set-PixelBlock $pond ($flower[0] - 2) ($flower[1] + 5) $bankDark 4
  }

  return $pond
}

function Fill-LeafCarpetBase {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileIndex,
    [Parameter(Mandatory = $true)][int] $CoveragePercent
  )

  $tileStartX = $TileIndex * 32
  # The interior remains transparent at Stage 0. Only the organic rim and a
  # handful of deliberately composed anchor beds are visible until growth
  # fills the garden. Keep the arguments to document the stable tile contract.
  $null = $tileStartX
  $null = $CoveragePercent
}

function Add-FlowerAccent {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileStartX,
    [Parameter(Mandatory = $true)][int] $LocalX,
    [Parameter(Mandatory = $true)][int] $LocalY,
    [Parameter(Mandatory = $true)][int] $Variant
  )

  $petals = @(
    [System.Drawing.Color]::FromArgb(244, 220, 171),
    [System.Drawing.Color]::FromArgb(120, 176, 224),
    [System.Drawing.Color]::FromArgb(192, 147, 211),
    [System.Drawing.Color]::FromArgb(231, 133, 172)
  )
  $petal = $petals[$Variant % $petals.Count]
  $center = [System.Drawing.Color]::FromArgb(228, 184, 74)
  $leaf = [System.Drawing.Color]::FromArgb(77, 145, 67)

  # An offset five-block silhouette reads as a flower clump without creating
  # a symmetric pair of bright "eyes".
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX) $LocalY $petal 4
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 4) ($LocalY + 3) $petal 3
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 1) ($LocalY + 6) $petal 3
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 3) ($LocalY + 3) $center 2
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX - 2) ($LocalY + 6) $leaf 4
  Set-PixelBlock $Bitmap ($TileStartX + $LocalX + 6) ($LocalY + 7) $leaf 3
}

function New-FlowerbedAtlas {
  $atlas = New-TransparentBitmap -Width 2688 -Height 32
  $clusterPositions = @(
    @(1, 2),
    @(12, 1),
    @(20, 5),
    @(4, 12),
    @(15, 11),
    @(20, 15),
    @(1, 22),
    @(11, 21),
    @(19, 22),
    @(7, 6),
    @(17, 18),
    @(20, 1)
  )
  for ($tileIndex = 0; $tileIndex -lt 20; $tileIndex += 1) {
    $tileStartX = $tileIndex * 32
    $coverage = if ($tileIndex -lt 2) { 42 } else { 0 }

    if ($tileIndex -lt 2) {
      Fill-LeafCarpetBase $atlas $tileIndex $coverage
    }

    if ($tileIndex -lt 2) {
      for ($clusterIndex = 0; $clusterIndex -lt 3; $clusterIndex += 1) {
        $positionIndex = ($clusterIndex * 5 + $tileIndex * 3) % $clusterPositions.Count
        $position = $clusterPositions[$positionIndex]
        Add-LeafCluster `
          $atlas `
          $tileStartX `
          $position[0] `
          $position[1] `
          ($clusterIndex + $tileIndex)
      }
      continue
    }

    $patternIndex = if ($tileIndex -lt 8) {
      $tileIndex - 2
    }
    elseif ($tileIndex -lt 14) {
      $tileIndex - 8
    }
    else {
      $tileIndex - 14
    }
    $flowerCount = if ($tileIndex -lt 8) { 1 } elseif ($tileIndex -lt 14) { 2 } else { 4 }
    Add-FlowerCarpetPattern $atlas $tileIndex $flowerCount $patternIndex
  }

  for ($mask = 1; $mask -lt 16; $mask += 1) {
    Add-FlowerbedEdge `
      $atlas `
      (32 + $mask) `
      -Top:(($mask -band 1) -ne 0) `
      -Right:(($mask -band 2) -ne 0) `
      -Bottom:(($mask -band 4) -ne 0) `
      -Left:(($mask -band 8) -ne 0)
  }

  for ($theme = 0; $theme -lt 3; $theme += 1) {
    for ($tier = 1; $tier -le 3; $tier += 1) {
      $macroStartTile = 48 + (($theme * 3 + ($tier - 1)) * 4)
      Add-FlowerbedMacro $atlas $macroStartTile $theme $tier
    }
  }

  return $atlas
}

function Add-SteppingStone {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $TileStartX,
    [Parameter(Mandatory = $true)][int] $TileStartY,
    [Parameter(Mandatory = $true)][int] $CenterX,
    [Parameter(Mandatory = $true)][int] $CenterY,
    [Parameter(Mandatory = $true)][int] $RadiusX,
    [Parameter(Mandatory = $true)][int] $RadiusY,
    [Parameter(Mandatory = $true)][int] $Variant
  )

  $shadow = [System.Drawing.Color]::FromArgb(117, 102, 75)
  $mid = [System.Drawing.Color]::FromArgb(174, 151, 105)
  $light = [System.Drawing.Color]::FromArgb(204, 180, 129)

  for ($offsetY = -$RadiusY; $offsetY -le $RadiusY; $offsetY += 2) {
    for ($offsetX = -$RadiusX; $offsetX -le $RadiusX; $offsetX += 2) {
      $normalized =
        (($offsetX / $RadiusX) * ($offsetX / $RadiusX)) +
        (($offsetY / $RadiusY) * ($offsetY / $RadiusY))

      if ($normalized -gt 1) {
        continue
      }

      $hash = [Math]::Abs(
        (($CenterX + $offsetX) * 131) -bxor (($CenterY + $offsetY) * 197) -bxor ($Variant * 313)
      )
      $color = if ($normalized -gt 0.68) {
        $shadow
      }
      elseif ($hash % 7 -eq 0) {
        $light
      }
      else {
        $mid
      }
      Set-PixelBlock `
        $Bitmap `
        ($TileStartX + $CenterX + $offsetX) `
        ($TileStartY + $CenterY + $offsetY) `
        $color `
        2
    }
  }
}

function New-OrganicPathAtlas {
  $atlas = New-TransparentBitmap -Width 128 -Height 128
  $edge = [System.Drawing.Color]::FromArgb(184, 112, 91, 62)
  $earth = [System.Drawing.Color]::FromArgb(210, 171, 143, 93)
  $highlight = [System.Drawing.Color]::FromArgb(212, 188, 133)

  for ($mask = 0; $mask -lt 16; $mask += 1) {
    $destinationX = ($mask % 4) * 32
    $destinationY = [Math]::Floor($mask / 4) * 32

    for ($localY = 0; $localY -lt 32; $localY += 2) {
      for ($localX = 0; $localX -lt 32; $localX += 2) {
        $horizontalWidth = 6 + (([Math]::Floor($localX / 8) + $mask) % 2)
        $verticalWidth = 6 + (([Math]::Floor($localY / 8) + $mask) % 2)
        $centerDistance =
          ((($localX - 16) / 11) * (($localX - 16) / 11)) +
          ((($localY - 16) / 10) * (($localY - 16) / 10))
        $isCenter = $centerDistance -le 1
        $isNorth = (($mask -band 1) -ne 0) -and
          $localY -le 16 -and
          [Math]::Abs($localX - 16) -le $verticalWidth
        $isEast = (($mask -band 2) -ne 0) -and
          $localX -ge 16 -and
          [Math]::Abs($localY - 16) -le $horizontalWidth
        $isSouth = (($mask -band 4) -ne 0) -and
          $localY -ge 16 -and
          [Math]::Abs($localX - 16) -le $verticalWidth
        $isWest = (($mask -band 8) -ne 0) -and
          $localX -le 16 -and
          [Math]::Abs($localY - 16) -le $horizontalWidth

        if (-not ($isCenter -or $isNorth -or $isEast -or $isSouth -or $isWest)) {
          continue
        }

        $hash = [Math]::Abs(
          (($localX + $destinationX) * 131) -bxor
          (($localY + $destinationY) * 197) -bxor
          ($mask * 313)
        )
        $isOuter =
          ($isNorth -or $isSouth) -and [Math]::Abs($localX - 16) -ge $verticalWidth - 1 -or
          ($isEast -or $isWest) -and [Math]::Abs($localY - 16) -ge $horizontalWidth - 1 -or
          ($isCenter -and $centerDistance -gt 0.72)
        $color = if ($isOuter) {
          $edge
        }
        elseif ($hash % 13 -eq 0) {
          $highlight
        }
        else {
          $earth
        }

        Set-PixelBlock $atlas ($destinationX + $localX) ($destinationY + $localY) $color 2
      }
    }

    Add-SteppingStone $atlas $destinationX $destinationY 16 16 7 5 $mask

    if (($mask -band 1) -ne 0) {
      Add-SteppingStone $atlas $destinationX $destinationY 13 5 5 4 ($mask + 1)
    }

    if (($mask -band 2) -ne 0) {
      Add-SteppingStone $atlas $destinationX $destinationY 27 13 5 4 ($mask + 2)
    }

    if (($mask -band 4) -ne 0) {
      Add-SteppingStone $atlas $destinationX $destinationY 19 27 5 4 ($mask + 3)
    }

    if (($mask -band 8) -ne 0) {
      Add-SteppingStone $atlas $destinationX $destinationY 5 19 5 4 ($mask + 4)
    }
  }

  return $atlas
}

function Add-GardenCarpetPatch {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $CenterX,
    [Parameter(Mandatory = $true)][int] $CenterY,
    [Parameter(Mandatory = $true)][int] $RadiusX,
    [Parameter(Mandatory = $true)][int] $RadiusY,
    [Parameter(Mandatory = $true)][int] $Theme,
    [Parameter(Mandatory = $true)][int] $FlowerDensity,
    [Parameter(Mandatory = $true)][int] $Variant
  )

  $leafPalettes = @(
    @(
      [System.Drawing.Color]::FromArgb(232, 43, 99, 47),
      [System.Drawing.Color]::FromArgb(232, 57, 121, 54),
      [System.Drawing.Color]::FromArgb(224, 78, 143, 65)
    ),
    @(
      [System.Drawing.Color]::FromArgb(230, 39, 94, 50),
      [System.Drawing.Color]::FromArgb(230, 53, 116, 57),
      [System.Drawing.Color]::FromArgb(222, 73, 138, 68)
    ),
    @(
      [System.Drawing.Color]::FromArgb(228, 46, 101, 46),
      [System.Drawing.Color]::FromArgb(228, 62, 123, 55),
      [System.Drawing.Color]::FromArgb(220, 83, 145, 66)
    )
  )
  $flowerPalettes = @(
    @(
      [System.Drawing.Color]::FromArgb(236, 151, 178),
      [System.Drawing.Color]::FromArgb(244, 220, 171),
      [System.Drawing.Color]::FromArgb(207, 119, 154)
    ),
    @(
      [System.Drawing.Color]::FromArgb(127, 179, 224),
      [System.Drawing.Color]::FromArgb(190, 151, 211),
      [System.Drawing.Color]::FromArgb(232, 225, 193)
    ),
    @(
      [System.Drawing.Color]::FromArgb(241, 216, 162),
      [System.Drawing.Color]::FromArgb(223, 139, 170),
      [System.Drawing.Color]::FromArgb(142, 185, 214)
    )
  )
  $leaves = $leafPalettes[$Theme % $leafPalettes.Count]
  $flowers = $flowerPalettes[$Theme % $flowerPalettes.Count]

  for ($row = $CenterY - $RadiusY; $row -le $CenterY + $RadiusY; $row += 4) {
    for ($column = $CenterX - $RadiusX; $column -le $CenterX + $RadiusX; $column += 4) {
      $normalized =
        ((($column - $CenterX) / $RadiusX) * (($column - $CenterX) / $RadiusX)) +
        ((($row - $CenterY) / $RadiusY) * (($row - $CenterY) / $RadiusY))
      $edgeWave =
        [Math]::Sin(($column + $Variant * 17) / 18.0) * 0.055 +
        [Math]::Cos(($row - $Variant * 13) / 15.0) * 0.045

      if ($normalized -gt 1 + $edgeWave) {
        continue
      }

      $hash = [Math]::Abs(($column * 719) -bxor ($row * 811) -bxor ($Variant * 1237))
      $leaf = if ($hash % 13 -eq 0) {
        $leaves[2]
      }
      elseif ($hash % 5 -eq 0) {
        $leaves[0]
      }
      else {
        $leaves[1]
      }
      Set-PixelBlock $Bitmap $column $row $leaf 5
    }
  }

  $clusterOffsets = @(
    @(-0.48, -0.25),
    @(0.05, -0.34),
    @(0.46, -0.08),
    @(-0.28, 0.3),
    @(0.28, 0.34)
  )
  $effectiveFlowerDensity = [Math]::Round($FlowerDensity * 1.9)
  $clusterCount =
    [Math]::Min(5, [Math]::Max(2, [Math]::Ceiling($effectiveFlowerDensity / 7)))

  for ($index = 0; $index -lt $effectiveFlowerDensity; $index += 1) {
    $clusterIndex = ($index + $Variant) % $clusterCount
    $cluster = $clusterOffsets[$clusterIndex]
    $hashX = [Math]::Abs((($index + 3) * 83) -bxor (($Variant + 7) * 191))
    $hashY = [Math]::Abs((($index + 5) * 149) -bxor (($Variant + 11) * 97))
    $spreadX = (($hashX % 1001) / 1000.0 * 2 - 1) * [Math]::Max(8, $RadiusX * 0.24)
    $spreadY = (($hashY % 997) / 996.0 * 2 - 1) * [Math]::Max(6, $RadiusY * 0.28)
    $x = [Math]::Round($CenterX + $cluster[0] * $RadiusX + $spreadX)
    $y = [Math]::Round($CenterY + $cluster[1] * $RadiusY + $spreadY)
    # Keep neighbouring blooms in one restrained colour family. Alternating
    # every tiny petal reads as confetti; colour grouping reads as a flowerbed.
    $petal = $flowers[($clusterIndex + $Variant) % $flowers.Count]
    $centre = [System.Drawing.Color]::FromArgb(232, 195, 112)

    # Tiny irregular four-petal clusters read as low flower carpets without
    # recreating the rejected upright crop silhouette or a repeated diagonal.
    Set-PixelBlock $Bitmap ($x - 3) ($y + 3) $leaves[0] 4
    Set-PixelBlock $Bitmap $x $y $petal 2
    Set-PixelBlock $Bitmap ($x + 2) ($y + 1) $petal 2
    Set-PixelBlock $Bitmap ($x - 1) ($y + 2) $petal 2
    Set-PixelBlock $Bitmap ($x + 1) ($y + 3) $petal 2
    Set-PixelBlock $Bitmap ($x + 1) ($y + 2) $centre 1
  }
}

function Clear-GardenOverlayProtectedCells {
  param([Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap)

  $mapPath = Join-Path $assetRoot "maps\garden-map.json"

  if (-not (Test-Path -LiteralPath $mapPath -PathType Leaf)) {
    throw "Generate garden-map.json before building the garden presentation overlays."
  }

  $map = Get-Content -LiteralPath $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $fullCellProtection = [System.Collections.Generic.HashSet[string]]::new()
  $pointProtection = [System.Collections.Generic.HashSet[string]]::new()

  foreach ($layerName in @("Path", "Water", "BaseMedium", "BaseAbove", "Collision")) {
    $layer = $map.layers | Where-Object { $_.name -eq $layerName } | Select-Object -First 1

    if ($null -eq $layer -or $null -eq $layer.data) {
      continue
    }

    for ($index = 0; $index -lt $layer.data.Count; $index += 1) {
      if ($layer.data[$index] -ne 0) {
        $column = $index % $map.width
        $row = [Math]::Floor($index / $map.width)
        $null = $fullCellProtection.Add("$column,$row")
      }
    }
  }

  $anchors = $map.layers | Where-Object { $_.name -eq "Anchors" } | Select-Object -First 1

  foreach ($anchor in $anchors.objects) {
    if ($anchor.name -in @("player-spawn", "companion")) {
      $column = [Math]::Floor($anchor.x / $map.tilewidth)
      $row = [Math]::Floor($anchor.y / $map.tileheight)
      $null = $pointProtection.Add("$column,$row")
    }

    foreach ($property in $anchor.properties) {
      if ($property.name -eq "interactionX") {
        $interactionX = $property.value
      }
      elseif ($property.name -eq "interactionY") {
        $interactionY = $property.value
      }
    }

    if ($null -ne $interactionX -and $null -ne $interactionY) {
      $column = [Math]::Floor($interactionX / $map.tilewidth)
      $row = [Math]::Floor($interactionY / $map.tileheight)
      $null = $pointProtection.Add("$column,$row")
    }
    $interactionX = $null
    $interactionY = $null
  }

  foreach ($cell in $fullCellProtection) {
    $parts = $cell.Split(",")
    $startX = [int]$parts[0] * $map.tilewidth
    $startY = [int]$parts[1] * $map.tileheight

    for ($row = $startY; $row -lt $startY + $map.tileheight; $row += 1) {
      for ($column = $startX; $column -lt $startX + $map.tilewidth; $column += 1) {
        $Bitmap.SetPixel($column, $row, [System.Drawing.Color]::Transparent)
      }
    }
  }

  foreach ($cell in $pointProtection) {
    $parts = $cell.Split(",")
    $centerX = [int]$parts[0] * $map.tilewidth + [Math]::Floor($map.tilewidth / 2)
    $centerY = [int]$parts[1] * $map.tileheight + [Math]::Floor($map.tileheight / 2)

    for ($row = $centerY - 10; $row -lt $centerY + 10; $row += 1) {
      for ($column = $centerX - 10; $column -lt $centerX + 10; $column += 1) {
        $Bitmap.SetPixel($column, $row, [System.Drawing.Color]::Transparent)
      }
    }
  }
}

function New-GardenGrowthOverlay {
  param([Parameter(Mandatory = $true)][ValidateRange(0, 4)][int] $Stage)

  $overlay = New-TransparentBitmap -Width 960 -Height 640
  $patchesByStage = @(
    @(
      @(338, 150, 94, 36, 0, 15, 1),
      @(570, 156, 88, 36, 0, 15, 2),
      @(274, 310, 118, 48, 0, 15, 3),
      @(670, 330, 122, 50, 1, 15, 4),
      @(270, 350, 132, 60, 0, 4, 12),
      @(660, 362, 136, 62, 1, 4, 13),
      @(710, 244, 70, 28, 1, 12, 5),
      @(842, 252, 66, 28, 1, 12, 6),
      @(130, 430, 72, 28, 2, 11, 10),
      @(166, 474, 86, 30, 2, 12, 7),
      @(318, 566, 104, 28, 2, 13, 8),
      @(654, 566, 108, 28, 2, 13, 9),
      @(468, 570, 72, 24, 2, 10, 11)
    ),
    @(
      @(250, 248, 104, 44, 0, 16, 10),
      @(620, 250, 90, 40, 1, 16, 11),
      @(782, 294, 96, 30, 1, 14, 12),
      @(224, 426, 92, 32, 2, 14, 13)
    ),
    @(
      @(270, 350, 132, 60, 0, 24, 14),
      @(660, 362, 136, 62, 1, 24, 15),
      @(169, 306, 76, 68, 2, 18, 16),
      @(790, 438, 98, 46, 1, 18, 17),
      @(280, 518, 112, 40, 2, 18, 18),
      @(665, 518, 116, 40, 2, 18, 19)
    ),
    @(
      @(352, 222, 88, 48, 0, 20, 20),
      @(548, 224, 88, 48, 1, 20, 21),
      @(232, 370, 100, 50, 0, 20, 22),
      @(744, 380, 110, 50, 1, 20, 23),
      @(145, 542, 82, 28, 2, 14, 24),
      @(823, 548, 78, 28, 2, 14, 25)
    ),
    @(
      @(316, 292, 150, 70, 0, 36, 26),
      @(595, 296, 148, 70, 1, 36, 27),
      @(254, 442, 150, 62, 0, 34, 28),
      @(690, 456, 156, 62, 1, 34, 29),
      @(468, 162, 90, 34, 2, 20, 30),
      @(468, 548, 100, 32, 2, 20, 31)
    )
  )

  foreach ($patch in $patchesByStage[$Stage]) {
    Add-GardenCarpetPatch `
      $overlay `
      $patch[0] `
      $patch[1] `
      $patch[2] `
      $patch[3] `
      $patch[4] `
      $patch[5] `
      $patch[6]
  }

  Clear-GardenOverlayProtectedCells $overlay
  return $overlay
}

function Save-Png {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][string] $Path
  )

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Bitmap.Dispose()
}

function Blend-RegionPalette {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.Bitmap] $Bitmap,
    [Parameter(Mandatory = $true)][int] $X,
    [Parameter(Mandatory = $true)][int] $Y,
    [Parameter(Mandatory = $true)][int] $Width,
    [Parameter(Mandatory = $true)][int] $Height,
    [Parameter(Mandatory = $true)][System.Drawing.Color] $Target,
    [Parameter(Mandatory = $true)][double] $Amount
  )

  for ($row = $Y; $row -lt $Y + $Height; $row += 1) {
    for ($column = $X; $column -lt $X + $Width; $column += 1) {
      $color = $Bitmap.GetPixel($column, $row)

      if ($color.A -eq 0) {
        continue
      }

      $red = [Math]::Round($color.R * (1 - $Amount) + $Target.R * $Amount)
      $green = [Math]::Round($color.G * (1 - $Amount) + $Target.G * $Amount)
      $blue = [Math]::Round($color.B * (1 - $Amount) + $Target.B * $Amount)
      $Bitmap.SetPixel(
        $column,
        $row,
        [System.Drawing.Color]::FromArgb($color.A, $red, $green, $blue)
      )
    }
  }
}

$outdoors = Get-SourcePath "Maps\spring_outdoorsTileSheet..png"
$beach = Get-SourcePath "Maps\spring_beach..png"
$flooring = Get-SourcePath "TerrainFeatures\Flooring..png"
$treeOne = Get-SourcePath "TerrainFeatures\tree1_spring..png"
$treeTwo = Get-SourcePath "TerrainFeatures\tree2_spring..png"
$bushes = Get-SourcePath "TileSheets\bushes..png"
$fence = Get-SourcePath "LooseSprites\Fence1..png"
$objects = Get-SourcePath "Maps\springobjects..png"
$furniture = Get-SourcePath "TileSheets\furniture..png"
$grass = Get-SourcePath "TerrainFeatures\grass..png"
$shed = Get-SourcePath "Buildings\Shed..png"

$terrain = New-TransparentBitmap -Width 256 -Height 160
Copy-NearestRegion $terrain $outdoors 16 208 16 16 0 0
Copy-NearestRegion $terrain $outdoors 32 208 16 16 32 0
Copy-NearestRegion $terrain $outdoors 16 224 16 16 64 0
Copy-NearestRegion $terrain $outdoors 32 224 16 16 96 0
Copy-NearestRegion $terrain $flooring 192 64 64 64 0 32
Copy-NearestRegion $terrain $flooring 64 64 64 64 128 32
Blend-RegionPalette $terrain 0 0 128 32 ([System.Drawing.Color]::FromArgb(94, 139, 75)) 0.62
for ($tileIndex = 0; $tileIndex -lt 4; $tileIndex += 1) {
  Paint-QuietGrassTile $terrain $tileIndex
}
Save-Png $terrain (Join-Path $tilesDirectory "garden-terrain.png")

$path = New-OrganicPathAtlas
Blend-RegionPalette $path 0 0 128 128 ([System.Drawing.Color]::FromArgb(174, 151, 104)) 0.66
Save-Png $path (Join-Path $tilesDirectory "garden-path.png")

$water = New-TransparentBitmap -Width 256 -Height 32
Copy-NearestRegion $water $beach 0 0 128 16 0 0
Save-Png $water (Join-Path $tilesDirectory "garden-water.png")

$fenceSheet = New-TransparentBitmap -Width 96 -Height 192
Copy-NearestRegion $fenceSheet $fence 0 0 48 96 0 0
Save-Png $fenceSheet (Join-Path $tilesDirectory "garden-fence.png")

$treeSheet = New-TransparentBitmap -Width 192 -Height 192
Copy-NearestRegion $treeSheet $treeOne 0 0 48 96 0 0
Copy-NearestRegion $treeSheet $treeTwo 0 0 48 96 96 0
Save-Png $treeSheet (Join-Path $decorDirectory "garden-trees.png")

$bushSheet = New-TransparentBitmap -Width 128 -Height 64
Copy-NearestRegion $bushSheet $bushes 0 0 32 32 0 0
Copy-NearestRegion $bushSheet $bushes 32 0 32 32 64 0
Blend-RegionPalette `
  $bushSheet `
  0 `
  0 `
  128 `
  64 `
  ([System.Drawing.Color]::FromArgb(55, 109, 53)) `
  0.6
Save-Png $bushSheet (Join-Path $decorDirectory "garden-bushes.png")

$details = New-TransparentBitmap -Width 160 -Height 64
Copy-NearestRegion $details $objects 0 448 32 32 0 0
Copy-NearestRegion $details $furniture 0 96 48 32 64 0
Save-Png $details (Join-Path $decorDirectory "garden-details.png")

$pond = New-GardenPond
Save-Png $pond (Join-Path $decorDirectory "garden-pond.png")

$centerpiece = New-TransparentBitmap -Width 128 -Height 128
Copy-NearestRegion $centerpiece $shed 0 0 112 128 8 0 -Scale 1
$ivyDark = [System.Drawing.Color]::FromArgb(41, 95, 46)
$ivyMid = [System.Drawing.Color]::FromArgb(57, 122, 54)
$ivyLight = [System.Drawing.Color]::FromArgb(82, 145, 66)
$ivyFlower = [System.Drawing.Color]::FromArgb(229, 151, 179)
foreach ($ivy in @(
    @(13, 58),
    @(17, 70),
    @(14, 83),
    @(108, 61),
    @(105, 74),
    @(109, 88)
  )) {
  Set-PixelBlock $centerpiece $ivy[0] $ivy[1] $ivyDark 6
  Set-PixelBlock $centerpiece ($ivy[0] + 4) ($ivy[1] - 3) $ivyMid 5
  Set-PixelBlock $centerpiece ($ivy[0] + 1) ($ivy[1] + 5) $ivyLight 4
}
Set-PixelBlock $centerpiece 18 71 $ivyFlower 3
Set-PixelBlock $centerpiece 106 78 $ivyFlower 3
Save-Png $centerpiece (Join-Path $decorDirectory "garden-centerpiece.png")

$groundDetails = New-TransparentBitmap -Width 128 -Height 32
for ($index = 0; $index -lt 4; $index += 1) {
  Copy-NearestRegion $groundDetails $grass ($index * 16) 0 16 16 ($index * 32) 0
}
Blend-RegionPalette $groundDetails 0 0 128 32 ([System.Drawing.Color]::FromArgb(73, 118, 68)) 0.16
Save-Png $groundDetails (Join-Path $decorDirectory "garden-ground-details.png")

$flowerbeds = New-FlowerbedAtlas
Save-Png $flowerbeds (Join-Path $decorDirectory "garden-flowerbeds.png")

$hedges = New-HedgeAtlas
Save-Png $hedges (Join-Path $decorDirectory "garden-hedges.png")

$vines = New-TransparentBitmap -Width 128 -Height 32
Copy-NearestRegion $vines $outdoors 272 640 16 16 0 0
Copy-NearestRegion $vines $outdoors 288 640 16 16 32 0
Copy-NearestRegion $vines $outdoors 272 656 16 16 64 0
Copy-NearestRegion $vines $outdoors 288 656 16 16 96 0
Blend-RegionPalette $vines 0 0 128 32 ([System.Drawing.Color]::FromArgb(48, 101, 60)) 0.1
Save-Png $vines (Join-Path $decorDirectory "garden-vines.png")

for ($stage = 0; $stage -le 4; $stage += 1) {
  $growthOverlay = New-GardenGrowthOverlay -Stage $stage
  $fileName = if ($stage -eq 0) {
    "garden-growth-base.png"
  }
  else {
    "garden-growth-stage$stage.png"
  }
  Save-Png $growthOverlay (Join-Path $decorDirectory $fileName)
}

foreach ($legacyAsset in @(
  (Join-Path $tilesDirectory "garden-bed.png"),
  (Join-Path $decorDirectory "garden-growth.png")
)) {
  if (Test-Path -LiteralPath $legacyAsset -PathType Leaf) {
    Remove-Item -LiteralPath $legacyAsset
  }
}

Write-Output "Garden map assets generated in $assetRoot"
