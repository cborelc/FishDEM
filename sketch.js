let dem = null;
let demImage = null;
let hillshadeImage = null;
let demData = null;
let demWidth = 0;
let demHeight = 0;
let demMin = 0;
let demMax = 1;
let fitScale = 1;
let viewScale = 1;
let viewOffset;
let lastPan;
let isPanning = false;
let statusText = "No DEM loaded";
let viewMode = "dem";
let cameraView = null;
let equirectView = null;
let cameraPosition = null;
let isDraggingCameraWindow = false;
let cameraDragOffset = null;
let fisheyeMode = "dem";
let fisheyeSize = 720;
let cameraWindow = { x: 24, y: 120, w: fisheyeSize, h: fisheyeSize, barH: 24 };
let demScale = 1;
let cameraZOffsetMeters = 0;
let cameraBaseZ = 0;
let equirectWindow = { x: 24, y: 0, w: 720, h: 180, pad: 12 };
let equirectBins = 360;
const useAdaptiveStep = true;
const useBilinearSampling = false;
const useRefineHit = true;
const useSupersample = false;
let markerWorld = null;

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("app");
  pixelDensity(1);
  viewOffset = createVector(0, 0);
  setupFileInput();
  setupDragDrop();
  setupToggleButtons();
  cameraView = createGraphics(fisheyeSize, fisheyeSize);
  equirectView = createGraphics(equirectWindow.w, equirectWindow.h);
  positionCameraWindow();
  setupScaleSlider();
  setupCameraZSlider();
  setupEquirectBinsSlider();
}

function draw() {
  background(8, 12, 22);
  const displayImage = viewMode === "shade" ? hillshadeImage : demImage;
  if (displayImage) {
    push();
    translate(width / 2 + viewOffset.x, height / 2 + viewOffset.y);
    scale(viewScale);
    imageMode(CENTER);
    image(displayImage, 0, 0);
    if (markerWorld) {
      drawMarker(markerWorld.x, markerWorld.y);
    }
    pop();
  }
  drawStatus();
  drawCameraWindow();
  drawEquirectWindow();
}

function drawStatus() {
  noStroke();
  fill(255, 255, 255, 180);
  textSize(12);
  textAlign(RIGHT, BOTTOM);
  text(statusText, width - 24, height - 20);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  fitToWindow();
  positionCameraWindow();
}

function mousePressed() {
  if (mouseButton === CENTER) {
    isPanning = true;
    lastPan = createVector(mouseX, mouseY);
    return;
  }
  if (mouseButton === LEFT) {
    if (isOverCameraBar(mouseX, mouseY)) {
      isDraggingCameraWindow = true;
      cameraDragOffset = createVector(mouseX - cameraWindow.x, mouseY - cameraWindow.y);
      return;
    }
    if (!isOverCameraWindow(mouseX, mouseY)) {
      setCameraFromScreen(mouseX, mouseY);
    }
  }
}

function mouseDragged() {
  if (isPanning && lastPan) {
    const current = createVector(mouseX, mouseY);
    const delta = p5.Vector.sub(current, lastPan);
    viewOffset.add(delta);
    lastPan = current;
  }
  if (isDraggingCameraWindow && cameraDragOffset) {
    cameraWindow.x = constrain(mouseX - cameraDragOffset.x, 12, width - cameraWindow.w - 12);
    cameraWindow.y = constrain(mouseY - cameraDragOffset.y, 12 + cameraWindow.barH, height - cameraWindow.h - 12);
  }
}

function mouseReleased() {
  if (mouseButton === CENTER) {
    isPanning = false;
    lastPan = null;
  }
  if (mouseButton === LEFT) {
    isDraggingCameraWindow = false;
    cameraDragOffset = null;
  }
}

function mouseWheel(event) {
  if (!demImage) {
    return;
  }
  const zoomFactor = event.delta > 0 ? 0.9 : 1.1;
  const prevScale = viewScale;
  viewScale = constrain(viewScale * zoomFactor, fitScale * 0.2, fitScale * 8);
  const scaleRatio = viewScale / prevScale;
  const mouseVector = createVector(mouseX - width / 2 - viewOffset.x, mouseY - height / 2 - viewOffset.y);
  viewOffset.sub(mouseVector.mult(scaleRatio - 1));
  return false;
}

function setupFileInput() {
  const input = select("#fileInput");
  if (!input) {
    return;
  }
  input.elt.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      loadDEM(file);
    }
  });
}

function setupToggleButtons() {
  const buttons = selectAll(".toggle");
  if (!buttons || buttons.length === 0) {
    return;
  }
  for (const button of buttons) {
    button.elt.addEventListener("click", () => {
      const nextMode = button.elt.dataset.mode;
      const nextFisheye = button.elt.dataset.fisheye;
      const nextSize = button.elt.dataset.fisheyeSize;
      if (nextMode) {
        viewMode = nextMode;
      }
      if (nextFisheye) {
        fisheyeMode = nextFisheye;
      }
      if (nextSize) {
        const size = Number(nextSize);
        if (!Number.isNaN(size) && size > 0) {
          fisheyeSize = size;
          cameraWindow.w = size;
          cameraWindow.h = size;
          cameraView = createGraphics(fisheyeSize, fisheyeSize);
          positionCameraWindow();
        }
      }
      updateToggleState(buttons);
    });
  }
  updateToggleState(buttons);
}

function updateToggleState(buttons) {
  for (const button of buttons) {
    const isActive =
      (button.elt.dataset.mode && button.elt.dataset.mode === viewMode) ||
      (button.elt.dataset.fisheye && button.elt.dataset.fisheye === fisheyeMode) ||
      (button.elt.dataset.fisheyeSize && Number(button.elt.dataset.fisheyeSize) === fisheyeSize);
    button.elt.classList.toggle("is-active", isActive);
  }
}

function setupScaleSlider() {
  const slider = select("#demScale");
  const valueLabel = select("#demScaleValue");
  if (!slider) {
    return;
  }
  const updateValue = () => {
    if (valueLabel) {
      valueLabel.elt.textContent = demScale.toFixed(1);
    }
  };
  slider.elt.addEventListener("input", (event) => {
    demScale = Number(event.target.value) || 1;
    updateValue();
    if (cameraPosition) {
      setCameraFromScreen(width / 2, height / 2);
    }
  });
  updateValue();
}

function setupCameraZSlider() {
  const slider = select("#cameraZ");
  const valueLabel = select("#cameraZValue");
  if (!slider) {
    return;
  }
  const updateValue = () => {
    if (valueLabel) {
      valueLabel.elt.textContent = `${cameraZOffsetMeters.toFixed(1)}m`;
    }
  };
  slider.elt.addEventListener("input", (event) => {
    cameraZOffsetMeters = Math.max(0, Number(event.target.value) || 0);
    updateValue();
    if (cameraPosition) {
      cameraPosition.z = Math.max(0.001, cameraBaseZ + cameraZOffsetMeters);
    }
  });
  updateValue();
}

function setupEquirectBinsSlider() {
  const slider = select("#equiBins");
  const valueLabel = select("#equiBinsValue");
  if (!slider) {
    return;
  }
  const updateValue = () => {
    if (valueLabel) {
      valueLabel.elt.textContent = `${equirectBins}`;
    }
  };
  slider.elt.addEventListener("input", (event) => {
    const next = Number(event.target.value) || equirectBins;
    equirectBins = Math.max(36, Math.min(720, Math.floor(next)));
    updateValue();
  });
  updateValue();
}

function setupDragDrop() {
  const app = select("#app");
  if (!app) {
    return;
  }
  app.elt.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  app.elt.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      loadDEM(file);
    }
  });
}

async function loadDEM(file) {
  statusText = `Loading ${file.name}...`;
  const lower = file.name.toLowerCase();
  try {
    if (lower.endsWith(".tif") || lower.endsWith(".tiff")) {
      await loadGeoTiff(file);
    } else {
      await loadImageFile(file);
    }
    buildHillshade();
    fitToWindow();
    if (!cameraPosition && demImage) {
      setCameraFromScreen(width / 2, height / 2);
    }
  } catch (error) {
    console.error(error);
    statusText = "Failed to load DEM";
  }
}

async function loadImageFile(file) {
  demImage = null;
  hillshadeImage = null;
  demData = null;
  const url = URL.createObjectURL(file);
  const img = await loadImageAsync(url);
  URL.revokeObjectURL(url);
  img.loadPixels();
  demWidth = img.width;
  demHeight = img.height;
  demData = new Float32Array(demWidth * demHeight);
  demMin = Infinity;
  demMax = -Infinity;
  for (let y = 0; y < demHeight; y += 1) {
    for (let x = 0; x < demWidth; x += 1) {
      const idx = (y * demWidth + x) * 4;
      const r = img.pixels[idx];
      const g = img.pixels[idx + 1];
      const b = img.pixels[idx + 2];
      const value = (r + g + b) / 3;
      demData[y * demWidth + x] = value;
      if (value < demMin) demMin = value;
      if (value > demMax) demMax = value;
    }
  }
  demImage = createImage(demWidth, demHeight);
  demImage.loadPixels();
  for (let i = 0; i < demData.length; i += 1) {
    const shade = Math.floor(constrain(demData[i], 0, 255));
    const idx = i * 4;
    demImage.pixels[idx] = shade;
    demImage.pixels[idx + 1] = shade;
    demImage.pixels[idx + 2] = shade;
    demImage.pixels[idx + 3] = 255;
  }
  demImage.updatePixels();
  dem = { width: demWidth, height: demHeight };
  statusText = `${file.name} (${demWidth} x ${demHeight})`;
}

async function loadGeoTiff(file) {
  demImage = null;
  hillshadeImage = null;
  demData = null;
  const buffer = await file.arrayBuffer();
  const tiff = await GeoTIFF.fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  demWidth = image.getWidth();
  demHeight = image.getHeight();
  const raster = await image.readRasters({ interleave: true });

  const minMax = getMinMax(raster);
  demMin = minMax.min;
  demMax = minMax.max;
  demImage = createImage(demWidth, demHeight);
  demImage.loadPixels();
  demData = new Float32Array(demWidth * demHeight);
  for (let i = 0; i < demWidth * demHeight; i += 1) {
    const value = raster[i];
    demData[i] = value;
    const normalized = (value - minMax.min) / (minMax.max - minMax.min || 1);
    const shade = Math.floor(constrain(normalized * 255, 0, 255));
    const idx = i * 4;
    demImage.pixels[idx] = shade;
    demImage.pixels[idx + 1] = shade;
    demImage.pixels[idx + 2] = shade;
    demImage.pixels[idx + 3] = 255;
  }
  demImage.updatePixels();
  dem = { width: demWidth, height: demHeight };
  statusText = `${file.name} (${demWidth} x ${demHeight})`;
}

function getMinMax(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (Number.isNaN(v)) {
      continue;
    }
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  return { min, max };
}

function buildHillshade() {
  if (!demData || demWidth === 0 || demHeight === 0) {
    hillshadeImage = null;
    return;
  }
  const azimuth = radians(315);
  const altitude = radians(45);
  const zFactor = 1;
  const hillshade = createImage(demWidth, demHeight);
  hillshade.loadPixels();

  for (let y = 0; y < demHeight; y += 1) {
    for (let x = 0; x < demWidth; x += 1) {
      const idx = (y * demWidth + x) * 4;
      const dzdx = ((getElevation(x + 1, y - 1) + 2 * getElevation(x + 1, y) + getElevation(x + 1, y + 1)) - (getElevation(x - 1, y - 1) + 2 * getElevation(x - 1, y) + getElevation(x - 1, y + 1))) / 8;
      const dzdy = ((getElevation(x - 1, y + 1) + 2 * getElevation(x, y + 1) + getElevation(x + 1, y + 1)) - (getElevation(x - 1, y - 1) + 2 * getElevation(x, y - 1) + getElevation(x + 1, y - 1))) / 8;
      const slope = atan(zFactor * sqrt(dzdx * dzdx + dzdy * dzdy));
      const aspect = atan2(dzdy, -dzdx);
      const shaded = 255 * (cos(altitude) * cos(slope) + sin(altitude) * sin(slope) * cos(azimuth - aspect));
      const shade = Math.floor(constrain(shaded, 0, 255));
      hillshade.pixels[idx] = shade;
      hillshade.pixels[idx + 1] = shade;
      hillshade.pixels[idx + 2] = shade;
      hillshade.pixels[idx + 3] = 255;
    }
  }
  hillshade.updatePixels();
  hillshadeImage = hillshade;
  hillshadeImage.loadPixels();
}

function getElevation(x, y) {
  const cx = constrain(x, 0, demWidth - 1);
  const cy = constrain(y, 0, demHeight - 1);
  return demData[cy * demWidth + cx] ?? 0;
}

function getElevationNormalized(x, y) {
  const value = getElevation(x, y);
  return (value - demMin) / (demMax - demMin || 1);
}

function fitToWindow() {
  if (!demImage) {
    return;
  }
  const scaleX = width / demImage.width;
  const scaleY = height / demImage.height;
  fitScale = Math.min(scaleX, scaleY);
  viewScale = fitScale;
  viewOffset.set(0, 0);
}

function loadImageAsync(url) {
  return new Promise((resolve, reject) => {
    loadImage(url, resolve, reject);
  });
}

function setCameraFromScreen(screenX, screenY) {
  if (!demData || !demImage) {
    return;
  }
  const worldX = (screenX - width / 2 - viewOffset.x) / viewScale;
  const worldY = (screenY - height / 2 - viewOffset.y) / viewScale;
  const demX = worldX + demWidth / 2;
  const demY = worldY + demHeight / 2;
  if (demX < 0 || demX >= demWidth || demY < 0 || demY >= demHeight) {
    return;
  }
  const z = getElevationNormalized(Math.floor(demX), Math.floor(demY)) * 80 * demScale;
  cameraBaseZ = z + 0.001;
  cameraPosition = createVector(worldX, worldY, cameraBaseZ + cameraZOffsetMeters);
  markerWorld = createVector(worldX, worldY);
}

function drawCameraWindow() {
  if (!cameraPosition || !demData) {
    return;
  }
  renderCameraView();
  const barX = cameraWindow.x;
  const barY = cameraWindow.y - cameraWindow.barH;
  const textLabel = `x ${cameraPosition.x.toFixed(1)}  y ${cameraPosition.y.toFixed(1)}  z ${cameraPosition.z.toFixed(2)}`;

  noStroke();
  fill(8, 12, 22, 200);
  rect(barX, barY, cameraWindow.w, cameraWindow.barH, 6);
  fill(255, 255, 255, 230);
  textSize(12);
  textAlign(LEFT, CENTER);
  text(`Fisheye camera position  ${textLabel}`, barX + 8, barY + cameraWindow.barH / 2);

  const cx = cameraWindow.x + cameraWindow.w / 2;
  const cy = cameraWindow.y + cameraWindow.h / 2;
  const radius = Math.min(cameraWindow.w, cameraWindow.h) / 2;

  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.clip();
  imageMode(CORNER);
  image(cameraView, cameraWindow.x, cameraWindow.y, cameraWindow.w, cameraWindow.h);
  ctx.restore();

  stroke(63, 255, 220, 180);
  strokeWeight(1.5);
  noFill();
  ellipse(cx, cy, radius * 2, radius * 2);
}

function drawMarker(x, y) {
  const size = 10 / Math.max(0.0001, viewScale);
  stroke(255, 60, 60);
  strokeWeight(2 / Math.max(0.0001, viewScale));
  line(x - size, y, x + size, y);
  line(x, y - size, x, y + size);
}

function renderCameraView() {
  if (!cameraPosition) {
    return;
  }
  cameraView.loadPixels();
  const w = cameraView.width;
  const h = cameraView.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy);
  const maxDistance = Math.max(demWidth, demHeight) * 1.2;
  const baseStep = Math.max(0.75, Math.max(demWidth, demHeight) / 240);
  const offsets = useSupersample
    ? [
        [-0.25, -0.25],
        [0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25],
      ]
    : [[0, 0]];

  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const idx = (py * w + px) * 4;
      let sum = 0;
      let count = 0;
      for (const offset of offsets) {
        const dx = px + offset[0] - cx;
        const dy = py + offset[1] - cy;
        const dist = sqrt(dx * dx + dy * dy);
        if (dist > radius) {
          continue;
        }
        const r = dist / radius;
        const theta = r * HALF_PI;
        const phi = atan2(dy, dx);
        const dirX = sin(theta) * cos(phi);
        const dirY = sin(theta) * sin(phi);
        const dirZ = cos(theta);
        sum += shadeForDirection(dirX, dirY, dirZ, r, maxDistance, baseStep);
        count += 1;
      }
      if (count === 0) {
        cameraView.pixels[idx + 3] = 0;
        continue;
      }
      const shade = sum / count;
      cameraView.pixels[idx] = shade;
      cameraView.pixels[idx + 1] = shade;
      cameraView.pixels[idx + 2] = shade;
      cameraView.pixels[idx + 3] = 255;
    }
  }
  cameraView.updatePixels();
}

function isOverCameraWindow(px, py) {
  const withinX = px >= cameraWindow.x && px <= cameraWindow.x + cameraWindow.w;
  const withinY = py >= cameraWindow.y - cameraWindow.barH && py <= cameraWindow.y + cameraWindow.h;
  return withinX && withinY;
}

function isOverCameraBar(px, py) {
  const withinX = px >= cameraWindow.x && px <= cameraWindow.x + cameraWindow.w;
  const withinY = py >= cameraWindow.y - cameraWindow.barH && py <= cameraWindow.y;
  return withinX && withinY;
}

function positionCameraWindow() {
  cameraWindow.x = 24;
  cameraWindow.y = Math.max(cameraWindow.barH + 12, height / 2 - cameraWindow.h / 2);
  equirectWindow.x = 24;
  equirectWindow.y = height - equirectWindow.h - 24;
  positionEquirectControl();
}

function positionEquirectControl() {
  const control = select("#equiControl");
  if (!control) {
    return;
  }
  const top = Math.max(12, equirectWindow.y - 44);
  control.style("left", `${equirectWindow.x}px`);
  control.style("top", `${top}px`);
}

function drawEquirectWindow() {
  if (!cameraPosition || !demData) {
    return;
  }
  renderEquirectView();
  const pad = equirectWindow.pad;
  const imgX = equirectWindow.x + pad;
  const imgY = equirectWindow.y + pad;
  const imgW = equirectWindow.w - pad * 2;
  const imgH = equirectWindow.h - pad * 2;

  noStroke();
  fill(0, 0, 0, 220);
  rect(equirectWindow.x, equirectWindow.y, equirectWindow.w, equirectWindow.h, 6);
  imageMode(CORNER);
  image(equirectView, imgX, imgY, imgW, imgH);

  fill(255, 255, 255, 230);
  textSize(11);
  textAlign(LEFT, BOTTOM);
  text("(0,0)", imgX - 2, imgY + imgH + 14);
  textAlign(RIGHT, BOTTOM);
  text("(380,0)", imgX + imgW + 2, imgY + imgH + 14);
  textAlign(RIGHT, TOP);
  text("(360,90)", imgX + imgW + 2, imgY - 14);
  textAlign(LEFT, TOP);
  text("(0,90)", imgX - 2, imgY - 14);
}

function renderEquirectView() {
  if (!cameraPosition) {
    return;
  }
  const heightSteps = 181;
  if (!equirectView || equirectView.width !== equirectBins || equirectView.height !== heightSteps) {
    equirectView = createGraphics(equirectBins, heightSteps);
  }
  equirectView.loadPixels();
  const w = equirectView.width;
  const h = equirectView.height;
  const maxDistance = Math.max(demWidth, demHeight) * 1.2;
  const baseStep = Math.max(0.75, Math.max(demWidth, demHeight) / 240);
  const offsets = useSupersample
    ? [
        [-0.25, -0.25],
        [0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25],
      ]
    : [[0, 0]];
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const idx = (py * w + px) * 4;
      let sum = 0;
      let count = 0;
      for (const offset of offsets) {
        const u = (px + offset[0]) / (w - 1);
        const v = (py + offset[1]) / (h - 1);
        if (u < 0 || u > 1 || v < 0 || v > 1) {
          continue;
        }
        const theta = radians((py + offset[1]) * 0.5);
        const phi = u * TWO_PI;
        const dirX = sin(theta) * cos(phi);
        const dirY = sin(theta) * sin(phi);
        const dirZ = cos(theta);
        sum += shadeForDirection(dirX, dirY, dirZ, v, maxDistance, baseStep, false);
        count += 1;
      }
      const shade = count === 0 ? 0 : sum / count;
      equirectView.pixels[idx] = shade;
      equirectView.pixels[idx + 1] = shade;
      equirectView.pixels[idx + 2] = shade;
      equirectView.pixels[idx + 3] = 255;
    }
  }
  equirectView.updatePixels();
}

function shadeForDirection(dirX, dirY, dirZ, falloff, maxDistance, baseStep, useBilinearOverride = useBilinearSampling) {
  let hit = false;
  let shade = 20;
  let hitNormalized = 0;
  let hitNormal = createVector(0, 0, 1);
  let hitX = 0;
  let hitY = 0;
  const step = useAdaptiveStep ? baseStep * (0.5 + 1.5 * falloff) : baseStep;
  let lastMissT = 0;
  for (let t = 0; t < maxDistance; t += step) {
    const sx = cameraPosition.x + dirX * t;
    const sy = cameraPosition.y + dirY * t;
    const sz = cameraPosition.z + dirZ * t;
    const elevation = sampleElevationAtWorld(sx, sy, useBilinearOverride);
    if (elevation === null) {
      break;
    }
    if (sz <= elevation.height) {
      hitNormalized = elevation.normalized;
      hitNormal = sampleNormalAtWorld(sx, sy, useBilinearOverride);
      hitX = sx;
      hitY = sy;
      shade = 40 + elevation.normalized * 180;
      hit = true;
      if (useRefineHit) {
        let lowT = lastMissT;
        let highT = t;
        for (let i = 0; i < 6; i += 1) {
          const midT = (lowT + highT) / 2;
          const mx = cameraPosition.x + dirX * midT;
          const my = cameraPosition.y + dirY * midT;
          const mz = cameraPosition.z + dirZ * midT;
          const mElevation = sampleElevationAtWorld(mx, my, useBilinearOverride);
          if (!mElevation) {
            lowT = midT;
            continue;
          }
          if (mz <= mElevation.height) {
            highT = midT;
            hitNormalized = mElevation.normalized;
            hitNormal = sampleNormalAtWorld(mx, my, useBilinearOverride);
            hitX = mx;
            hitY = my;
          } else {
            lowT = midT;
          }
        }
      }
      break;
    }
    lastMissT = t;
  }
  if (!hit) {
    shade = 8 + 30 * (1 - falloff);
  }
  if (hit) {
    if (fisheyeMode === "shade") {
      const hill = sampleHillshadeAtWorld(hitX, hitY);
      const hillShade = hill === null ? 40 + hitNormalized * 180 : hill;
      const minShade = 255 * 0.25;
      shade = Math.max(minShade, hillShade);
    } else if (fisheyeMode === "white") {
      shade = 235;
    } else if (fisheyeMode === "dem") {
      const light = normalizeVector(createVector(0.2, -0.3, 0.9));
      const lambert = Math.max(0.2, hitNormal.x * light.x + hitNormal.y * light.y + hitNormal.z * light.z);
      shade = 30 + hitNormalized * 180 * lambert;
    }
  }
  return shade;
}

function sampleHillshadeAtWorld(x, y) {
  if (!hillshadeImage) {
    return null;
  }
  const demX = Math.floor(x + demWidth / 2);
  const demY = Math.floor(y + demHeight / 2);
  if (demX < 0 || demX >= demWidth || demY < 0 || demY >= demHeight) {
    return null;
  }
  const idx = (demY * demWidth + demX) * 4;
  return hillshadeImage.pixels[idx] ?? null;
}

function sampleElevationAtWorld(x, y, useBilinearOverride = useBilinearSampling) {
  if (!demData) {
    return null;
  }
  const demPos = worldToDem(x, y);
  if (!demPos) {
    return null;
  }
  const value = useBilinearOverride
    ? sampleValueBilinear(demPos.x, demPos.y)
    : sampleValueNearest(demPos.x, demPos.y);
  const normalized = (value - demMin) / (demMax - demMin || 1);
  const height = normalized * 80 * demScale;
  return { height, normalized };
}

function sampleNormalAtWorld(x, y, useBilinearOverride = useBilinearSampling) {
  const demPos = worldToDem(x, y);
  if (!demPos) {
    return createVector(0, 0, 1);
  }
  const zL = sampleNormalizedAtDem(demPos.x - 1, demPos.y, useBilinearOverride);
  const zR = sampleNormalizedAtDem(demPos.x + 1, demPos.y, useBilinearOverride);
  const zD = sampleNormalizedAtDem(demPos.x, demPos.y - 1, useBilinearOverride);
  const zU = sampleNormalizedAtDem(demPos.x, demPos.y + 1, useBilinearOverride);
  const n = createVector(zL - zR, zD - zU, 1);
  return normalizeVector(n);
}

function worldToDem(x, y) {
  const demX = x + demWidth / 2;
  const demY = y + demHeight / 2;
  if (demX < 0 || demX > demWidth - 1 || demY < 0 || demY > demHeight - 1) {
    return null;
  }
  return { x: demX, y: demY };
}

function sampleValueNearest(x, y) {
  const ix = Math.max(0, Math.min(demWidth - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(demHeight - 1, Math.round(y)));
  return demData[iy * demWidth + ix] ?? 0;
}

function sampleValueBilinear(x, y) {
  const x0 = Math.max(0, Math.min(demWidth - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(demHeight - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(demWidth - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(demHeight - 1, y0 + 1));
  const sx = x - x0;
  const sy = y - y0;
  const v00 = demData[y0 * demWidth + x0] ?? 0;
  const v10 = demData[y0 * demWidth + x1] ?? 0;
  const v01 = demData[y1 * demWidth + x0] ?? 0;
  const v11 = demData[y1 * demWidth + x1] ?? 0;
  const v0 = v00 + (v10 - v00) * sx;
  const v1 = v01 + (v11 - v01) * sx;
  return v0 + (v1 - v0) * sy;
}

function sampleNormalizedAtDem(x, y, useBilinearOverride = useBilinearSampling) {
  const value = useBilinearOverride ? sampleValueBilinear(x, y) : sampleValueNearest(x, y);
  return (value - demMin) / (demMax - demMin || 1);
}

function normalizeVector(vec) {
  const len = Math.max(0.0001, sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z));
  return createVector(vec.x / len, vec.y / len, vec.z / len);
}
