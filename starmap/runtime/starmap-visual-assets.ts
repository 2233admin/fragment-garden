import * as THREE from "three";

import { STAR_BRIGHTNESS_MAX, STAR_BRIGHTNESS_MIN, type StarViewModel } from "../../domain";

export const MAX_STARMAP_DEVICE_PIXEL_RATIO = 2;

const AMBIENT_DUST_COUNT = 2_350;
const AMBIENT_MID_STAR_COUNT = 760;
const AMBIENT_BEACON_COUNT = 90;
const AMBIENT_CLUSTER_COUNT = 10;
const UINT32_RANGE = 4_294_967_296;

type AmbientTier = Readonly<{
  count: number;
  opacity: number;
  positionScale: number;
  seedOffset: number;
  size: number;
  intensityMinimum: number;
  intensityMaximum: number;
}>;

type AmbientCluster = Readonly<{
  x: number;
  y: number;
  z: number;
  spreadX: number;
  spreadY: number;
  spreadZ: number;
}>;

export type AmbientStarfield = Readonly<{
  dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  midStars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  beacons: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  texture: THREE.CanvasTexture;
  destroy: () => void;
}>;

export type ContentStarVisual = Readonly<{
  color: THREE.Color;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / UINT32_RANGE;
  };
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createStarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Unable to create the starmap star texture.");
  }

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.12, "rgba(255, 255, 255, 0.98)");
  gradient.addColorStop(0.34, "rgba(225, 238, 255, 0.74)");
  gradient.addColorStop(0.68, "rgba(174, 207, 255, 0.18)");
  gradient.addColorStop(1, "rgba(140, 188, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function buildAmbientClusters(random: () => number): readonly AmbientCluster[] {
  return Array.from({ length: AMBIENT_CLUSTER_COUNT }, () => {
    const baseSpread = 8 + Math.pow(random(), 0.55) * 24;
    return {
      x: (random() - 0.5) * 168,
      y: (random() - 0.5) * 116,
      z: (random() - 0.5) * 148,
      spreadX: baseSpread * (0.28 + random() * 1.9),
      spreadY: baseSpread * (0.24 + random() * 1.75),
      spreadZ: baseSpread * (0.3 + random() * 1.8),
    };
  });
}

function centeredRandom(random: () => number): number {
  return random() + random() + random() + random() - 2;
}

function writeAmbientPosition(
  positions: Float32Array,
  offset: number,
  random: () => number,
  clusters: readonly AmbientCluster[],
  positionScale: number,
): void {
  if (random() < 0.81) {
    const cluster = clusters[Math.floor(random() * clusters.length)] ?? clusters[0];
    if (cluster !== undefined) {
      const falloff = 0.3 + Math.pow(random(), 1.7) * 0.9;
      positions[offset] =
        (cluster.x + centeredRandom(random) * cluster.spreadX * falloff) * positionScale;
      positions[offset + 1] =
        (cluster.y + centeredRandom(random) * cluster.spreadY * falloff) * positionScale;
      positions[offset + 2] =
        (cluster.z + centeredRandom(random) * cluster.spreadZ * falloff) * positionScale;
      return;
    }
  }

  const vertical = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const horizontalRadius = Math.sqrt(Math.max(0, 1 - vertical * vertical));
  const radius = 60 + Math.pow(random(), 0.6) * 92;
  positions[offset] = radius * horizontalRadius * Math.cos(angle) * 1.22 * positionScale;
  positions[offset + 1] = radius * vertical * 0.78 * positionScale;
  positions[offset + 2] = radius * horizontalRadius * Math.sin(angle) * positionScale;
}

function writeAmbientColor(
  colors: Float32Array,
  offset: number,
  random: () => number,
  intensityMinimum: number,
  intensityMaximum: number,
): void {
  const intensity = intensityMinimum + random() * (intensityMaximum - intensityMinimum);
  const temperature = random();
  const red = temperature < 0.12 ? 1 : 0.68 + random() * 0.18;
  const green = temperature < 0.12 ? 0.82 : 0.78 + random() * 0.14;
  const blue = temperature < 0.12 ? 0.58 : 0.98 + random() * 0.12;
  colors[offset] = intensity * red;
  colors[offset + 1] = intensity * green;
  colors[offset + 2] = intensity * blue;
}

function createAmbientTier(
  tier: AmbientTier,
  texture: THREE.CanvasTexture,
  clusters: readonly AmbientCluster[],
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const random = createSeededRandom(0x5a17cafe + tier.seedOffset);
  const positions = new Float32Array(tier.count * 3);
  const colors = new Float32Array(tier.count * 3);

  for (let index = 0; index < tier.count; index += 1) {
    const offset = index * 3;
    writeAmbientPosition(positions, offset, random, clusters, tier.positionScale);
    writeAmbientColor(colors, offset, random, tier.intensityMinimum, tier.intensityMaximum);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    alphaTest: 0.012,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: texture,
    opacity: tier.opacity,
    size: tier.size,
    sizeAttenuation: true,
    transparent: true,
    vertexColors: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export function createAmbientStarfield(): AmbientStarfield {
  const texture = createStarTexture();
  const clusterRandom = createSeededRandom(0x6d656d6f);
  const clusters = buildAmbientClusters(clusterRandom);
  const dust = createAmbientTier(
    {
      count: AMBIENT_DUST_COUNT,
      intensityMaximum: 0.2,
      intensityMinimum: 0.035,
      opacity: 0.84,
      positionScale: 1.22,
      seedOffset: 17,
      size: 0.48,
    },
    texture,
    clusters,
  );
  const midStars = createAmbientTier(
    {
      count: AMBIENT_MID_STAR_COUNT,
      intensityMaximum: 0.58,
      intensityMinimum: 0.18,
      opacity: 0.9,
      positionScale: 1,
      seedOffset: 131,
      size: 0.82,
    },
    texture,
    clusters,
  );
  const beacons = createAmbientTier(
    {
      count: AMBIENT_BEACON_COUNT,
      intensityMaximum: 0.92,
      intensityMinimum: 0.42,
      opacity: 0.94,
      positionScale: 0.9,
      seedOffset: 379,
      size: 1.18,
    },
    texture,
    clusters,
  );

  return {
    beacons,
    dust,
    midStars,
    texture,
    destroy(): void {
      for (const points of [dust, midStars, beacons]) {
        points.geometry.dispose();
        points.material.dispose();
      }
      texture.dispose();
    },
  };
}

export function createContentStarMaterial(pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    uniforms: {
      uPixelRatio: { value: pixelRatio },
    },
    vertexColors: true,
    vertexShader: `
      attribute float aSize;
      uniform float uPixelRatio;
      varying vec3 vColor;

      void main() {
        vColor = color;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float perspectiveScale = clamp(116.0 / max(1.0, -viewPosition.z), 0.42, 2.35);
        gl_PointSize = aSize * uPixelRatio * perspectiveScale;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;

      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius > 1.0) discard;

        float core = 1.0 - smoothstep(0.012, 0.085, radius);
        float disc = 1.0 - smoothstep(0.07, 0.26, radius);
        float halo = pow(max(0.0, 1.0 - radius), 3.6);
        float outerGlow = 1.0 - smoothstep(0.3, 1.0, radius);
        vec3 coloredGlow = vColor * (disc * 0.64 + halo * 0.18 + outerGlow * 0.03);
        vec3 whiteCore = vec3(5.5) * core;
        float alpha = clamp(core + disc * 0.78 + halo * 0.3 + outerGlow * 0.06, 0.0, 1.0);

        gl_FragColor = vec4(coloredGlow + whiteCore, alpha);
      }
    `,
  });
}

export function resolveContentStarVisual(star: StarViewModel): ContentStarVisual {
  const paletteHash = hashString(`${star.fragmentId}:palette`) % 100;
  const palette =
    paletteHash < 62
      ? ([0.32, 0.92, 2.75] as const)
      : paletteHash < 80
        ? ([0.24, 1.25, 2.2] as const)
        : paletteHash < 92
          ? ([2.75, 0.95, 0.12] as const)
          : paletteHash < 98
            ? ([1.5, 0.42, 2.65] as const)
            : ([2.65, 0.32, 0.16] as const);
  const brightnessProgress = clamp(
    (star.brightness - STAR_BRIGHTNESS_MIN) / (STAR_BRIGHTNESS_MAX - STAR_BRIGHTNESS_MIN),
    0,
    1,
  );
  const energy = 0.9 + brightnessProgress * 0.56;
  const phaseHash = hashString(`${star.fragmentId}:twinkle`) / UINT32_RANGE;
  const speedHash = hashString(`${star.fragmentId}:twinkle-speed`) / UINT32_RANGE;

  return {
    color: new THREE.Color(palette[0] * energy, palette[1] * energy, palette[2] * energy),
    size: 23 + brightnessProgress * 11,
    twinklePhase: phaseHash * Math.PI * 2,
    twinkleSpeed: 0.42 + speedHash * 0.54,
  };
}
