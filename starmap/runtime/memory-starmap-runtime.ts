import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { StarPosition, StarViewModel } from "../../domain";
import { resolveContentStarRuntimePosition } from "./content-star-runtime-position";
import {
  MAX_STARMAP_DEVICE_PIXEL_RATIO,
  createAmbientStarfield,
  createContentStarMaterial,
  resolveContentStarVisual,
} from "./starmap-visual-assets";

const CAMERA_DISTANCE = 116;
const CONTENT_STAR_HIT_RADIUS_PX = 18;
const POINTER_DRAG_THRESHOLD_PX = 5;
const STAR_APPEAR_DURATION_MS = 820;
const STAR_LAUNCH_CLICK_GRACE_MS = 2_400;
const STAR_PULSE_DURATION_MS = 760;

type StarHoverTarget = Readonly<{
  fragmentId: string;
  title: string;
  clientX: number;
  clientY: number;
}>;

export type ContentStarScreenPosition = Readonly<{
  clientX: number;
  clientY: number;
}>;

type MemoryStarmapRuntimeOptions = Readonly<{
  host: HTMLElement;
  initialStars: readonly StarViewModel[];
  initialRotationSpeed: number;
  isReducedMotion: boolean;
  onBackgroundSelected: () => void;
  onRuntimeError: () => void;
  onStarHover: (target: StarHoverTarget | null) => void;
  onStarSelected: (fragmentId: string) => void;
}>;

export type MemoryStarmapRuntime = Readonly<{
  destroy: () => void;
  getStarScreenPosition: (
    fragmentId: string,
    pendingPosition?: StarPosition | null,
  ) => ContentStarScreenPosition | null;
  setDetailOpen: (isOpen: boolean) => void;
  setStarLaunchActive: (fragmentId: string | null, pendingPosition?: StarPosition | null) => void;
  setReducedMotion: (isReducedMotion: boolean) => void;
  setRotationSpeed: (radiansPerSecond: number) => void;
  setSelectedStar: (fragmentId: string | null) => void;
  setStars: (stars: readonly StarViewModel[]) => void;
}>;

type StarEffects = Readonly<{
  appearedAt: number | null;
  pulsedAt: number | null;
}>;

type PointerPosition = Readonly<{
  clientX: number;
  clientY: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - clamp(value, 0, 1), 3);
}

function createRuntimeResources(options: MemoryStarmapRuntimeOptions) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01040d);

  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 360);
  camera.position.set(0, 0, CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  let renderer: THREE.WebGLRenderer | null = null;
  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let outputPass: OutputPass | null = null;
  let ambientStarfield: ReturnType<typeof createAmbientStarfield> | null = null;
  let contentMaterial: THREE.ShaderMaterial | null = null;
  let contentGeometry: THREE.BufferGeometry | null = null;
  let controls: OrbitControls | null = null;

  try {
    renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x01040d, 1);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = "memory-starmap-webgl";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";
    options.host.replaceChildren(renderer.domElement);

    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.06, 0.38, 0.11);
    outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    const starfieldRoot = new THREE.Group();
    const farField = new THREE.Group();
    const midField = new THREE.Group();
    const contentField = new THREE.Group();
    farField.rotation.x = -0.025;
    midField.rotation.x = -0.045;
    contentField.rotation.x = -0.07;
    starfieldRoot.add(farField, midField, contentField);
    scene.add(starfieldRoot);

    ambientStarfield = createAmbientStarfield();
    farField.add(ambientStarfield.dust);
    midField.add(ambientStarfield.midStars, ambientStarfield.beacons);

    contentMaterial = createContentStarMaterial(1);
    contentGeometry = new THREE.BufferGeometry();
    const contentStars = new THREE.Points(contentGeometry, contentMaterial);
    contentStars.frustumCulled = false;
    contentField.add(contentStars);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !options.isReducedMotion;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 74;
    controls.maxDistance = 168;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.62;
    controls.target.set(0, 0, 0);
    controls.saveState();

    return {
      ambientStarfield,
      bloomPass,
      camera,
      composer,
      contentField,
      contentGeometry,
      contentMaterial,
      contentStars,
      controls,
      farField,
      midField,
      outputPass,
      renderer,
      renderPass,
      scene,
      starfieldRoot,
    };
  } catch (error) {
    controls?.dispose();
    contentGeometry?.dispose();
    contentMaterial?.dispose();
    ambientStarfield?.destroy();
    renderPass?.dispose();
    bloomPass?.dispose();
    outputPass?.dispose();
    composer?.dispose();
    if (renderer !== null) {
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === options.host) {
        options.host.replaceChildren();
      }
    }
    throw error;
  }
}

export function createMemoryStarmapRuntime(
  options: MemoryStarmapRuntimeOptions,
): MemoryStarmapRuntime {
  const {
    ambientStarfield,
    bloomPass,
    camera,
    composer,
    contentField,
    contentGeometry: initialContentGeometry,
    contentMaterial,
    contentStars,
    controls,
    farField,
    midField,
    outputPass,
    renderer,
    renderPass,
    scene,
    starfieldRoot,
  } = createRuntimeResources(options);
  let contentGeometry = initialContentGeometry;

  let stars: readonly StarViewModel[] = [];
  let baseColorValues = new Float32Array(0);
  let colorValues = new Float32Array(0);
  let baseSizeValues = new Float32Array(0);
  let sizeValues = new Float32Array(0);
  let twinklePhaseValues = new Float32Array(0);
  let twinkleSpeedValues = new Float32Array(0);
  let isDestroyed = false;
  let isDetailOpen = false;
  let isReducedMotion = options.isReducedMotion;
  let isDocumentVisible = document.visibilityState !== "hidden";
  let isCameraInteracting = false;
  let launchingStarId: string | null = null;
  let launchingStarPosition: StarPosition | null = null;
  let rotationSpeed = Math.max(0, options.initialRotationSpeed);
  let rotationResumeAt = 0;
  let selectedStarId: string | null = null;
  let hoveredStarId: string | null = null;
  let pointerPosition: PointerPosition | null = null;
  let pointerDownPosition: PointerPosition | null = null;
  let notifiedPointerPosition: PointerPosition | null = null;
  let didPointerDrag = false;
  let isPointerHitTestPending = false;
  let animationFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let previousFrameTime = performance.now();
  const effectsByFragmentId = new Map<string, StarEffects>();
  const worldPosition = new THREE.Vector3();
  const launchDirection = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const launchRotation = new THREE.Quaternion();

  function resize(): void {
    if (isDestroyed) return;
    const width = Math.max(1, options.host.clientWidth);
    const height = Math.max(1, options.host.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_STARMAP_DEVICE_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    contentMaterial.uniforms.uPixelRatio!.value = pixelRatio;
    isPointerHitTestPending = pointerPosition !== null;
    startAnimation();
  }

  function rebuildContentGeometry(nextStars: readonly StarViewModel[]): void {
    const nextPositionValues = new Float32Array(nextStars.length * 3);
    const nextBaseColorValues = new Float32Array(nextStars.length * 3);
    const nextColorValues = new Float32Array(nextStars.length * 3);
    const nextBaseSizeValues = new Float32Array(nextStars.length);
    const nextSizeValues = new Float32Array(nextStars.length);
    const nextTwinklePhaseValues = new Float32Array(nextStars.length);
    const nextTwinkleSpeedValues = new Float32Array(nextStars.length);

    for (let index = 0; index < nextStars.length; index += 1) {
      const star = nextStars[index];
      if (star === undefined) continue;
      const offset = index * 3;
      const visual = resolveContentStarVisual(star);
      nextPositionValues[offset] = star.position.x;
      nextPositionValues[offset + 1] = star.position.y;
      nextPositionValues[offset + 2] = star.position.z;
      nextBaseColorValues[offset] = visual.color.r;
      nextBaseColorValues[offset + 1] = visual.color.g;
      nextBaseColorValues[offset + 2] = visual.color.b;
      nextColorValues[offset] = visual.color.r;
      nextColorValues[offset + 1] = visual.color.g;
      nextColorValues[offset + 2] = visual.color.b;
      nextBaseSizeValues[index] = visual.size;
      nextSizeValues[index] = visual.size;
      nextTwinklePhaseValues[index] = visual.twinklePhase;
      nextTwinkleSpeedValues[index] = visual.twinkleSpeed;
    }

    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(nextPositionValues, 3));
    nextGeometry.setAttribute("color", new THREE.BufferAttribute(nextColorValues, 3));
    nextGeometry.setAttribute("aSize", new THREE.BufferAttribute(nextSizeValues, 1));
    nextGeometry.computeBoundingSphere();
    contentStars.geometry = nextGeometry;
    contentGeometry.dispose();
    contentGeometry = nextGeometry;
    baseColorValues = nextBaseColorValues;
    colorValues = nextColorValues;
    baseSizeValues = nextBaseSizeValues;
    sizeValues = nextSizeValues;
    twinklePhaseValues = nextTwinklePhaseValues;
    twinkleSpeedValues = nextTwinkleSpeedValues;
  }

  function applyStarEffects(now: number): boolean {
    let hasActiveTransition = false;

    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      if (star === undefined) continue;
      const offset = index * 3;
      const effects = effectsByFragmentId.get(star.fragmentId);
      if (star.fragmentId === launchingStarId) {
        colorValues[offset] = 0;
        colorValues[offset + 1] = 0;
        colorValues[offset + 2] = 0;
        sizeValues[index] = 0;
        continue;
      }
      let appearance = 1;
      let pulse = 0;

      if (!isReducedMotion && effects?.appearedAt !== null && effects?.appearedAt !== undefined) {
        const progress = (now - effects.appearedAt) / STAR_APPEAR_DURATION_MS;
        appearance = easeOutCubic(progress);
        hasActiveTransition = progress < 1;
        if (progress >= 1) {
          effectsByFragmentId.set(star.fragmentId, { ...effects, appearedAt: null });
        }
      }

      if (!isReducedMotion && effects?.pulsedAt !== null && effects?.pulsedAt !== undefined) {
        const progress = (now - effects.pulsedAt) / STAR_PULSE_DURATION_MS;
        pulse = progress >= 1 ? 0 : Math.sin(clamp(progress, 0, 1) * Math.PI);
        hasActiveTransition ||= progress < 1;
        if (progress >= 1) {
          effectsByFragmentId.set(star.fragmentId, { ...effects, pulsedAt: null });
        }
      }

      const isSelected = star.fragmentId === selectedStarId;
      const isHovered = star.fragmentId === hoveredStarId;
      const idlePulse = isReducedMotion
        ? 0
        : Math.sin(
            (now / 1_000) * (twinkleSpeedValues[index] ?? 0.5) + (twinklePhaseValues[index] ?? 0),
          );
      const colorFactor =
        appearance *
        (1 + idlePulse * 0.045 + pulse * 0.34 + (isSelected ? 0.24 : 0) + (isHovered ? 0.12 : 0));
      const sizeFactor =
        appearance *
        (1 + idlePulse * 0.035 + pulse * 0.4 + (isSelected ? 0.34 : 0) + (isHovered ? 0.18 : 0));

      colorValues[offset] = Math.max(0, (baseColorValues[offset] ?? 0) * colorFactor);
      colorValues[offset + 1] = Math.max(0, (baseColorValues[offset + 1] ?? 0) * colorFactor);
      colorValues[offset + 2] = Math.max(0, (baseColorValues[offset + 2] ?? 0) * colorFactor);
      sizeValues[index] = Math.max(0, (baseSizeValues[index] ?? 0) * sizeFactor);
    }

    const colorAttribute = contentGeometry.getAttribute("color");
    const sizeAttribute = contentGeometry.getAttribute("aSize");
    if (colorAttribute !== undefined) colorAttribute.needsUpdate = true;
    if (sizeAttribute !== undefined) sizeAttribute.needsUpdate = true;
    return hasActiveTransition;
  }

  function projectStarPosition(position: StarPosition): ContentStarScreenPosition | null {
    const rect = renderer.domElement.getBoundingClientRect();
    worldPosition
      .set(Math.fround(position.x), Math.fround(position.y), Math.fround(position.z))
      .applyMatrix4(contentStars.matrixWorld)
      .project(camera);
    if (
      worldPosition.z < -1 ||
      worldPosition.z > 1 ||
      worldPosition.x < -1 ||
      worldPosition.x > 1 ||
      worldPosition.y < -1 ||
      worldPosition.y > 1
    ) {
      return null;
    }

    return {
      clientX: rect.left + (worldPosition.x * 0.5 + 0.5) * rect.width,
      clientY: rect.top + (-worldPosition.y * 0.5 + 0.5) * rect.height,
    };
  }

  function projectStarAtIndex(index: number): ContentStarScreenPosition | null {
    const star = stars[index];
    return star === undefined ? null : projectStarPosition(star.position);
  }

  function getStarScreenPosition(
    fragmentId: string,
    pendingPosition: StarPosition | null = null,
  ): ContentStarScreenPosition | null {
    const position = resolveContentStarRuntimePosition(stars, fragmentId, pendingPosition);
    if (position === null) return null;
    camera.updateMatrixWorld(true);
    contentStars.updateWorldMatrix(true, false);
    return projectStarPosition(position);
  }

  function focusLaunchingStar(
    fragmentId: string,
    pendingPosition: StarPosition | null = null,
  ): void {
    const position = resolveContentStarRuntimePosition(stars, fragmentId, pendingPosition);
    if (position === null) return;
    camera.updateMatrixWorld(true);
    contentStars.updateWorldMatrix(true, false);
    launchDirection
      .set(Math.fround(position.x), Math.fround(position.y), Math.fround(position.z))
      .applyMatrix4(contentStars.matrixWorld)
      .normalize();
    cameraDirection.copy(camera.position).normalize();
    launchRotation.setFromUnitVectors(launchDirection, cameraDirection);
    starfieldRoot.quaternion.premultiply(launchRotation);
    starfieldRoot.updateMatrixWorld(true);
    isPointerHitTestPending = pointerPosition !== null;
    startAnimation();
  }

  function resolveHit(pointer: PointerPosition): StarViewModel | null {
    if (stars.length === 0) return null;
    let bestStar: StarViewModel | null = null;
    let bestDistanceSquared = CONTENT_STAR_HIT_RADIUS_PX * CONTENT_STAR_HIT_RADIUS_PX;
    camera.updateMatrixWorld(true);
    contentStars.updateWorldMatrix(true, false);

    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      if (star === undefined) continue;
      if (star.fragmentId === launchingStarId) continue;
      const projected = projectStarAtIndex(index);
      if (projected === null) continue;
      const deltaX = pointer.clientX - projected.clientX;
      const deltaY = pointer.clientY - projected.clientY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared <= bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        bestStar = star;
      }
    }

    return bestStar;
  }

  function updateHover(pointer: PointerPosition): void {
    if (isCameraInteracting) return;
    const target = resolveHit(pointer);
    const nextHoveredStarId = target?.fragmentId ?? null;
    const didTargetChange = nextHoveredStarId !== hoveredStarId;
    const didPointerMove =
      notifiedPointerPosition?.clientX !== pointer.clientX ||
      notifiedPointerPosition?.clientY !== pointer.clientY;
    if (didTargetChange || (target !== null && didPointerMove)) {
      hoveredStarId = nextHoveredStarId;
      notifiedPointerPosition = pointer;
      renderer.domElement.style.cursor = target === null ? "grab" : "pointer";
      options.onStarHover(
        target === null
          ? null
          : {
              fragmentId: target.fragmentId,
              title: target.title,
              clientX: pointer.clientX,
              clientY: pointer.clientY,
            },
      );
    }
  }

  function rotateFields(deltaSeconds: number): boolean {
    if (
      isReducedMotion ||
      isCameraInteracting ||
      isDetailOpen ||
      launchingStarId !== null ||
      performance.now() < rotationResumeAt
    ) {
      return false;
    }
    const interactionFactor = hoveredStarId === null ? 1 : 0.32;
    const rotationDelta = rotationSpeed * interactionFactor * deltaSeconds;
    if (rotationDelta <= 0) return false;

    starfieldRoot.rotation.y += rotationDelta;
    farField.rotation.z += rotationDelta * 0.012;
    midField.rotation.x += rotationDelta * 0.028;
    contentField.rotation.x += rotationDelta * 0.045;
    return true;
  }

  function renderFrame(now: number): void {
    if (isDestroyed) return;
    animationFrame = null;
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - previousFrameTime) / 1_000));
    previousFrameTime = now;
    const didControlsChange = launchingStarId === null && controls.update();
    const didRotate = rotateFields(deltaSeconds);

    if (pointerPosition !== null && (didRotate || didControlsChange || isPointerHitTestPending)) {
      updateHover(pointerPosition);
      isPointerHitTestPending = false;
    }
    const hasActiveTransition = applyStarEffects(now);
    composer.render(deltaSeconds);

    if (
      !isReducedMotion ||
      isCameraInteracting ||
      didControlsChange ||
      hasActiveTransition ||
      isPointerHitTestPending
    ) {
      startAnimation();
    }
  }

  function startAnimation(): void {
    if (animationFrame !== null || isDestroyed || !isDocumentVisible) return;
    previousFrameTime = performance.now();
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function stopAnimation(): void {
    if (animationFrame === null) return;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function destroyRuntime(shouldNotifyHover: boolean, shouldForceContextLoss = true): void {
    if (isDestroyed) return;
    isDestroyed = true;
    stopAnimation();
    resizeObserver?.disconnect();
    resizeObserver = null;
    renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    renderer.domElement.removeEventListener("pointermove", handlePointerMove);
    renderer.domElement.removeEventListener("pointerup", handlePointerUp);
    renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
    renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.removeEventListener("click", handleClick);
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
    controls.removeEventListener("start", handleControlStart);
    controls.removeEventListener("change", handleControlChange);
    controls.removeEventListener("end", handleControlEnd);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("resize", resize);
    controls.dispose();
    farField.remove(ambientStarfield.dust);
    midField.remove(ambientStarfield.midStars, ambientStarfield.beacons);
    contentField.remove(contentStars);
    scene.remove(farField, midField, contentField);
    ambientStarfield.destroy();
    contentGeometry.dispose();
    contentMaterial.dispose();
    renderPass.dispose();
    bloomPass.dispose();
    outputPass.dispose();
    composer.dispose();
    renderer.dispose();
    if (shouldForceContextLoss) renderer.forceContextLoss();
    if (renderer.domElement.parentElement === options.host) {
      options.host.replaceChildren();
    }
    if (shouldNotifyHover) options.onStarHover(null);
  }

  function handlePointerDown(event: PointerEvent): void {
    pointerDownPosition = { clientX: event.clientX, clientY: event.clientY };
    didPointerDrag = false;
  }

  function handlePointerMove(event: PointerEvent): void {
    pointerPosition = { clientX: event.clientX, clientY: event.clientY };
    if (pointerDownPosition !== null) {
      const deltaX = event.clientX - pointerDownPosition.clientX;
      const deltaY = event.clientY - pointerDownPosition.clientY;
      didPointerDrag ||=
        deltaX * deltaX + deltaY * deltaY > POINTER_DRAG_THRESHOLD_PX * POINTER_DRAG_THRESHOLD_PX;
    }
    isPointerHitTestPending = true;
    startAnimation();
  }

  function handlePointerUp(): void {
    pointerDownPosition = null;
  }

  function handlePointerLeave(): void {
    pointerPosition = null;
    pointerDownPosition = null;
    notifiedPointerPosition = null;
    didPointerDrag = false;
    isPointerHitTestPending = false;
    hoveredStarId = null;
    renderer.domElement.style.cursor = "grab";
    options.onStarHover(null);
    startAnimation();
  }

  function handleClick(event: MouseEvent): void {
    if (didPointerDrag) {
      didPointerDrag = false;
      return;
    }
    const target = resolveHit({ clientX: event.clientX, clientY: event.clientY });
    if (target === null) {
      options.onBackgroundSelected();
      return;
    }
    options.onStarSelected(target.fragmentId);
  }

  function handleControlStart(): void {
    isCameraInteracting = true;
    hoveredStarId = null;
    renderer.domElement.style.cursor = "grabbing";
    options.onStarHover(null);
    startAnimation();
  }

  function handleControlChange(): void {
    isPointerHitTestPending = pointerPosition !== null;
    startAnimation();
  }

  function handleControlEnd(): void {
    isCameraInteracting = false;
    renderer.domElement.style.cursor = "grab";
    if (pointerPosition !== null) {
      isPointerHitTestPending = true;
      updateHover(pointerPosition);
    }
    startAnimation();
  }

  function handleVisibilityChange(): void {
    isDocumentVisible = document.visibilityState !== "hidden";
    if (isDocumentVisible) {
      startAnimation();
    } else {
      stopAnimation();
    }
  }

  function handleContextLost(event: Event): void {
    event.preventDefault();
    if (isDestroyed) return;
    destroyRuntime(false, false);
    options.onRuntimeError();
  }

  function updateStars(nextStars: readonly StarViewModel[], shouldAnimate = true): void {
    const now = performance.now();
    const previousById = new Map(stars.map((star) => [star.fragmentId, star] as const));
    const nextIds = new Set(nextStars.map((star) => star.fragmentId));

    for (const fragmentId of effectsByFragmentId.keys()) {
      if (!nextIds.has(fragmentId)) effectsByFragmentId.delete(fragmentId);
    }
    for (const star of nextStars) {
      const previous = previousById.get(star.fragmentId);
      const currentEffects = effectsByFragmentId.get(star.fragmentId) ?? {
        appearedAt: null,
        pulsedAt: null,
      };
      effectsByFragmentId.set(star.fragmentId, {
        appearedAt:
          shouldAnimate &&
          previous === undefined &&
          star.fragmentId !== launchingStarId &&
          !isReducedMotion
            ? now
            : null,
        pulsedAt:
          shouldAnimate &&
          previous !== undefined &&
          star.brightness > previous.brightness &&
          !isReducedMotion
            ? now
            : currentEffects.pulsedAt,
      });
    }

    stars = [...nextStars];
    rebuildContentGeometry(stars);
    if (launchingStarId !== null) focusLaunchingStar(launchingStarId, launchingStarPosition);
    isPointerHitTestPending = pointerPosition !== null;
    applyStarEffects(now);
  }

  try {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(options.host);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove, { passive: true });
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    controls.addEventListener("start", handleControlStart);
    controls.addEventListener("change", handleControlChange);
    controls.addEventListener("end", handleControlEnd);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("resize", resize);
    resize();
    updateStars(options.initialStars, false);
    startAnimation();
  } catch (error) {
    destroyRuntime(false);
    throw error;
  }

  return {
    destroy(): void {
      destroyRuntime(true);
    },
    getStarScreenPosition(
      fragmentId: string,
      pendingPosition: StarPosition | null = null,
    ): ContentStarScreenPosition | null {
      if (isDestroyed) return null;
      return getStarScreenPosition(fragmentId, pendingPosition);
    },
    setDetailOpen(nextIsOpen: boolean): void {
      if (isDestroyed) return;
      isDetailOpen = nextIsOpen;
      controls.enabled = !nextIsOpen && launchingStarId === null;
      if (nextIsOpen && hoveredStarId !== null) {
        hoveredStarId = null;
        options.onStarHover(null);
        renderer.domElement.style.cursor = "default";
      }
      startAnimation();
    },
    setReducedMotion(nextIsReducedMotion: boolean): void {
      if (isDestroyed) return;
      isReducedMotion = nextIsReducedMotion;
      controls.enableDamping = !nextIsReducedMotion;
      if (isReducedMotion) effectsByFragmentId.clear();
      startAnimation();
    },
    setRotationSpeed(radiansPerSecond: number): void {
      if (isDestroyed) return;
      rotationSpeed = Math.max(0, radiansPerSecond);
    },
    setSelectedStar(fragmentId: string | null): void {
      if (isDestroyed) return;
      selectedStarId = fragmentId;
      startAnimation();
    },
    setStarLaunchActive(
      fragmentId: string | null,
      pendingPosition: StarPosition | null = null,
    ): void {
      if (isDestroyed) return;
      const previousLaunchingStarId = launchingStarId;
      launchingStarId = fragmentId;
      launchingStarPosition = fragmentId === null ? null : pendingPosition;
      rotationResumeAt = fragmentId === null ? performance.now() + STAR_LAUNCH_CLICK_GRACE_MS : 0;
      controls.enabled = fragmentId === null && !isDetailOpen;
      if (fragmentId !== null) focusLaunchingStar(fragmentId, launchingStarPosition);
      if (fragmentId === null && previousLaunchingStarId !== null) {
        effectsByFragmentId.set(previousLaunchingStarId, {
          appearedAt: null,
          pulsedAt: performance.now(),
        });
        applyStarEffects(performance.now());
      }
      startAnimation();
    },
    setStars(nextStars: readonly StarViewModel[]): void {
      if (isDestroyed) return;
      updateStars(nextStars, true);
      startAnimation();
    },
  };
}
