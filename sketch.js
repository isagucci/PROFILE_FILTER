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
    code: "C",
    notes: "Dusty warmth,\nmuted intensity,\nand sun-washed contrast.",
  },
  polar: {
    label: "Polar",
    code: "D",
    notes: "Cool clarity,\nhigh value range,\nand crisp contrast edges.",
  },
};

const state = {
  climateKey: "tropical",
  palette: null, // array of [r,g,b]
  userField: null, // array of [r,g,b]
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

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(min(window.devicePixelRatio || 1, 2));

  document.fonts.ready.then(() => {
    fontsReady = true;
  });

  readUrlParams();
  if (state.palette) {
    sortedPalette = state.palette.slice();
  }

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

  sortedPalette = sortedPalette.slice().sort((a, b) => {
    return getBrightness(a[0], a[1], a[2]) - getBrightness(b[0], b[1], b[2]);
  });

  paletteBrightness = sortedPalette.map((c) => getBrightness(c[0], c[1], c[2]));

  buildBackdrop();
}

function buildBackdrop() {
  backdrop = createGraphics(width, height);
  backdrop.pixelDensity(pixelDensity());
  const g = backdrop;
  g.noStroke();
  for (let y = 0; y < height; y++) {
    let t = height > 1 ? y / (height - 1) : 0;
    let c = lerpColor(
      color(THEME.meshTop[0], THEME.meshTop[1], THEME.meshTop[2]),
      color(THEME.meshBottom[0], THEME.meshBottom[1], THEME.meshBottom[2]),
      t
    );
    g.stroke(c);
    g.line(0, y, width, y);
  }
  g.blendMode(ADD);
  g.noStroke();
  g.fill(255, 187, 120, 38);
  g.circle(width * 0.92, height * 0.06, width * 1.05);
  g.fill(161, 186, 214, 42);
  g.circle(width * 0.02, height * 1.02, height * 0.95);
  g.blendMode(BLEND);
  g.fill(THEME.vignette[0], THEME.vignette[1], THEME.vignette[2], 120);
  g.rect(0, 0, width, height);
}

function draw() {
  if (backdrop) {
    image(backdrop, 0, 0);
  } else {
    background(THEME.vignette[0], THEME.vignette[1], THEME.vignette[2]);
  }

  const isWide = width >= 768;
  const pad = min(max(16, width * 0.045), 28);
  const gap = isWide ? 22 : 14;
  const panelR = 16;
  const innerR = 12;

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
  textSize(11);
  textStyle(NORMAL);
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2], 153);
  text("COLOR PROFILE VIEWER", pad + pad, yCursor + pad);

  textFont(titleFont);
  textStyle(BOLD);
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2]);
  let titleSize = isWide ? 42 : min(34, width * 0.085);
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
  textSize(isWide ? 18 : 16);
  fill(THEME.inkFaint[0], THEME.inkFaint[1], THEME.inkFaint[2], THEME.inkFaint[3]);
  const titleBlockH = titleSize * (isWide ? 1.35 : 2.75);
  const subY = titleY + titleBlockH;
  text("Live camera remapped through your selected palette", pad + pad, subY, contentW - pad * 2, 80);

  yCursor = subY + (isWide ? 52 : 56);

  const bottomReserve = isWide ? 40 : 52;
  const availH = height - yCursor - bottomReserve;

  let frameX, frameY, frameW, frameH;
  let sideX, sideY, sideW, sideH;

  if (isWide) {
    sideW = min(220, max(168, floor(contentW * 0.26)));
    frameW = contentW - sideW - gap;
    frameX = pad;
    frameY = yCursor;
    frameH = min(availH, frameW * 0.75);
    sideX = frameX + frameW + gap;
    sideY = frameY;
    sideH = frameH;
  } else {
    frameX = pad;
    frameY = yCursor;
    frameW = contentW;
    const maxFrameH = min(availH * 0.62, frameW * 0.85);
    frameH = max(200, maxFrameH);
    sideX = pad;
    sideY = frameY + frameH + gap;
    sideW = contentW;
    sideH = max(height - sideY - bottomReserve, 112);
  }

  drawGlassPanel(frameX, frameY, frameW, frameH, panelR);
  fill(THEME.frameInset[0], THEME.frameInset[1], THEME.frameInset[2], THEME.frameInset[3]);
  rect(frameX + 1, frameY + 1, frameW - 2, frameH - 2, panelR - 1);

  const inset = isWide ? 14 : 10;
  const imgX = frameX + inset;
  const imgY = frameY + inset;
  const imgW = frameW - inset * 2;
  const imgH = frameH - inset * 2;
  drawMappedVideo(imgX, imgY, imgW, imgH);

  noFill();
  stroke(THEME.hairline[0], THEME.hairline[1], THEME.hairline[2], THEME.hairline[3]);
  strokeWeight(1);
  rect(imgX, imgY, imgW, imgH, innerR);

  drawGlassPanel(sideX, sideY, sideW, sideH, panelR);

  textFont(labelFont);
  textStyle(NORMAL);
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2]);
  textSize(12);
  textAlign(LEFT, TOP);
  const sidePad = 16;
  let sy = sideY + sidePad;
  text("PALETTE", sideX + sidePad, sy);

  textFont(bodyFont);
  textStyle(NORMAL);

  const swatchGap = isWide ? 10 : 8;
  const swatchR = 8;
  let swatchY = sy + 26;
  const innerSideW = sideW - sidePad * 2;

  if (isWide) {
    for (let i = 0; i < sortedPalette.length; i++) {
      let c = sortedPalette[i];
      noStroke();
      fill(c[0], c[1], c[2]);
      let sh = 26;
      rect(sideX + sidePad, swatchY + i * (sh + swatchGap), innerSideW, sh, swatchR);
    }
    swatchY += sortedPalette.length * (26 + swatchGap) + 8;
  } else {
    const cols = 3;
    const rows = ceil(sortedPalette.length / cols);
    const swW = (innerSideW - swatchGap * (cols - 1)) / cols;
    const swH = min(36, max(28, (sideH - 120) / rows));
    for (let i = 0; i < sortedPalette.length; i++) {
      let col = i % cols;
      let row = floor(i / cols);
      let c = sortedPalette[i];
      noStroke();
      fill(c[0], c[1], c[2]);
      rect(
        sideX + sidePad + col * (swW + swatchGap),
        swatchY + row * (swH + swatchGap),
        swW,
        swH,
        swatchR
      );
    }
    swatchY += rows * (swH + swatchGap) + 12;
  }

  textFont(labelFont);
  textStyle(NORMAL);
  fill(THEME.ink[0], THEME.ink[1], THEME.ink[2]);
  textSize(12);
  text("PROFILE NOTES", sideX + sidePad, swatchY);

  textFont(bodyFont);
  textStyle(NORMAL);
  textSize(isWide ? 12 : 13);
  fill(THEME.inkFaint[0], THEME.inkFaint[1], THEME.inkFaint[2], THEME.inkFaint[3]);
  const notes = def?.notes
    ? def.notes
    : "Profile loaded from URL.\nAdd `climate`, `palette`,\nand `userField` params\nto update the view.";
  text(
    notes,
    sideX + sidePad,
    swatchY + 22,
    innerSideW,
    sideY + sideH - (swatchY + 22) - sidePad
  );

  if (state.userField && state.userField.length) {
    let ufTitleY = sideY + sideH - sidePad - (isWide ? 92 : 108);
    ufTitleY = max(ufTitleY, swatchY + 22 + (isWide ? 58 : 66));

    textFont(labelFont);
    textStyle(NORMAL);
    fill(THEME.ink[0], THEME.ink[1], THEME.ink[2]);
    textSize(12);
    text("USER FIELD", sideX + sidePad, ufTitleY);

    const gridTop = ufTitleY + 22;
    const gridH = sideY + sideH - sidePad - gridTop;
    const cols = isWide ? 6 : 8;
    const gapPx = 6;
    const cell = (innerSideW - gapPx * (cols - 1)) / cols;
    const rows = max(1, floor((gridH + gapPx) / (cell + gapPx)));
    const maxCells = rows * cols;
    const count = min(state.userField.length, maxCells);
    noStroke();
    for (let i = 0; i < count; i++) {
      const c = state.userField[i];
      const col = i % cols;
      const row = floor(i / cols);
      const x = sideX + sidePad + col * (cell + gapPx);
      const y = gridTop + row * (cell + gapPx);
      fill(c[0], c[1], c[2]);
      rect(x, y, cell, cell, 6);
    }
  }

  textFont(bodyFont);
  fill(THEME.inkCaption[0], THEME.inkCaption[1], THEME.inkCaption[2], THEME.inkCaption[3]);
  textSize(11);
  textAlign(LEFT, BOTTOM);
  text("Brightness-based palette interpolation", pad, height - max(16, pad));
}

function drawGlassPanel(x, y, w, h, r) {
  stroke(THEME.glassBorder[0], THEME.glassBorder[1], THEME.glassBorder[2], THEME.glassBorder[3]);
  strokeWeight(1);
  fill(THEME.glassFill[0], THEME.glassFill[1], THEME.glassFill[2], THEME.glassFill[3]);
  rect(x, y, w, h, r);
}

function drawMappedVideo(imgX, imgY, imgW, imgH) {
  const bufferW = max(1, floor(imgW * processScale));
  const bufferH = max(1, floor(imgH * processScale));

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
  image(videoBuffer, imgX, imgY, imgW, imgH);
}

function getBrightness(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function mapByBrightnessBlend(r, g, b) {
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
}
