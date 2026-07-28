import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAP_COLUMNS = 30;
const MAP_ROWS = 20;
const TILE_SIZE = 32;
const MAP_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/assets/garden/maps/garden-map.json",
);

const TILESETS = Object.freeze({
  terrain: { firstGid: 1, columns: 8, rows: 5 },
  path: { firstGid: 41, columns: 4, rows: 4 },
  flowerbeds: { firstGid: 57, columns: 84, rows: 1 },
  water: { firstGid: 141, columns: 8, rows: 1 },
  fence: { firstGid: 149, columns: 3, rows: 6 },
  trees: { firstGid: 167, columns: 6, rows: 6 },
  bushes: { firstGid: 203, columns: 4, rows: 2 },
  details: { firstGid: 211, columns: 5, rows: 2 },
  pond: { firstGid: 221, columns: 5, rows: 5 },
  centerpiece: { firstGid: 246, columns: 4, rows: 4 },
  groundDetails: { firstGid: 262, columns: 4, rows: 1 },
  hedges: { firstGid: 266, columns: 4, rows: 1 },
  vines: { firstGid: 270, columns: 4, rows: 1 },
});

const ZONE_IDS = Object.freeze([
  "greenhouse_front",
  "woodland",
  "center_left",
  "center_right",
  "pond",
  "entrance",
]);

const key = (column, row) => `${column},${row}`;
const createLayerData = () => Array.from({ length: MAP_COLUMNS * MAP_ROWS }, () => 0);
const cellIndex = (column, row) => row * MAP_COLUMNS + column;

function setTile(layer, column, row, gid) {
  if (column < 0 || column >= MAP_COLUMNS || row < 0 || row >= MAP_ROWS) {
    throw new Error(`Tile position is outside the garden map: ${column},${row}`);
  }

  layer[cellIndex(column, row)] = gid;
}

function tilesetGid(tileset, column, row = 0) {
  return tileset.firstGid + row * tileset.columns + column;
}

function placeRectangle(layer, startColumn, startRow, width, height, getGid) {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      setTile(layer, startColumn + column, startRow + row, getGid(column, row));
    }
  }
}

function placeCells(layer, cells, getGid) {
  cells.forEach(([column, row], index) => {
    setTile(layer, column, row, getGid(column, row, index));
  });
}

function expandRowSpans(spans) {
  return spans.flatMap(([row, startColumn, endColumn]) =>
    Array.from({ length: endColumn - startColumn + 1 }, (_, index) => [startColumn + index, row]),
  );
}

const ground = createLayerData();
const beds = createLayerData();
const path = createLayerData();
const water = createLayerData();
const baseLow = createLayerData();
const baseMedium = createLayerData();
const baseAbove = createLayerData();
const collision = createLayerData();
const globalGrowth1Low = createLayerData();
const globalGrowth2Low = createLayerData();
const globalGrowth3Medium = createLayerData();
const globalGrowth4Above = createLayerData();
const zoneGrowthLayers = new Map(
  ZONE_IDS.flatMap((zoneId) =>
    [1, 2, 3].map((level) => [`Zone_${zoneId}_Growth${level}`, createLayerData()]),
  ),
);

for (let row = 0; row < MAP_ROWS; row += 1) {
  for (let column = 0; column < MAP_COLUMNS; column += 1) {
    const variation = (column * 17 + row * 23) % 47;
    const gid = variation === 0 ? 2 : variation === 13 ? 4 : 3;
    setTile(ground, column, row, gid);
  }
}

const mainPathCells = [
  [14, 18],
  [15, 18],
  [14, 17],
  [15, 17],
  [14, 16],
  [14, 15],
  [13, 14],
  [14, 14],
  [14, 13],
  [14, 12],
  [14, 11],
  [14, 10],
  [14, 9],
  [14, 8],
  [14, 7],
  [14, 6],
  [14, 5],
  [14, 4],
  [13, 4],
  [15, 4],
  [12, 4],
  [16, 4],
  [12, 14],
  [11, 14],
  [10, 14],
  [9, 14],
  [8, 14],
  [7, 14],
  [6, 14],
  [5, 14],
  [5, 15],
  [3, 16],
  [4, 16],
  [5, 16],
  [15, 10],
  [16, 10],
  [17, 10],
  [17, 9],
  [18, 9],
  [19, 9],
  [19, 8],
  [20, 8],
  [21, 8],
  [21, 7],
  [22, 7],
];
const pathCells = new Set(mainPathCells.map(([column, row]) => key(column, row)));

function getPathConnectionMask(column, row) {
  let mask = 0;

  if (pathCells.has(key(column, row - 1))) {
    mask |= 1;
  }

  if (pathCells.has(key(column + 1, row))) {
    mask |= 2;
  }

  if (pathCells.has(key(column, row + 1))) {
    mask |= 4;
  }

  if (pathCells.has(key(column - 1, row))) {
    mask |= 8;
  }

  return mask;
}

placeCells(path, mainPathCells, (column, row) => {
  const connectionMask = getPathConnectionMask(column, row);

  return tilesetGid(
    TILESETS.path,
    connectionMask % TILESETS.path.columns,
    Math.floor(connectionMask / TILESETS.path.columns),
  );
});

const waterCells = [
  [23, 3],
  [24, 3],
  [25, 3],
  [23, 4],
  [24, 4],
  [25, 4],
  [23, 5],
  [24, 5],
  [25, 5],
  [23, 6],
  [24, 6],
];
const waterCellKeys = new Set(waterCells.map(([column, row]) => key(column, row)));
placeCells(water, waterCells, (column, row) =>
  tilesetGid(TILESETS.water, (column * 5 + row) % TILESETS.water.columns),
);

function placeTree(startColumn, startRow, variant) {
  const sourceColumnOffset = variant === 0 ? 0 : 3;

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const targetLayer = row < 5 ? baseAbove : baseMedium;
      setTile(
        targetLayer,
        startColumn + column,
        startRow + row,
        tilesetGid(TILESETS.trees, sourceColumnOffset + column, row),
      );
    }
  }
}

function placeBush(layer, startColumn, startRow, variant) {
  const sourceColumnOffset = variant === 0 ? 0 : 2;
  placeRectangle(layer, startColumn, startRow, 2, 2, (column, row) =>
    tilesetGid(TILESETS.bushes, sourceColumnOffset + column, row),
  );
}

function placeFenceSegment(startColumn, row) {
  placeRectangle(baseMedium, startColumn, row, 3, 1, (column) =>
    tilesetGid(TILESETS.fence, column, 0),
  );
}

function placeBench(startColumn, startRow) {
  placeRectangle(baseMedium, startColumn, startRow, 3, 2, (column, row) =>
    tilesetGid(TILESETS.details, 2 + column, row),
  );
}

function placeFlowerbedTile(layer, column, row, tileIndex) {
  setTile(layer, column, row, tilesetGid(TILESETS.flowerbeds, tileIndex));
}

function placeGroundDetail(layer, column, row, tileIndex) {
  setTile(layer, column, row, tilesetGid(TILESETS.groundDetails, tileIndex));
}

function placeHedgeTile(layer, column, row, tileIndex) {
  setTile(layer, column, row, tilesetGid(TILESETS.hedges, tileIndex));
}

function placeHedgeRun(layer, startColumn, row, length) {
  for (let offset = 0; offset < length; offset += 1) {
    const column = startColumn + offset;

    if (!isCellAvailableForMediumDecor(column, row)) {
      continue;
    }

    const tileIndex = offset === 0 ? 0 : offset === length - 1 ? 3 : 1 + ((offset + row) % 2);
    placeHedgeTile(layer, column, row, tileIndex);
  }
}

function placeVineTile(layer, column, row, tileIndex) {
  setTile(layer, column, row, tilesetGid(TILESETS.vines, tileIndex));
}

placeRectangle(baseLow, 22, 2, 5, 5, (column, row) => tilesetGid(TILESETS.pond, column, row));
placeRectangle(baseMedium, 12, 0, 4, 4, (column, row) =>
  tilesetGid(TILESETS.centerpiece, column, row),
);

const treePlacements = [
  [0, 0, 0],
  [4, 0, 1],
  [25, 0, 1],
  [0, 7, 1],
  [27, 14, 1],
];
treePlacements.forEach(([column, row, variant]) => placeTree(column, row, variant));

const baseBushPlacements = [
  [8, 0, 0],
  [10, 1, 1],
  [17, 0, 0],
  [19, 1, 1],
  [2, 11, 1],
  [25, 11, 0],
  [1, 6, 0],
  [27, 6, 1],
];
baseBushPlacements.forEach(([column, row, variant]) => placeBush(baseMedium, column, row, variant));

placeFenceSegment(2, 18);
placeFenceSegment(24, 18);
placeBench(2, 14);

const slotDefinitions = [
  ["slot-01", 10, 5, 10, 6, "greenhouse_front"],
  ["slot-02", 12, 6, 13, 6, "greenhouse_front"],
  ["slot-03", 10, 7, 10, 8, "greenhouse_front"],
  ["slot-04", 17, 5, 16, 5, "greenhouse_front"],
  ["slot-05", 19, 6, 19, 7, "greenhouse_front"],
  ["slot-06", 18, 8, 18, 9, "greenhouse_front"],
  ["slot-07", 3, 4, 3, 5, "woodland"],
  ["slot-08", 5, 6, 5, 7, "woodland"],
  ["slot-09", 8, 4, 8, 5, "woodland"],
  ["slot-10", 3, 8, 3, 9, "woodland"],
  ["slot-11", 6, 9, 6, 10, "woodland"],
  ["slot-12", 8, 7, 8, 8, "woodland"],
  ["slot-13", 6, 11, 7, 11, "center_left"],
  ["slot-14", 8, 10, 9, 10, "center_left"],
  ["slot-15", 10, 9, 11, 9, "center_left"],
  ["slot-16", 4, 12, 4, 13, "center_left"],
  ["slot-17", 8, 13, 8, 14, "center_left"],
  ["slot-18", 11, 12, 12, 12, "center_left"],
  ["slot-19", 18, 10, 18, 11, "center_right"],
  ["slot-20", 20, 11, 20, 10, "center_right"],
  ["slot-21", 22, 10, 21, 10, "center_right"],
  ["slot-22", 18, 13, 17, 13, "center_right"],
  ["slot-23", 21, 14, 21, 15, "center_right"],
  ["slot-24", 23, 13, 23, 14, "center_right"],
  ["slot-25", 20, 3, 20, 4, "pond"],
  ["slot-26", 21, 6, 20, 6, "pond"],
  ["slot-27", 26, 7, 25, 7, "pond"],
  ["slot-28", 28, 8, 27, 8, "pond"],
  ["slot-29", 24, 8, 23, 8, "pond"],
  ["slot-30", 26, 10, 25, 10, "pond"],
  ["slot-31", 7, 16, 7, 15, "entrance"],
  ["slot-32", 9, 17, 9, 16, "entrance"],
  ["slot-33", 11, 15, 12, 15, "entrance"],
  ["slot-34", 18, 16, 17, 16, "entrance"],
  ["slot-35", 20, 17, 20, 16, "entrance"],
  ["slot-36", 23, 16, 24, 16, "entrance"],
];

const slotCells = new Set(slotDefinitions.map(([, column, row]) => key(column, row)));
const interactionCells = new Set(
  slotDefinitions.map(([, , , interactionColumn, interactionRow]) =>
    key(interactionColumn, interactionRow),
  ),
);
const spawn = { column: 14, row: 17 };
const companion = { column: 18, row: 4 };

const staticVisualCells = new Set();

function addRectangleToSet(target, startColumn, startRow, width, height) {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      target.add(key(startColumn + column, startRow + row));
    }
  }
}

addRectangleToSet(staticVisualCells, 12, 0, 4, 4);
addRectangleToSet(staticVisualCells, 22, 2, 5, 5);
treePlacements.forEach(([column, row]) => addRectangleToSet(staticVisualCells, column, row, 3, 6));
baseBushPlacements.forEach(([column, row]) =>
  addRectangleToSet(staticVisualCells, column, row, 2, 2),
);
addRectangleToSet(staticVisualCells, 2, 14, 3, 2);
addRectangleToSet(staticVisualCells, 2, 18, 3, 1);
addRectangleToSet(staticVisualCells, 24, 18, 3, 1);

const lowDecorExclusionCells = new Set([
  ...pathCells,
  ...waterCellKeys,
  ...interactionCells,
  ...staticVisualCells,
  key(spawn.column, spawn.row),
  key(companion.column, companion.row),
]);
const mediumDecorExclusionCells = new Set([...lowDecorExclusionCells, ...slotCells]);

const VISUAL_FLOWERBED_SPANS = Object.freeze([
  // A quiet woodland ribbon anchors the left boundary without turning the
  // six logical growth zones into six visible rectangles.
  [5, 2, 4],
  [6, 2, 4],
  [7, 2, 4],
  [8, 2, 4],
  [9, 2, 4],
  [10, 2, 4],
  [11, 3, 4],
  [12, 4, 4],
  // The principal left flowerbed widens below the flower house, then narrows
  // toward the bench path.
  [3, 9, 11],
  [4, 8, 11],
  [5, 7, 11],
  [6, 6, 11],
  [7, 5, 11],
  [8, 5, 11],
  [9, 5, 11],
  [10, 5, 11],
  [11, 5, 11],
  [12, 6, 11],
  [13, 7, 10],
  // The north-east bed starts beside the flower house and becomes a crescent
  // around the pond before flowing into the right garden.
  [3, 17, 21],
  [4, 17, 21],
  [5, 17, 21],
  [6, 17, 21],
  [7, 17, 20],
  [7, 23, 27],
  [8, 17, 18],
  [8, 23, 28],
  [9, 20, 27],
  [10, 18, 27],
  [11, 18, 26],
  [12, 17, 25],
  [13, 18, 25],
  [14, 19, 24],
  // Two compact entrance beds frame the southern walk without filling every
  // open grass cell.
  [15, 6, 11],
  [16, 5, 11],
  [17, 5, 11],
  [18, 6, 11],
  [15, 19, 23],
  [16, 18, 24],
  [17, 18, 24],
  [18, 19, 23],
]);

const ZONE_FLOWER_THEMES = Object.freeze({
  greenhouse_front: 0,
  woodland: 2,
  center_left: 0,
  center_right: 1,
  pond: 1,
  entrance: 2,
});

function isCellAvailableForLowDecor(column, row) {
  return !lowDecorExclusionCells.has(key(column, row));
}

function isCellAvailableForMediumDecor(column, row) {
  return !mediumDecorExclusionCells.has(key(column, row));
}

function getFlowerbedEdgeTileIndex(cellSet, column, row) {
  let mask = 0;

  if (!cellSet.has(key(column, row - 1))) {
    mask |= 1;
  }

  if (!cellSet.has(key(column + 1, row))) {
    mask |= 2;
  }

  if (!cellSet.has(key(column, row + 1))) {
    mask |= 4;
  }

  if (!cellSet.has(key(column - 1, row))) {
    mask |= 8;
  }

  return mask === 0 ? null : 32 + mask;
}

const rawFlowerbedCells = expandRowSpans(VISUAL_FLOWERBED_SPANS);
const flowerbedShapeCellSet = new Set(
  rawFlowerbedCells
    .filter(
      ([column, row]) =>
        !pathCells.has(key(column, row)) &&
        !waterCellKeys.has(key(column, row)) &&
        !staticVisualCells.has(key(column, row)),
    )
    .map(([column, row]) => key(column, row)),
);

const baseFlowerbedCells = rawFlowerbedCells.filter(([column, row]) =>
  flowerbedShapeCellSet.has(key(column, row)),
);

// The full low garden-bed silhouette is visible from Stage 0. Growth layers
// enrich the same shape instead of revealing unrelated 32px islands. The
// surface can run beneath an interaction point because it is ground-level,
// while every flower and medium decoration still respects the safety masks.
placeDensityLayer(beds, baseFlowerbedCells, flowerbedShapeCellSet, [0, 1]);

function placeDensityLayer(layer, cells, stageCellSet, tileIndices) {
  const isBedSurfaceLayer = tileIndices.every((tileIndex) => tileIndex <= 1);

  cells.forEach(([column, row]) => {
    const isSlotCenter = slotCells.has(key(column, row));

    if (isSlotCenter) {
      if (isBedSurfaceLayer) {
        const variant = Math.abs(column * 31 + row * 17) % 2;
        placeFlowerbedTile(layer, column, row, variant);
      }
      return;
    }

    const edgeTileIndex = getFlowerbedEdgeTileIndex(stageCellSet, column, row);

    if (isBedSurfaceLayer && edgeTileIndex !== null) {
      placeFlowerbedTile(layer, column, row, edgeTileIndex);
      return;
    }

    const variant = Math.abs(column * 31 + row * 17) % tileIndices.length;
    placeFlowerbedTile(layer, column, row, tileIndices[variant]);
  });
}

function placeFlowerMacroBlock(layer, startColumn, startRow, theme, tier) {
  const cells = [
    [startColumn, startRow],
    [startColumn + 1, startRow],
    [startColumn, startRow + 1],
    [startColumn + 1, startRow + 1],
  ];

  if (
    cells.some(
      ([column, row]) =>
        !flowerbedShapeCellSet.has(key(column, row)) || !isCellAvailableForLowDecor(column, row),
    )
  ) {
    return;
  }

  const macroStartTile = 48 + (theme * 3 + (tier - 1)) * 4;
  cells.forEach(([column, row], quadrant) => {
    placeFlowerbedTile(layer, column, row, macroStartTile + quadrant);
  });
}

const ZONE_GROWTH_BLOCKS = Object.freeze({
  greenhouse_front: [
    [9, 3],
    [17, 6],
  ],
  woodland: [
    [3, 6],
    [4, 8],
    [4, 10],
  ],
  center_left: [
    [6, 7],
    [10, 10],
    [8, 11],
  ],
  center_right: [
    [21, 11],
    [19, 12],
    [19, 14],
  ],
  pond: [
    [25, 8],
    [23, 9],
    [23, 11],
  ],
  entrance: [
    [6, 17],
    [10, 16],
    [21, 16],
  ],
});

for (const zoneId of ZONE_IDS) {
  const blocks = ZONE_GROWTH_BLOCKS[zoneId];
  const theme = ZONE_FLOWER_THEMES[zoneId];
  const zoneLayers = [1, 2, 3].map((level) => {
    const layer = zoneGrowthLayers.get(`Zone_${zoneId}_Growth${level}`);

    if (layer === undefined) {
      throw new Error(`Missing growth layer for ${zoneId} level ${level}`);
    }

    return layer;
  });

  if (blocks === undefined || theme === undefined) {
    throw new Error(`Missing flowerbed blocks for ${zoneId}`);
  }

  // Growth advances a small number of complete 2x2 flower masses. Established
  // beds become denser before a neighbouring block appears, so the garden
  // reads as connected rooms rather than a field of unrelated dots.
  blocks.forEach(([column, row], index) => {
    if (index === 0) {
      placeFlowerMacroBlock(zoneLayers[0], column, row, theme, 1);
      placeFlowerMacroBlock(zoneLayers[1], column, row, theme, 2);
      placeFlowerMacroBlock(zoneLayers[2], column, row, theme, 3);
      return;
    }

    if (index === 1) {
      placeFlowerMacroBlock(zoneLayers[1], column, row, theme, 1);
      placeFlowerMacroBlock(zoneLayers[2], column, row, theme, 2);
      return;
    }

    placeFlowerMacroBlock(zoneLayers[2], column, row, theme, 1);
  });
}

[
  [6, 2, 0],
  [7, 2, 1],
  [11, 3, 0],
  [17, 3, 1],
  [21, 7, 2],
  [27, 7, 3],
  [5, 17, 0],
  [24, 17, 1],
].forEach(([column, row, tileIndex]) => {
  if (isCellAvailableForLowDecor(column, row)) {
    placeGroundDetail(baseLow, column, row, tileIndex);
  }
});

[
  [8, 2, 0],
  [9, 2, 1],
  [10, 2, 2],
  [11, 2, 3],
  [17, 2, 0],
  [18, 2, 1],
  [19, 2, 2],
  [20, 2, 3],
].forEach(([column, row, tileIndex]) => {
  if (isCellAvailableForMediumDecor(column, row)) {
    placeHedgeTile(baseMedium, column, row, tileIndex);
  }
});

// Continuous low hedges give the house and southern entrance enclosure from
// the first visit. They frame the garden without crossing paths or anchors.
placeHedgeRun(baseMedium, 8, 2, 4);
placeHedgeRun(baseMedium, 17, 2, 4);
placeHedgeRun(baseMedium, 5, 18, 7);
placeHedgeRun(baseMedium, 18, 18, 6);

[
  [2, 13, 0],
  [3, 13, 1],
].forEach(([column, row, tileIndex]) => {
  if (isCellAvailableForMediumDecor(column, row)) {
    placeHedgeTile(baseMedium, column, row, tileIndex);
  }
});

[
  [12, 2, 0],
  [16, 2, 2],
].forEach(([column, row, tileIndex]) => {
  if (isCellAvailableForMediumDecor(column, row)) {
    placeVineTile(baseMedium, column, row, tileIndex);
  }
});

[
  [10, 10, 0, 1],
  [23, 10, 1, 1],
  [6, 17, 2, 1],
].forEach(([column, row, theme, tier]) => {
  placeFlowerMacroBlock(globalGrowth1Low, column, row, theme, tier);
});

[
  [4, 8, 0, 2],
  [9, 11, 0, 2],
  [23, 10, 1, 2],
  [19, 13, 1, 2],
  [10, 16, 2, 2],
  [21, 16, 2, 2],
].forEach(([column, row, theme, tier]) => {
  placeFlowerMacroBlock(globalGrowth2Low, column, row, theme, tier);
});

const zoneHedgePlacements = {
  greenhouse_front: [9, 3],
  woodland: [2, 10],
  center_left: [4, 11],
  center_right: [22, 12],
  pond: [27, 10],
  entrance: [5, 16],
};

for (const [zoneId, [column, row]] of Object.entries(zoneHedgePlacements)) {
  const layer = zoneGrowthLayers.get(`Zone_${zoneId}_Growth3`);

  if (
    layer !== undefined &&
    isCellAvailableForMediumDecor(column, row) &&
    isCellAvailableForMediumDecor(column + 1, row)
  ) {
    placeHedgeTile(layer, column, row, 2);
    placeHedgeTile(layer, column + 1, row, 3);
  }
}

[
  [9, 3, 4],
  [17, 3, 4],
  [3, 11, 3],
  [23, 12, 4],
  [5, 16, 4],
  [21, 17, 4],
].forEach(([column, row, length]) => {
  placeHedgeRun(globalGrowth3Medium, column, row, length);
});

[
  [12, 1, 0],
  [16, 1, 2],
  [11, 2, 1],
  [17, 2, 3],
  [21, 3, 0],
  [26, 7, 2],
  [6, 16, 1],
  [22, 16, 3],
].forEach(([column, row, tileIndex]) => {
  if (isCellAvailableForMediumDecor(column, row)) {
    placeVineTile(globalGrowth4Above, column, row, tileIndex);
  }
});

const collisionCells = new Set();

for (let column = 0; column < MAP_COLUMNS; column += 1) {
  collisionCells.add(key(column, 0));
  collisionCells.add(key(column, MAP_ROWS - 1));
}

for (let row = 0; row < MAP_ROWS; row += 1) {
  collisionCells.add(key(0, row));
  collisionCells.add(key(MAP_COLUMNS - 1, row));
}

for (const waterCell of waterCellKeys) {
  collisionCells.add(waterCell);
}

for (let row = 1; row <= 3; row += 1) {
  for (let column = 12; column <= 15; column += 1) {
    collisionCells.add(key(column, row));
  }
}

treePlacements.forEach(([column, row]) => {
  collisionCells.add(key(column + 1, row + 5));
});

baseBushPlacements.forEach(([column, row]) => {
  collisionCells.add(key(column, row + 1));
  collisionCells.add(key(column + 1, row + 1));
});

for (const [column, row] of [
  [2, 18],
  [3, 18],
  [4, 18],
  [24, 18],
  [25, 18],
  [26, 18],
  [2, 15],
  [3, 15],
  [4, 15],
]) {
  collisionCells.add(key(column, row));
}

for (const cell of collisionCells) {
  const [column, row] = cell.split(",").map(Number);
  setTile(collision, column, row, 1);
}

for (const [id, column, row, interactionColumn, interactionRow, zoneId] of slotDefinitions) {
  const cell = key(column, row);
  const interactionCell = key(interactionColumn, interactionRow);

  if (!ZONE_IDS.includes(zoneId)) {
    throw new Error(`${id} references an unknown garden zone`);
  }

  if (collisionCells.has(cell) || waterCellKeys.has(cell) || pathCells.has(cell)) {
    throw new Error(`${id} overlaps a fixed map feature`);
  }

  if (
    collisionCells.has(interactionCell) ||
    waterCellKeys.has(interactionCell) ||
    slotCells.has(interactionCell)
  ) {
    throw new Error(`${id} has an invalid interaction point`);
  }
}

if (interactionCells.size !== slotDefinitions.length) {
  throw new Error("Plant interaction points must be unique");
}

for (let leftIndex = 0; leftIndex < slotDefinitions.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < slotDefinitions.length; rightIndex += 1) {
    const left = slotDefinitions[leftIndex];
    const right = slotDefinitions[rightIndex];
    const distance = Math.hypot(left[1] - right[1], left[2] - right[2]);

    if (distance < 2) {
      throw new Error(`${left[0]} and ${right[0]} are less than 64 pixels apart`);
    }
  }
}

const slots = slotDefinitions.map(
  ([id, column, row, interactionColumn, interactionRow, zoneId]) => ({
    id,
    column,
    row,
    interactionColumn,
    interactionRow,
    zoneId,
  }),
);

const blockedForFullGarden = new Set([...collisionCells, ...slotCells]);
const navigationDirections = [
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
];

function isReachable(target) {
  const queue = [spawn];
  const visited = new Set([key(spawn.column, spawn.row)]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.column === target.column && current.row === target.row) {
      return true;
    }

    for (const [columnOffset, rowOffset] of navigationDirections) {
      const next = {
        column: current.column + columnOffset,
        row: current.row + rowOffset,
      };
      const nextKey = key(next.column, next.row);

      if (
        next.column < 0 ||
        next.column >= MAP_COLUMNS ||
        next.row < 0 ||
        next.row >= MAP_ROWS ||
        blockedForFullGarden.has(nextKey) ||
        visited.has(nextKey)
      ) {
        continue;
      }

      visited.add(nextKey);
      queue.push(next);
    }
  }

  return false;
}

if (blockedForFullGarden.has(key(spawn.column, spawn.row))) {
  throw new Error("Player spawn is blocked");
}

if (collisionCells.has(key(companion.column, companion.row))) {
  throw new Error("Companion position is blocked");
}

for (const slot of slots) {
  if (!isReachable({ column: slot.interactionColumn, row: slot.interactionRow })) {
    throw new Error(`${slot.id} interaction point is unreachable in a full garden`);
  }
}

const tileLayer = (id, name, data, visible = true) => ({
  data,
  height: MAP_ROWS,
  id,
  name,
  opacity: 1,
  type: "tilelayer",
  visible,
  width: MAP_COLUMNS,
  x: 0,
  y: 0,
});

const anchorObjects = [
  {
    height: 0,
    id: 1,
    name: "player-spawn",
    point: true,
    properties: [{ name: "anchorType", type: "string", value: "player-spawn" }],
    rotation: 0,
    type: "anchor",
    visible: true,
    width: 0,
    x: spawn.column * TILE_SIZE + TILE_SIZE / 2,
    y: spawn.row * TILE_SIZE + TILE_SIZE / 2,
  },
  {
    height: 0,
    id: 2,
    name: "companion",
    point: true,
    properties: [{ name: "anchorType", type: "string", value: "companion" }],
    rotation: 0,
    type: "anchor",
    visible: true,
    width: 0,
    x: companion.column * TILE_SIZE + TILE_SIZE / 2,
    y: companion.row * TILE_SIZE + TILE_SIZE / 2,
  },
  ...slots.map((slot, index) => ({
    height: 0,
    id: index + 3,
    name: slot.id,
    point: true,
    properties: [
      { name: "anchorType", type: "string", value: "plant-slot" },
      {
        name: "interactionX",
        type: "int",
        value: slot.interactionColumn * TILE_SIZE + TILE_SIZE / 2,
      },
      {
        name: "interactionY",
        type: "int",
        value: slot.interactionRow * TILE_SIZE + TILE_SIZE / 2,
      },
      { name: "zoneId", type: "string", value: slot.zoneId },
    ],
    rotation: 0,
    type: "plant-slot",
    visible: true,
    width: 0,
    x: slot.column * TILE_SIZE + TILE_SIZE / 2,
    y: slot.row * TILE_SIZE + TILE_SIZE / 2,
  })),
];

const baseLayers = [
  tileLayer(1, "Ground", ground),
  tileLayer(2, "Beds", beds),
  tileLayer(3, "Path", path),
  tileLayer(4, "Water", water),
  tileLayer(5, "BaseLow", baseLow),
  tileLayer(6, "BaseMedium", baseMedium),
  tileLayer(7, "BaseAbove", baseAbove),
];
const globalGrowthLayers = [
  tileLayer(8, "GlobalGrowth1Low", globalGrowth1Low, false),
  tileLayer(9, "GlobalGrowth2Low", globalGrowth2Low, false),
  tileLayer(10, "GlobalGrowth3Medium", globalGrowth3Medium, false),
  tileLayer(11, "GlobalGrowth4Above", globalGrowth4Above, false),
];
const zoneLayers = [...zoneGrowthLayers.entries()].map(([name, data], index) =>
  tileLayer(12 + index, name, data, false),
);
const collisionLayerId = 12 + zoneLayers.length;
const anchorLayerId = collisionLayerId + 1;

const map = {
  compressionlevel: -1,
  height: MAP_ROWS,
  infinite: false,
  layers: [
    ...baseLayers,
    ...globalGrowthLayers,
    ...zoneLayers,
    tileLayer(collisionLayerId, "Collision", collision, false),
    {
      draworder: "topdown",
      id: anchorLayerId,
      name: "Anchors",
      objects: anchorObjects,
      opacity: 1,
      type: "objectgroup",
      visible: false,
      x: 0,
      y: 0,
    },
  ],
  nextlayerid: anchorLayerId + 1,
  nextobjectid: anchorObjects.length + 1,
  orientation: "orthogonal",
  properties: [
    { name: "navigationGridSize", type: "int", value: TILE_SIZE },
    { name: "sourceScale", type: "int", value: 2 },
  ],
  renderorder: "right-down",
  tiledversion: "1.11.2",
  tileheight: TILE_SIZE,
  tilesets: [
    {
      columns: 8,
      firstgid: TILESETS.terrain.firstGid,
      image: "../tiles/garden-terrain.png",
      imageheight: 160,
      imagewidth: 256,
      margin: 0,
      name: "garden-terrain",
      spacing: 0,
      tilecount: 40,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 4,
      firstgid: TILESETS.path.firstGid,
      image: "../tiles/garden-path.png",
      imageheight: 128,
      imagewidth: 128,
      margin: 0,
      name: "garden-path",
      spacing: 0,
      tilecount: 16,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 84,
      firstgid: TILESETS.flowerbeds.firstGid,
      image: "../decor/garden-flowerbeds.png",
      imageheight: 32,
      imagewidth: 2688,
      margin: 0,
      name: "garden-flowerbeds",
      spacing: 0,
      tilecount: 84,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 8,
      firstgid: TILESETS.water.firstGid,
      image: "../tiles/garden-water.png",
      imageheight: 32,
      imagewidth: 256,
      margin: 0,
      name: "garden-water",
      spacing: 0,
      tilecount: 8,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 3,
      firstgid: TILESETS.fence.firstGid,
      image: "../tiles/garden-fence.png",
      imageheight: 192,
      imagewidth: 96,
      margin: 0,
      name: "garden-fence",
      spacing: 0,
      tilecount: 18,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 6,
      firstgid: TILESETS.trees.firstGid,
      image: "../decor/garden-trees.png",
      imageheight: 192,
      imagewidth: 192,
      margin: 0,
      name: "garden-trees",
      spacing: 0,
      tilecount: 36,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 4,
      firstgid: TILESETS.bushes.firstGid,
      image: "../decor/garden-bushes.png",
      imageheight: 64,
      imagewidth: 128,
      margin: 0,
      name: "garden-bushes",
      spacing: 0,
      tilecount: 8,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 5,
      firstgid: TILESETS.details.firstGid,
      image: "../decor/garden-details.png",
      imageheight: 64,
      imagewidth: 160,
      margin: 0,
      name: "garden-details",
      spacing: 0,
      tilecount: 10,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 5,
      firstgid: TILESETS.pond.firstGid,
      image: "../decor/garden-pond.png",
      imageheight: 160,
      imagewidth: 160,
      margin: 0,
      name: "garden-pond",
      spacing: 0,
      tilecount: 25,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 4,
      firstgid: TILESETS.centerpiece.firstGid,
      image: "../decor/garden-centerpiece.png",
      imageheight: 128,
      imagewidth: 128,
      margin: 0,
      name: "garden-centerpiece",
      spacing: 0,
      tilecount: 16,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 4,
      firstgid: TILESETS.groundDetails.firstGid,
      image: "../decor/garden-ground-details.png",
      imageheight: 32,
      imagewidth: 128,
      margin: 0,
      name: "garden-ground-details",
      spacing: 0,
      tilecount: 4,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 4,
      firstgid: TILESETS.hedges.firstGid,
      image: "../decor/garden-hedges.png",
      imageheight: 32,
      imagewidth: 128,
      margin: 0,
      name: "garden-hedges",
      spacing: 0,
      tilecount: 4,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
    {
      columns: 4,
      firstgid: TILESETS.vines.firstGid,
      image: "../decor/garden-vines.png",
      imageheight: 32,
      imagewidth: 128,
      margin: 0,
      name: "garden-vines",
      spacing: 0,
      tilecount: 4,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
  ],
  tilewidth: TILE_SIZE,
  type: "map",
  version: "1.10",
  width: MAP_COLUMNS,
};

await mkdir(dirname(MAP_PATH), { recursive: true });
await writeFile(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, "utf8");

console.log(`Garden map generated at ${MAP_PATH}`);
