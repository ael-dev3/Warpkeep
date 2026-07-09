import * as THREE from 'three';

export type ConcreteTextureSet = {
  color: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
};

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1_664_525, state) + 1_013_904_223;
    return (state >>> 0) / 4_294_967_296;
  };
}

function makeCanvas(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable for procedural concrete.');
  }
  return { canvas, context };
}

function paintCracks(
  colorContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  size: number,
  random: () => number
) {
  const crackCount = 28;

  for (let crackIndex = 0; crackIndex < crackCount; crackIndex += 1) {
    const points: Array<[number, number]> = [];
    let x = random() * size;
    let y = random() * size;
    const direction = random() * Math.PI * 2;
    const segments = 3 + Math.floor(random() * 6);
    points.push([x, y]);

    for (let segment = 0; segment < segments; segment += 1) {
      const step = size * (0.018 + random() * 0.045);
      const angle = direction + (random() - 0.5) * 1.15;
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      points.push([x, y]);
    }

    const trace = (context: CanvasRenderingContext2D) => {
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      points.slice(1).forEach(([pointX, pointY]) => context.lineTo(pointX, pointY));
      context.stroke();
    };

    colorContext.lineCap = 'square';
    colorContext.lineJoin = 'miter';
    colorContext.strokeStyle = `rgba(39,35,38,${0.22 + random() * 0.24})`;
    colorContext.lineWidth = 0.7 + random() * 1.35;
    trace(colorContext);
    colorContext.translate(0.8, 0.6);
    colorContext.strokeStyle = 'rgba(255,250,235,0.12)';
    colorContext.lineWidth = 0.5;
    trace(colorContext);
    colorContext.setTransform(1, 0, 0, 1, 0, 0);

    bumpContext.strokeStyle = 'rgba(28,28,28,0.76)';
    bumpContext.lineWidth = 1.1;
    trace(bumpContext);
  }
}

export function createConcreteTextures(size = 768): ConcreteTextureSet {
  const safeSize = Math.max(256, Math.floor(size));
  const random = createRandom(0x42525554);
  const { canvas: colorCanvas, context: colorContext } = makeCanvas(safeSize);
  const { canvas: bumpCanvas, context: bumpContext } = makeCanvas(safeSize);
  const { canvas: roughnessCanvas, context: roughnessContext } = makeCanvas(safeSize);
  const colorImage = colorContext.createImageData(safeSize, safeSize);
  const bumpImage = bumpContext.createImageData(safeSize, safeSize);
  const roughnessImage = roughnessContext.createImageData(safeSize, safeSize);

  for (let y = 0; y < safeSize; y += 1) {
    for (let x = 0; x < safeSize; x += 1) {
      const pixel = (y * safeSize + x) * 4;
      const grain = random() - 0.5;
      const broad =
        Math.sin(x * 0.018 + Math.sin(y * 0.009) * 1.8) * 0.52 +
        Math.sin(y * 0.024 + x * 0.006) * 0.31 +
        Math.sin((x + y) * 0.008) * 0.17;
      const pores = random() > 0.985 ? -28 - random() * 24 : 0;
      const value = Math.max(105, Math.min(232, 190 + broad * 12 + grain * 15 + pores));

      colorImage.data[pixel] = value + 5;
      colorImage.data[pixel + 1] = value + 3;
      colorImage.data[pixel + 2] = value;
      colorImage.data[pixel + 3] = 255;

      const bump = Math.max(20, Math.min(240, 145 + broad * 23 + grain * 42 + pores * 1.2));
      bumpImage.data[pixel] = bump;
      bumpImage.data[pixel + 1] = bump;
      bumpImage.data[pixel + 2] = bump;
      bumpImage.data[pixel + 3] = 255;

      const exposedAggregate = random() > 0.972;
      const roughness = Math.max(138, Math.min(250, 224 - broad * 5 + grain * 12 - (exposedAggregate ? 58 : 0)));
      roughnessImage.data[pixel] = roughness;
      roughnessImage.data[pixel + 1] = roughness;
      roughnessImage.data[pixel + 2] = roughness;
      roughnessImage.data[pixel + 3] = 255;
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  for (let stainIndex = 0; stainIndex < 18; stainIndex += 1) {
    const x = random() * safeSize;
    const y = random() * safeSize;
    const radius = safeSize * (0.035 + random() * 0.13);
    const stain = colorContext.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, `rgba(39,34,42,${0.035 + random() * 0.07})`);
    stain.addColorStop(1, 'rgba(39,34,42,0)');
    colorContext.fillStyle = stain;
    colorContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  colorContext.strokeStyle = 'rgba(58,53,61,0.2)';
  colorContext.lineWidth = 1;
  [0.19, 0.47, 0.78].forEach((ratio, index) => {
    colorContext.beginPath();
    colorContext.moveTo(0, safeSize * ratio);
    colorContext.lineTo(safeSize, safeSize * (ratio + (index - 1) * 0.006));
    colorContext.stroke();
  });

  paintCracks(colorContext, bumpContext, safeSize, random);

  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = THREE.RepeatWrapping;
  color.wrapT = THREE.RepeatWrapping;
  color.repeat.set(1.35, 1.15);
  color.anisotropy = 4;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.copy(color.repeat);
  bump.anisotropy = 4;

  const roughness = new THREE.CanvasTexture(roughnessCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.copy(color.repeat);
  roughness.anisotropy = 4;

  return { color, bump, roughness };
}
