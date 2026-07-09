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

function paintHairlineSeams(
  colorContext: CanvasRenderingContext2D,
  bumpContext: CanvasRenderingContext2D,
  size: number,
  random: () => number
) {
  const hairlineCount = 4;

  for (let hairlineIndex = 0; hairlineIndex < hairlineCount; hairlineIndex += 1) {
    const points: Array<[number, number]> = [];
    let x = random() * size;
    let y = random() * size;
    const direction = random() * Math.PI * 2;
    const segments = 2 + Math.floor(random() * 3);
    points.push([x, y]);

    for (let segment = 0; segment < segments; segment += 1) {
      const step = size * (0.012 + random() * 0.028);
      const angle = direction + (random() - 0.5) * 0.55;
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

    colorContext.lineCap = 'round';
    colorContext.lineJoin = 'round';
    colorContext.strokeStyle = `rgba(64,60,61,${0.04 + random() * 0.03})`;
    colorContext.lineWidth = 0.35 + random() * 0.3;
    trace(colorContext);

    bumpContext.lineCap = 'round';
    bumpContext.lineJoin = 'round';
    bumpContext.strokeStyle = 'rgba(86,86,86,0.26)';
    bumpContext.lineWidth = 0.55;
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
      const grain = (random() + random() + random()) / 3 - 0.5;
      const broad =
        Math.sin(x * 0.006 + Math.sin(y * 0.0035) * 0.7) * 0.46 +
        Math.sin(y * 0.008 + x * 0.0018) * 0.34 +
        Math.sin((x + y) * 0.0028) * 0.2;
      const pore = random() > 0.9975 ? -4 - random() * 7 : 0;
      const value = Math.max(226, Math.min(250, 244 + broad * 4 + grain * 4 + pore));

      colorImage.data[pixel] = value;
      colorImage.data[pixel + 1] = value - 1;
      colorImage.data[pixel + 2] = value - 3;
      colorImage.data[pixel + 3] = 255;

      const bump = Math.max(108, Math.min(150, 132 + broad * 7 + grain * 8 + pore * 1.2));
      bumpImage.data[pixel] = bump;
      bumpImage.data[pixel + 1] = bump;
      bumpImage.data[pixel + 2] = bump;
      bumpImage.data[pixel + 3] = 255;

      const roughness = Math.max(238, Math.min(253, 247 + broad * 2 + grain * 3 - pore * 0.35));
      roughnessImage.data[pixel] = roughness;
      roughnessImage.data[pixel + 1] = roughness;
      roughnessImage.data[pixel + 2] = roughness;
      roughnessImage.data[pixel + 3] = 255;
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  for (let stainIndex = 0; stainIndex < 4; stainIndex += 1) {
    const x = random() * safeSize;
    const y = random() * safeSize;
    const radius = safeSize * (0.055 + random() * 0.095);
    const stain = colorContext.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, `rgba(67,61,70,${0.008 + random() * 0.01})`);
    stain.addColorStop(1, 'rgba(67,61,70,0)');
    colorContext.fillStyle = stain;
    colorContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  paintHairlineSeams(colorContext, bumpContext, safeSize, random);

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
