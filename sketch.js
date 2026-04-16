let capture;
let sortedPalette = [
  [232, 214, 180],
  [198, 156, 109],
  [132, 88, 54],
  [92, 122, 148],
  [38, 52, 76],
];

let paletteBrightness = [];
let processScale = 0.35;

let backdrop;
let videoBuffer;
let fontsReady = false;
let snapBtn;
let snapDock;
let lastVideoRect = null; 

function getProcessScale(isWide) {
  // Mobile looks pixelated at the old scale; bump quality there.
  return isWide ? 0.35 : 0.72;
}

let paletteAll = null; // original palette order (array of [r,g,b])
let selectedPaletteIdx = new Set(); // indices into paletteAll
let paletteHitboxes = []; // {x,y,w,h,idx}

const PROFILE_DEFS = {
  tropical: {
    label: "Tropical",
    code: "A",
    notes: "Higher saturation,\nwarm-biased tones,\nand brighter contrast\nstructures.",
  },
  temperate: {
    label: "Temperate",
    code: "B",
    notes: "Balanced chroma,\nmoderate contrast,\nand adaptable neutrals.",
  },
  arid: {
    label: "Arid",
    code: "B",
    notes: "Dusty warmth,\nmuted intensity,\nand sun-washed contrast.",
  },
  polar: {
    label: "Polar",
    code: "E",
    notes: "Cool clarity,\nhigh value range,\nand crisp contrast edges.",
  },
};

const state = {
  climateKey: "tropical",
  palette: null, 
  userField: null, 
};

const THEME = {
  vignette: [42, 40, 36],
  meshTop: [78, 130, 104],
  meshMid: [93, 125, 106],
  meshWarm: [190, 140, 133],
  meshBottom: [225, 207, 168],
  glassFill: [255, 255, 255, 46],
  glassBorder: [255, 255, 255, 31],
  ink: [255, 255, 255],
  inkFaint: [255, 255, 255, 173],
  inkCaption: [255, 255, 255, 140],
  frameInset: [0, 0, 0, 40],
  hairline: [255, 255, 255, 71],
};

const BACKDROP_THEMES = {
  default: {
    meshTop: [78, 130, 104],
    meshBottom: [225, 207, 168],
    glowA: [255, 187, 120, 38],
    glowB: [161, 186, 214, 42],
    vignette: [42, 40, 36, 120],
  },
  polar: {
    meshTop: [58, 123, 178],
    meshBottom: [225, 207, 168],
    glowA: [204, 193, 172, 46],
    glowB: [58, 123, 178, 44],
    vignette: [28, 44, 60, 118],
  },
  arid: {
    meshTop: [190, 140, 133],
    meshBottom: [236, 208, 200],
    glowA: [202, 244, 244, 40],
    glowB: [190, 140, 133, 46],
    vignette: [58, 46, 44, 116],
  },
};

function getBackdropTheme() {
  const key = String(state.climateKey || "").trim().toLowerCase();
  return BACKDROP_THEMES[key] || BACKDROP_THEMES.default;
}

function parseHexColorToken(token) {
  if (!token) return null;
  let t = String(token).trim();
  if (!t) return null;
  if (t.startsWith("#")) t = t.slice(1);
  if (t.length === 3) {
    t = t
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
  const r = parseInt(t.slice(0, 2), 16);
  const g = parseInt(t.slice(2, 4), 16);
  const b = parseInt(t.slice(4, 6), 16);
  return [r, g, b];
}

function parseColorListParam(value) {
  if (value == null) return null;
  const decoded = decodeURIComponent(String(value));
  const tokens = decoded
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const colors = [];
  for (const token of tokens) {
    const rgb = parseHexColorToken(token);
    if (rgb) colors.push(rgb);
  }
  return colors.length ? colors : null;
}

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);

  const climateRaw = params.get("climate");
  if (climateRaw) {
    const key = String(climateRaw).trim().toLowerCase();
    state.climateKey = PROFILE_DEFS[key] ? key : key;
  }

  const paletteRaw = params.get("palette");
  const paletteColors = parseColorListParam(paletteRaw);
  if (paletteColors && paletteColors.length >= 2) {
    state.palette = paletteColors;
  }

  const userFieldRaw = params.get("userField");
  const userFieldColors = parseColorListParam(userFieldRaw);
  if (userFieldColors && userFieldColors.length) {
    state.userField = userFieldColors;
  }
}

function ensurePaletteState() {
  if (!paletteAll || !paletteAll.length) {
    paletteAll = sortedPalette.slice();
  }
  if (selectedPaletteIdx.size === 0) {
    for (let i = 0; i < paletteAll.length; i++) selectedPaletteIdx.add(i);
  }
}

function recomputeActivePalette() {
  ensurePaletteState();
  const active = [];
  for (let i = 0; i < paletteAll.length; i++) {
    if (selectedPaletteIdx.has(i)) active.push(paletteAll[i]);
  }
  if (active.length === 0 && paletteAll.length) {
    selectedPaletteIdx.add(0);
    active.push(paletteAll[0]);
  }

  sortedPalette = active.slice().sort((a, b) => {
    return getBrightness(a[0], a[1], a[2]) - getBrightness(b[0], b[1], b[2]);
  });
  paletteBrightness = sortedPalette.map((c) => getBrightness(c[0], c[1], c[2]));
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(min(window.devicePixelRatio || 1, 2));

  document.fonts.ready.then(() => {
    fontsReady = true;
  });

  readUrlParams();
  if (state.palette) paletteAll = state.palette.slice();
  ensurePaletteState();
  recomputeActivePalette();

  capture = createCapture(
    {
      video: { facingMode: "environment" },
      audio: false,
    },
    () => {
      console.log("Camera ready");
    }
  );
  capture.hide();
  videoBuffer = createGraphics(1, 1);
  videoBuffer.pixelDensity(1);

  buildBackdrop();

  snapBtn = createButton("");
  snapDock = createDiv("");
  snapDock.addClass("snap-dock");
  snapBtn.parent(snapDock);
  snapBtn.addClass("snap-btn");
  snapBtn.attribute("aria-label", "Snap photo");
  snapBtn.html('<img src="button.png" alt="" />');
  snapBtn.mousePressed(takeSnapshot);
  snapBtn.touchStarted((e) => {
    if (e?.preventDefault) e.preventDefault();
    takeSnapshot();
    return false;
  });
  if (snapDock) snapDock.position(width / 2 - 38, height - 96);
}

function buildBackdrop() {
  const bg = getBackdropTheme();
  backdrop = createGraphics(width, height);
  backdrop.pixelDensity(pixelDensity());
  const g = backdrop;
  g.noStroke();
  for (let y = 0; y < height; y++) {
    let t = height > 1 ? y / (height - 1) : 0;
    let c = lerpColor(
      color(bg.meshTop[0], bg.meshTop[1], bg.meshTop[2]),
      color(bg.meshBottom[0], bg.meshBottom[1], bg.meshBottom[2]),
      t
    );
    g.stroke(c);
    g.line(0, y, width, y);
  }
  g.blendMode(ADD);
  g.noStroke();
  g.fill(bg.glowA[0], bg.glowA[1], bg.glowA[2], bg.glowA[3]);
  g.circle(width * 0.92, height * 0.06, width * 1.05);
  g.fill(bg.glowB[0], bg.glowB[1], bg.glowB[2], bg.glowB[3]);
  g.circle(width * 0.02, height * 1.02, height * 0.95);
  g.blendMode(BLEND);
  g.fill(bg.vignette[0], bg.vignette[1], bg.vignette[2], bg.vignette[3]);
  g.rect(0, 0, width, height);
}

function draw() {
  if (backdrop) {
    image(backdrop, 0, 0);
  } else {
    background(THEME.vignette[0], THEME.vignette[1], THEME.vignette[2]);
  }

  const isWide = width >= 768;
  processScale = getProcessScale(isWide);
  const pad = isWide ? min(max(16, width * 0.045), 28) : 14;
  const gap = isWide ? 22 : 12;
  const paletteToFeedGap = isWide ? gap : 18;
  const panelR = 16;
  const innerR = 12;
  const mobileTextScale = isWide ? 1 : constrain(map(height, 620, 860, 0.86, 1), 0.84, 1);

  const titleFont = fontsReady ? "freight-display-pro" : "Georgia";
  const labelFont = fontsReady ? "neue-haas-grotesk-display-pro" : "Helvetica Neue";
  const bodyFont = fontsReady ? "neue-haas-grotesk-text-pro" : "Helvetica Neue";

  const contentW = width - pad * 2;
  const contentTop = pad;
  let yCursor = contentTop;

  noStroke();
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2]);
  textAlign(LEFT, TOP);

  textFont(bodyFont);
  textSize(isWide ? 11 : 11 * mobileTextScale);
  textStyle(NORMAL);
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2], 153);
  text("COLOR PROFILE VIEWER", pad + pad, yCursor + pad);

  textFont(titleFont);
  textStyle(BOLD);
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2]);
  let titleSize = isWide ? 42 : min(30, width * 0.078) * mobileTextScale;
  textSize(titleSize);
  const titleY = yCursor + pad + 22;
  const def =
    PROFILE_DEFS[state.climateKey] ||
    PROFILE_DEFS[String(state.climateKey || "").trim().toLowerCase()] ||
    null;
  const climateLabel = def
    ? def.label
    : String(state.climateKey || "Tropical")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
  const climateCode = def?.code ? ` (${def.code})` : "";
  text(`Your Profile: ${climateLabel}${climateCode}`, pad + pad, titleY, contentW - pad * 2);

  textFont(bodyFont);
  textStyle(NORMAL);
  textSize(isWide ? 18 : 16 * mobileTextScale);
  fill(THEME.inkFaint[0], THEME.inkFaint[1], THEME.inkFaint[2], THEME.inkFaint[3]);
  const titleBlockH = titleSize * (isWide ? 1.35 : 1.65);
  const subY = titleY + titleBlockH;
  yCursor = subY + (isWide ? 30 : 4);

  const bottomReserve = isWide ? 64 : 18;

  // Palette panel now lives above the camera, directly under the title.
  const paletteX = pad;
  const paletteY = yCursor;
  const paletteW = contentW;
  const paletteH = isWide ? 106 : 84;

  const frameX = pad;
  const frameY = paletteY + paletteH + paletteToFeedGap;
  const frameW = contentW;
  const availH = height - frameY - bottomReserve;
  let frameH = isWide ? min(availH, frameW * 0.72) : max(170, availH);
  frameH = max(150, frameH);

  drawGlassPanel(frameX, frameY, frameW, frameH, panelR);
  fill(THEME.frameInset[0], THEME.frameInset[1], THEME.frameInset[2], THEME.frameInset[3]);
  rect(frameX + 1, frameY + 1, frameW - 2, frameH - 2, panelR - 1);

  const insetX = isWide ? 14 : 0;
  const insetY = isWide ? 14 : 8;
  const imgX = frameX + insetX;
  const imgY = frameY + insetY;
  const imgW = frameW - insetX * 2;
  const imgH = frameH - insetY * 2;
  lastVideoRect = { x: imgX, y: imgY, w: imgW, h: imgH };
  drawMappedVideo(imgX, imgY, imgW, imgH);

  noFill();
  stroke(THEME.hairline[0], THEME.hairline[1], THEME.hairline[2], THEME.hairline[3]);
  strokeWeight(1);
  rect(imgX, imgY, imgW, imgH, innerR);

  textFont(labelFont);
  textStyle(NORMAL);
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2]);
  textSize(isWide ? 12 : 12.5 * mobileTextScale);
  textAlign(LEFT, TOP);
  const sidePad = isWide ? 12 : 6;
  let sy = paletteY + (isWide ? 10 : 6);
  text("Palette", paletteX + sidePad, sy);

  const innerSideW = paletteW - sidePad * 2;
  textFont(bodyFont);
  textStyle(NORMAL);
  textSize(isWide ? 11 : 11 * mobileTextScale);
  fill(THEME.inkFaint[0], THEME.inkFaint[1], THEME.inkFaint[2], THEME.inkFaint[3]);
  text("Tap to enable/disable colors.", paletteX + sidePad, sy + 20, innerSideW, 20);

  const swatchGap = isWide ? 8 : 7;
  const swatchR = 8;
  let swatchY = sy + 42;
  paletteHitboxes = [];
  const cols = isWide ? 6 : 3;
  const rows = isWide ? ceil(paletteAll.length / cols) : 2;
  const visibleCount = isWide ? paletteAll.length : min(paletteAll.length, 6);
  const swW = (innerSideW - swatchGap * (cols - 1)) / cols;
  const swHBase = min(isWide ? 32 : 24, max(18, (paletteH - 50 - swatchGap * (rows - 1)) / rows));
  for (let i = 0; i < visibleCount; i++) {
    let col = i % cols;
    let row = floor(i / cols);
    const c = paletteAll[i];
    const selected = selectedPaletteIdx.has(i);
    if (selected) {
      stroke(255, 255, 255, 84);
      strokeWeight(1);
      fill(c[0], c[1], c[2], 255);
    } else {
      stroke(255, 255, 255, 26);
      strokeWeight(1);
      fill(c[0], c[1], c[2], 70);
    }
    const cellX = paletteX + sidePad + col * (swW + swatchGap);
    const y = swatchY + row * (swHBase + swatchGap);
    const x = cellX;
    rect(x, y, swW, swHBase, 4);
    paletteHitboxes.push({ x, y, w: swW, h: swHBase, idx: i });
  }
  swatchY += rows * (swHBase + swatchGap) + 4;

  // Shutter control overlays the filter near bottom-center.
  if (snapDock) {
    const dockW = imgW;
    const dockH = isWide ? 62 : 56;
    const dockX = imgX;
    const dockY = imgY + imgH - dockH;
    snapDock.style("width", `${dockW}px`);
    snapDock.style("height", `${dockH}px`);
    snapDock.position(dockX, dockY);
  }

  textFont(bodyFont);
  fill(THEME.inkCaption[0], THEME.inkCaption[1], THEME.inkCaption[2], THEME.inkCaption[3]);
  textSize(11);
  textAlign(LEFT, BOTTOM);
}

function drawGlassPanel(x, y, w, h, r) {
  stroke(THEME.glassBorder[0], THEME.glassBorder[1], THEME.glassBorder[2], THEME.glassBorder[3]);
  strokeWeight(1);
  fill(THEME.glassFill[0], THEME.glassFill[1], THEME.glassFill[2], THEME.glassFill[3]);
  rect(x, y, w, h, r);
}

function drawMappedVideo(imgX, imgY, imgW, imgH) {
  // Cap processing size for performance on big screens.
  const isWide = width >= 768;
  const maxProcessDim = isWide ? 900 : 1300;
  const captureAspect =
    capture && capture.width > 0 && capture.height > 0
      ? capture.width / capture.height
      : imgW / max(1, imgH);
  const targetPixels = max(1, floor(imgW * processScale)) * max(1, floor(imgH * processScale));
  let bufferW = max(1, floor(sqrt(targetPixels * captureAspect)));
  let bufferH = max(1, floor(bufferW / captureAspect));
  if (bufferW > maxProcessDim) {
    bufferW = maxProcessDim;
    bufferH = max(1, floor(bufferW / captureAspect));
  }
  if (bufferH > maxProcessDim) {
    bufferH = maxProcessDim;
    bufferW = max(1, floor(bufferH * captureAspect));
  }

  if (videoBuffer.width !== bufferW || videoBuffer.height !== bufferH) {
    videoBuffer.resizeCanvas(bufferW, bufferH);
  }

  capture.loadPixels();
  if (capture.pixels.length === 0) return;

  videoBuffer.loadPixels();

  for (let y = 0; y < bufferH; y++) {
    const sy = floor(map(y, 0, bufferH, 0, capture.height - 1));
    for (let x = 0; x < bufferW; x++) {
      const sx = floor(map(x, 0, bufferW, 0, capture.width - 1));
      const srcIndex = 4 * (sy * capture.width + sx);
      const dstIndex = 4 * (y * bufferW + x);

      const r = capture.pixels[srcIndex];
      const g = capture.pixels[srcIndex + 1];
      const b = capture.pixels[srcIndex + 2];
      const mapped = mapByBrightnessBlend(r, g, b);

      videoBuffer.pixels[dstIndex] = mapped[0];
      videoBuffer.pixels[dstIndex + 1] = mapped[1];
      videoBuffer.pixels[dstIndex + 2] = mapped[2];
      videoBuffer.pixels[dstIndex + 3] = 255;
    }
  }

  videoBuffer.updatePixels();

  // Fill the frame exactly (can slightly distort aspect).
  image(videoBuffer, imgX, imgY, imgW, imgH);
}

function getBrightness(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function mapByBrightnessBlend(r, g, b) {
  if (!sortedPalette || sortedPalette.length === 0) return [r, g, b];
  if (sortedPalette.length === 1) return sortedPalette[0];
  let bright = getBrightness(r, g, b);

  if (bright <= paletteBrightness[0]) return sortedPalette[0];
  if (bright >= paletteBrightness[paletteBrightness.length - 1]) {
    return sortedPalette[sortedPalette.length - 1];
  }

  for (let i = 0; i < sortedPalette.length - 1; i++) {
    let b1 = paletteBrightness[i];
    let b2 = paletteBrightness[i + 1];

    if (bright >= b1 && bright <= b2) {
      let t = (bright - b1) / (b2 - b1);

      return [
        lerp(sortedPalette[i][0], sortedPalette[i + 1][0], t),
        lerp(sortedPalette[i][1], sortedPalette[i + 1][1], t),
        lerp(sortedPalette[i][2], sortedPalette[i + 1][2], t),
      ];
    }
  }

  return sortedPalette[0];
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildBackdrop();
  if (snapDock) {
    snapDock.position(width / 2 - 38, height - 96);
  }
}

async function takeSnapshot() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = lastVideoRect
    ? get(lastVideoRect.x, lastVideoRect.y, lastVideoRect.w, lastVideoRect.h)
    : get();

  try {
    const dataUrl = target.canvas.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `profile-filter-feed-${stamp}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Profile Filter Snapshot",
      });
      return;
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (_err) {
    const dataUrl = target.canvas.toDataURL("image/png");
    window.open(dataUrl, "_blank");
  }
}

function handlePaletteHit(px, py) {
  if (!paletteHitboxes || paletteHitboxes.length === 0) return false;
  for (let i = paletteHitboxes.length - 1; i >= 0; i--) {
    const h = paletteHitboxes[i];
    if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) {
      if (selectedPaletteIdx.has(h.idx)) {
        if (selectedPaletteIdx.size > 1) selectedPaletteIdx.delete(h.idx);
      } else {
        selectedPaletteIdx.add(h.idx);
      }
      recomputeActivePalette();
      return true;
    }
  }
  return false;
}

function mousePressed() {
  handlePaletteHit(mouseX, mouseY);
}

function touchStarted() {
  return handlePaletteHit(touches?.[0]?.x ?? mouseX, touches?.[0]?.y ?? mouseY);
}
