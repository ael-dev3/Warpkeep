import * as THREE from 'three';
import { buildKeep04Model, gableGeometry, KEEP04_LIFE_PALETTE as C, type Keep04Kit } from './keep04ModelKit';
import { keep04Random } from './keep04Random';

// Original code-authored Verdant Citadel models. They follow the keep's pale
// masonry, dark timber, teal roof and restrained violet language, and are kept
// deliberately low-poly so a whole settlement costs a handful of draw calls.

export type CottageStyle = 'teal' | 'thatch' | 'slate' | 'rust';

/** A cottage centred on its footprint, door facing local +z. */
export function addCottage(kit: Keep04Kit, seed: number, style?: CottageStyle) {
  const random = keep04Random(seed);
  const w = random.range(4.2, 6.2); const d = random.range(3.6, 4.6); const wallH = random.range(2.3, 2.9);
  const roof = style ?? random.pick(['teal', 'teal', 'thatch', 'slate', 'rust'] as const);
  const roofColor = { teal: C.roofTeal, thatch: C.roofThatch, slate: C.roofSlate, rust: C.roofRust }[roof];
  const wall = random.next() < .6 ? C.plaster : C.masonry;
  kit.box(w + .3, .35, d + .3, C.stone, 0, .175, 0);
  kit.box(w, wallH, d, wall, 0, .35 + wallH / 2, 0);
  // Timber framing on the long faces.
  for (const z of [d / 2 + .03, -d / 2 - .03]) {
    for (const x of [-w / 2 + .12, 0, w / 2 - .12]) kit.box(.18, wallH, .08, C.timber, x, .35 + wallH / 2, z);
    kit.box(w, .16, .08, C.timber, 0, .35 + wallH * .55, z);
  }
  kit.gable(w + .7, random.range(1.6, 2.2), d + .9, roofColor, 0, .35 + wallH, 0);
  kit.box(.9, 1.5, .1, C.timberDark, random.range(-w / 4, w / 4), 1.1, d / 2 + .05);
  for (const x of [-w / 3, w / 3]) kit.box(.6, .55, .08, C.window, x, .35 + wallH * .62, d / 2 + .06);
  const chimneyX = random.range(-w / 3, w / 3);
  kit.box(.6, 1.9, .6, C.stone, chimneyX, .35 + wallH + 1.2, -d / 5);
  return Object.freeze({ chimney: [chimneyX, .35 + wallH + 2.2, -d / 5] as const, width: w, depth: d });
}

export function addBarn(kit: Keep04Kit) {
  kit.box(8.4, .4, 5.6, C.stone, 0, .2, 0);
  kit.box(8, 3.6, 5.2, C.roofRust, 0, 2.2, 0);
  for (const x of [-3.9, -1.3, 1.3, 3.9]) kit.box(.22, 3.6, 5.3, C.timberDark, x, 2.2, 0);
  kit.gable(8.8, 2.8, 6.2, C.roofSlate, 0, 4, 0);
  kit.box(2.4, 2.6, .12, C.timberDark, 0, 1.7, 2.66);
  kit.box(2.6, .14, .14, C.plaster, 0, 1.7, 2.74, 0);
}

export function addHaystack(kit: Keep04Kit, x: number, y: number, z: number, scale = 1) {
  kit.cylinder(1.1 * scale, 1.25 * scale, 1.2 * scale, 7, C.hay, x, y + .6 * scale, z);
  kit.cone(1.15 * scale, 1.1 * scale, 7, C.wheatDark, x, y + 1.75 * scale, z);
}

/** A round tower with crenellations and a teal conical roof; banner pole on top. */
export function addTower(kit: Keep04Kit, height: number, radius: number) {
  kit.cylinder(radius * 1.12, radius * 1.18, .8, 10, C.masonryShade, 0, .4, 0);
  kit.cylinder(radius, radius * 1.08, height, 10, C.masonry, 0, .8 + height / 2, 0);
  kit.cylinder(radius * 1.16, radius * 1.16, .5, 10, C.masonryShade, 0, .8 + height + .25, 0);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    kit.box(.55, .55, .55, C.masonry, Math.sin(a) * radius * 1.05, .8 + height + .75, Math.cos(a) * radius * 1.05, a);
  }
  kit.cone(radius * 1.25, radius * 1.9, 10, C.roofTeal, 0, .8 + height + .5 + radius * .95, 0);
  for (let i = 0; i < 3; i++) kit.box(.42, .9, .1, C.window, Math.sin(i * 2.1) * radius, .8 + height * (.35 + i * .2), Math.cos(i * 2.1) * radius, i * 2.1);
  const top = .8 + height + .5 + radius * 1.9;
  kit.box(.12, 3, .12, C.timber, 0, top + 1.2, 0);
  return top + 2.5;
}

/**
 * Squat square gate turret with a pyramid roof. It stands on the camera side of
 * the keep, so it stays low enough never to hide buildings near the gate.
 */
export function addGateTower(kit: Keep04Kit) {
  kit.box(4.2, .5, 4.2, C.masonryShade, 0, .25, 0);
  kit.box(3.8, 4.4, 3.8, C.masonry, 0, 2.7, 0);
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5], [0, 1.5], [0, -1.5], [1.5, 0], [-1.5, 0]] as const) kit.box(.55, .5, .55, C.masonry, x, 5.15, z);
  kit.cone(3, 2.2, 4, C.roofTeal, 0, 6.3, 0, Math.PI / 4);
  kit.box(.55, .9, .1, C.window, 0, 3.4, 1.93);
  kit.box(.1, 2.4, .1, C.timber, 0, 8.4, 0);
  return 9.1;
}

/** Straight wall with merlons, centred on its length along local X. */
export function addWall(kit: Keep04Kit, length: number, height: number) {
  kit.box(length, .5, 1.9, C.masonryShade, 0, .25, 0);
  kit.box(length, height, 1.4, C.masonry, 0, .5 + height / 2, 0);
  const merlons = Math.max(1, Math.floor(length / 1.7));
  for (let i = 0; i < merlons; i++) kit.box(.75, .65, 1.45, C.masonry, -length / 2 + (i + .5) * length / merlons, .5 + height + .32, 0);
}

export function addWindmillBody(kit: Keep04Kit) {
  kit.cylinder(2.3, 2.9, .6, 8, C.stone, 0, .3, 0);
  kit.cylinder(1.6, 2.4, 7.2, 8, C.plaster, 0, .6 + 3.6, 0);
  kit.cone(2.25, 2.4, 8, C.roofTeal, 0, 7.8 + 1.2, 0);
  kit.box(.9, 1.6, .1, C.timberDark, 0, 1.4, 2.42);
  kit.box(.5, .6, .1, C.window, 0, 4.6, 2.05);
  kit.box(.5, .5, 1.6, C.timber, 0, 7.4, 1.8);
  return [0, 7.4, 2.7] as const;
}

/** Four sails around the local Z axis, centred on the hub. */
export function windmillSailsGeometry() {
  return buildKeep04Model(kit => {
    kit.add(new THREE.CylinderGeometry(.35, .35, .5, 6), C.timberDark, [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      kit.add(new THREE.BoxGeometry(.22, 6.4, .12), C.timber, [Math.sin(a) * 3.2, Math.cos(a) * 3.2, 0], [0, 0, -a]);
      kit.add(new THREE.BoxGeometry(1.25, 4.6, .05), C.plaster, [Math.sin(a) * 3.8 + Math.cos(a) * .7, Math.cos(a) * 3.8 - Math.sin(a) * .7, .05], [0, 0, -a]);
    }
  });
}

export function addBridge(kit: Keep04Kit, length: number, width: number) {
  kit.box(length, .6, width, C.masonry, 0, 1.6, 0);
  for (const z of [width / 2 - .25, -width / 2 + .25]) kit.box(length, .8, .5, C.masonryShade, 0, 2.3, z);
  for (const x of [-length / 2 + 1.2, length / 2 - 1.2]) kit.box(1.4, 2.2, width * .9, C.stone, x, .5, 0);
  kit.box(length * .45, .9, width * .92, C.masonryShade, 0, 1, 0);
}

export function addFence(kit: Keep04Kit, points: readonly (readonly [number, number, number])[], closed = false) {
  const total = closed ? points.length : points.length - 1;
  for (let i = 0; i < total; i++) {
    const [x0, y0, z0] = points[i]; const [x1, y1, z1] = points[(i + 1) % points.length];
    const length = Math.hypot(x1 - x0, z1 - z0); const yaw = Math.atan2(x1 - x0, z1 - z0);
    const posts = Math.max(1, Math.round(length / 2.4));
    for (let p = 0; p < posts; p++) {
      const t = p / posts; kit.box(.18, 1.1, .18, C.timber, x0 + (x1 - x0) * t, (y0 + (y1 - y0) * t) + .55, z0 + (z1 - z0) * t);
    }
    for (const h of [.45, .9]) kit.add(new THREE.BoxGeometry(.08, .1, length), C.timber,
      [(x0 + x1) / 2, (y0 + y1) / 2 + h, (z0 + z1) / 2], [0, yaw, 0]);
  }
}

export function addLampPost(kit: Keep04Kit, x: number, z: number) {
  kit.box(.18, 3, .18, C.timberDark, x, 1.5, z);
  kit.box(.6, .6, .6, C.window, x, 3.25, z);
  kit.cone(.5, .45, 4, C.timberDark, x, 3.75, z, Math.PI / 4);
}

export function addBench(kit: Keep04Kit, x: number, z: number, ry: number) {
  kit.push([x, 0, z], ry);
  kit.box(1.9, .12, .55, C.timber, 0, .55, 0);
  kit.box(1.9, .45, .1, C.timber, 0, .85, -.25);
  for (const bx of [-.8, .8]) kit.box(.12, .55, .45, C.timberDark, bx, .27, 0);
  kit.pop();
}

export function addPlanter(kit: Keep04Kit, x: number, z: number, seed: number) {
  const random = keep04Random(seed);
  kit.box(1.5, .55, 1.5, C.masonryShade, x, .27, z);
  kit.box(1.3, .08, 1.3, C.soilDark, x, .58, z);
  for (let i = 0; i < 6; i++) kit.blob(.24, random.pick([C.warpGlow, C.gold, '#e98d8d', C.leafLight, '#f2efe6']),
    x + random.range(-.45, .45), .72, z + random.range(-.45, .45), [1, .8, 1]);
}

/** The civic obelisk raised on the existing warp seal; the crystal is separate and animated. */
export function addObelisk(kit: Keep04Kit) {
  kit.cylinder(2.05, 2.15, .32, 12, C.masonryShade, 0, .16, 0);
  kit.cylinder(1.7, 1.7, .1, 12, C.water, 0, .3, 0);
  kit.cylinder(.55, .75, .5, 4, C.masonry, 0, .55, 0);
  kit.cylinder(.32, .5, 3.4, 4, C.masonry, 0, .8 + 1.7, 0);
  kit.cone(.36, .5, 4, C.gold, 0, 4.75, 0);
  return 6.1;
}

export function warpCrystalGeometry() {
  return buildKeep04Model(kit => {
    kit.add(new THREE.OctahedronGeometry(.62, 0), C.warpGlow, [0, 0, 0], [0, 0, 0], [1, 1.7, 1]);
  });
}

// ---- Vegetation and terrain props (instanced) ----

export function coniferGeometry() {
  return buildKeep04Model(kit => {
    kit.cylinder(.22, .34, 1.6, 5, C.trunk, 0, .8, 0);
    kit.cone(2.1, 3.1, 7, C.conifer, 0, 2.6, 0);
    kit.cone(1.65, 2.7, 7, C.conifer, 0, 4.1, 0);
    kit.cone(1.1, 2.3, 7, C.coniferTip, 0, 5.5, 0);
  });
}

export function broadleafGeometry() {
  return buildKeep04Model(kit => {
    kit.cylinder(.28, .4, 2.4, 5, C.trunk, 0, 1.2, 0);
    kit.blob(2.2, C.leaf, 0, 3.7, 0, [1, .85, 1]);
    kit.blob(1.5, C.leafLight, .9, 4.4, .4, [1, .85, 1]);
    kit.blob(1.4, C.leaf, -.8, 3.4, -.6, [1, .8, 1]);
  });
}

export function birchGeometry() {
  return buildKeep04Model(kit => {
    kit.cylinder(.14, .2, 4.2, 5, C.birchBark, 0, 2.1, 0);
    kit.box(.3, .12, .3, C.timberDark, 0, 1.4, 0);
    kit.box(.3, .1, .3, C.timberDark, 0, 2.6, 0);
    kit.blob(1.35, C.birchLeaf, 0, 4.5, 0, [1, 1.25, 1]);
  });
}

export function poplarGeometry() {
  return buildKeep04Model(kit => {
    kit.cylinder(.16, .24, 1.2, 5, C.trunk, 0, .6, 0);
    kit.blob(1.05, C.poplar, 0, 3.8, 0, [1, 3, 1]);
  });
}

export function bushGeometry() {
  return buildKeep04Model(kit => {
    kit.blob(1, C.bush, 0, .55, 0, [1.25, .75, 1.1]);
    kit.blob(.7, C.leafLight, .55, .75, .2, [1, .8, 1]);
  });
}

export function rockGeometry() {
  return buildKeep04Model(kit => {
    kit.add(new THREE.DodecahedronGeometry(1, 0), C.rock, [0, .35, 0], [.3, .7, .1], [1.3, .75, 1]);
    kit.add(new THREE.DodecahedronGeometry(.6, 0), C.stone, [.9, .2, .5], [.5, .2, .9], [1, .7, 1]);
  });
}

export function cropRowGeometry() {
  // One row tuft; rows are instanced and tinted by field.
  return buildKeep04Model(kit => { kit.add(new THREE.BoxGeometry(1, .55, .55), '#ffffff', [0, .27, 0]); });
}

// ---- Living actors (instanced) ----

/** Villager body (legs, tunic, arms); tinted per instance. Origin at the feet. */
export function villagerBodyGeometry() {
  return buildKeep04Model(kit => {
    for (const x of [-.17, .17]) kit.box(.26, .9, .3, C.legs, x, .45, 0);
    kit.cylinder(.34, .46, 1.05, 6, C.cloth, 0, 1.4, 0);
    kit.cylinder(.48, .48, .14, 6, C.timber, 0, 1.05, 0);
    for (const x of [-.47, .47]) kit.box(.18, .8, .2, C.cloth, x, 1.45, 0);
  });
}

/** Villager head and hair; separate so skin is not tinted with clothing. */
export function villagerHeadGeometry() {
  return buildKeep04Model(kit => {
    kit.blob(.3, C.skin, 0, 2.18, 0, [1, 1.08, 1]);
    kit.cone(.33, .32, 6, C.hair, 0, 2.47, -.03);
  });
}

/** A Worker's handcart with a cargo bed; the cargo crate is a separate tinted batch. */
export function handcartGeometry() {
  return buildKeep04Model(kit => {
    kit.box(1.4, .25, 1.9, C.timber, 0, .75, 0);
    for (const x of [-.75, .75]) kit.add(new THREE.CylinderGeometry(.45, .45, .12, 8), C.timberDark, [x, .45, -.2], [0, 0, Math.PI / 2]);
    for (const x of [-.45, .45]) kit.box(.08, .08, 1.2, C.timber, x, .9, 1.4);
  });
}

export function cargoGeometry() {
  return buildKeep04Model(kit => { kit.box(1.05, .8, 1.3, '#ffffff', 0, 1.27, 0); });
}

export function sheepGeometry() {
  return buildKeep04Model(kit => {
    for (const [x, z] of [[-.3, .45], [.3, .45], [-.3, -.45], [.3, -.45]] as const) kit.box(.16, .55, .16, C.hide, x, .28, z);
    kit.blob(.62, C.wool, 0, .9, 0, [1, .85, 1.35]);
    kit.box(.36, .38, .44, C.hide, 0, 1.05, .9);
  });
}

export function horseCartGeometry() {
  return buildKeep04Model(kit => {
    // Horse
    for (const [x, z] of [[-.3, 2.4], [.3, 2.4], [-.3, 1.4], [.3, 1.4]] as const) kit.box(.2, 1.1, .2, '#6b4a33', x, .55, z);
    kit.box(.8, .8, 1.6, '#7a553a', 0, 1.45, 1.9);
    kit.box(.45, .9, .5, '#7a553a', 0, 2, 2.75);
    kit.box(.36, .36, .7, '#6b4a33', 0, 2.25, 3.1);
    // Cart
    kit.box(1.9, .35, 2.6, C.timber, 0, 1.1, -.9);
    kit.box(1.9, .5, .1, C.timber, 0, 1.5, -2.15);
    for (const x of [-1, 1]) kit.add(new THREE.CylinderGeometry(.55, .55, .14, 8), C.timberDark, [x, .55, -.9], [0, 0, Math.PI / 2]);
    kit.box(1.5, .7, 1.8, C.hay, 0, 1.6, -.9);
  });
}

export function boatGeometry() {
  return buildKeep04Model(kit => {
    kit.box(1.4, .5, 3.6, C.timber, 0, .25, 0);
    kit.box(1, .3, .9, C.timber, 0, .55, 1.6);
    kit.box(.08, 2.6, .08, C.timberDark, 0, 1.6, .3);
    kit.add(new THREE.PlaneGeometry(1.5, 1.8), C.plaster, [0, 1.9, .5], [0, Math.PI / 2, 0]);
  });
}

/** Swallow-like chevron with raised wingtips; flapping scales local Y. */
export function birdGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0, .35, -1.1, .45, -.25, 0, 0, -.3,
    0, 0, .35, 0, 0, -.3, 1.1, .45, -.25,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const colors = new Float32Array(18); const color = new THREE.Color('#2f3436');
  for (let i = 0; i < 18; i += 3) colors.set([color.r, color.g, color.b], i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function smokePuffGeometry() {
  return buildKeep04Model(kit => { kit.blob(.6, C.smoke, 0, 0, 0, [1, .8, 1]); });
}

/** Banner cloth hanging from a pole top, swaying around local Y. */
export function bannerGeometry() {
  return buildKeep04Model(kit => {
    kit.add(new THREE.PlaneGeometry(1.1, 2.3), C.warpViolet, [.6, -1.15, 0]);
    kit.add(new THREE.PlaneGeometry(1.12, .22), C.gold, [.6, -.25, .01]);
    kit.add(new THREE.PlaneGeometry(.38, .38), C.gold, [.6, -1.2, .01], [0, 0, Math.PI / 4]);
    kit.add(new THREE.PlaneGeometry(1.1, 2.3), C.warpViolet, [.6, -1.15, -.01], [0, Math.PI, 0]);
  });
}

export function bridgeGeometry(length: number, width: number) {
  return buildKeep04Model(kit => addBridge(kit, length, width));
}

export { gableGeometry };
