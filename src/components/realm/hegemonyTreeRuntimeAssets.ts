/**
 * Digest-pinned presentation catalog for the owner-supplied Hegemony tree
 * family. This data is visual-only: callers must never derive map authority,
 * collision, resources, or persistent state from model selection.
 */
export const HEGEMONY_TREE_RUNTIME_LODS = Object.freeze([
  'high',
  'balanced',
  'compact'
] as const);

/**
 * The private scene wrapper normalizes every immutable source tree to this
 * board-scale height. Footprints in the catalog are derived at this height
 * from the reviewed POSITION accessors, before any per-instance variation.
 */
export const HEGEMONY_TREE_TARGET_VISUAL_HEIGHT = 0.62;

export type HegemonyTreeLod = typeof HEGEMONY_TREE_RUNTIME_LODS[number];

export type HegemonyTreeRuntimeModel = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
  triangles: number;
  uploadedVertices: number;
  normalizedFootprintDiameter: number;
}>;

export type HegemonyTreeCollisionContract = Readonly<{
  policy: string;
  lodIndependent: boolean;
  canopyCollision?: boolean;
  navObstacleRadius?: number;
  primitives: readonly unknown[];
}>;

export type HegemonyTreeRuntimeRandomization = Readonly<{
  rotationYDegrees: readonly [number, number];
  uniformScale: readonly [number, number];
  additionalHueShift: readonly [number, number];
}>;

export type HegemonyTreeRuntimeAsset = Readonly<{
  id: string;
  name: string;
  speciesId: string;
  variantId: string;
  biomes: readonly string[];
  evergreen: boolean;
  weight: number;
  collision: HegemonyTreeCollisionContract;
  runtimeRandomization: HegemonyTreeRuntimeRandomization;
  models: Readonly<Record<HegemonyTreeLod, HegemonyTreeRuntimeModel>>;
}>;

const TREE_ASSETS = [
  {
    "id": "warpkeep.tree.birch.fresh-slender",
    "name": "Fresh Slender Birch",
    "speciesId": "birch",
    "variantId": "fresh-slender",
    "biomes": [
      "deciduous",
      "boreal",
      "temperate"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.2482,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.605,
            0.0
          ],
          "height": 3.21,
          "radius": 0.2256,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-birch-fresh-slender-high-83d359766360259f.glb",
        "bytes": 79296,
        "sha256": "83d359766360259ffe2bf802d66ba7e402ee05cbd04ce2c007e447bff3c7648c",
        "triangles": 440,
        "uploadedVertices": 1240,
"normalizedFootprintDiameter": 0.266872292
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-birch-fresh-slender-balanced-15a26cfd16e85098.glb",
        "bytes": 47776,
        "sha256": "15a26cfd16e850986a17e30f4808e9cbb708150282028ef6578ac74e20347691",
        "triangles": 246,
        "uploadedVertices": 734,
"normalizedFootprintDiameter": 0.266872292
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-birch-fresh-slender-compact-00e35224cae7d02c.glb",
        "bytes": 19928,
        "sha256": "00e35224cae7d02ca64a7a36790ba5d8df290c42ec439a5a25ac0bbcf579b744",
        "triangles": 95,
        "uploadedVertices": 285,
"normalizedFootprintDiameter": 0.267102103
      }
    }
  },
  {
    "id": "warpkeep.tree.birch.golden-lean",
    "name": "Golden Leaning Birch",
    "speciesId": "birch",
    "variantId": "golden-lean",
    "biomes": [
      "deciduous",
      "boreal",
      "temperate"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.264,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.515,
            0.0
          ],
          "height": 3.03,
          "radius": 0.24,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-birch-golden-lean-high-4c8d1d81e764164f.glb",
        "bytes": 79224,
        "sha256": "4c8d1d81e764164f1be932a0a2bcdaf5706472760ce206309380d79c028b7b69",
        "triangles": 440,
        "uploadedVertices": 1239,
"normalizedFootprintDiameter": 0.287179563
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-birch-golden-lean-balanced-1b32e77807d3c376.glb",
        "bytes": 47888,
        "sha256": "1b32e77807d3c376912e8e36d22aa8d6c56891ca8aa06aa273ac2722c70d60b9",
        "triangles": 246,
        "uploadedVertices": 736,
"normalizedFootprintDiameter": 0.287179563
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-birch-golden-lean-compact-56158b8ea9ac8049.glb",
        "bytes": 19916,
        "sha256": "56158b8ea9ac804960c61d7574811051cfc6ef4526ae7b75c3da264f754d0c1a",
        "triangles": 95,
        "uploadedVertices": 285,
"normalizedFootprintDiameter": 0.28742686
      }
    }
  },
  {
    "id": "warpkeep.tree.cypress.ancient-dark",
    "name": "Ancient Dark Cypress",
    "speciesId": "cypress",
    "variantId": "ancient-dark",
    "biomes": [
      "mediterranean",
      "temperate",
      "settlement"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.308,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.488,
            0.0
          ],
          "height": 2.976,
          "radius": 0.28,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-cypress-ancient-dark-high-d0254fbe6c511e31.glb",
        "bytes": 64968,
        "sha256": "d0254fbe6c511e31bcb9715401e9b55307071446d6c1314249bc4ef2b8e21a39",
        "triangles": 350,
        "uploadedVertices": 1010,
"normalizedFootprintDiameter": 0.135533523
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-cypress-ancient-dark-balanced-4d2a943ffb892868.glb",
        "bytes": 38728,
        "sha256": "4d2a943ffb892868bc73a67d51581c42432a5a2c65b709520d5e84dacc6b89ae",
        "triangles": 196,
        "uploadedVertices": 588,
"normalizedFootprintDiameter": 0.136544935
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-cypress-ancient-dark-compact-d4c484980c31a2e2.glb",
        "bytes": 16776,
        "sha256": "d4c484980c31a2e2b8e40b9e0eb5e8e4be97354b696e50dfee47660840b18f59",
        "triangles": 78,
        "uploadedVertices": 234,
"normalizedFootprintDiameter": 0.122899067
      }
    }
  },
  {
    "id": "warpkeep.tree.cypress.golden-columnar",
    "name": "Golden Columnar Cypress",
    "speciesId": "cypress",
    "variantId": "golden-columnar",
    "biomes": [
      "mediterranean",
      "temperate",
      "settlement"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.2475,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.674,
            0.0
          ],
          "height": 3.348,
          "radius": 0.225,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-cypress-golden-columnar-high-8169fb87e6e0563d.glb",
        "bytes": 65164,
        "sha256": "8169fb87e6e0563d604fbc014844e54db104244a941ba6459177cf24e575ac33",
        "triangles": 350,
        "uploadedVertices": 1013,
"normalizedFootprintDiameter": 0.096679525
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-cypress-golden-columnar-balanced-95a4e032238724df.glb",
        "bytes": 38744,
        "sha256": "95a4e032238724dfb2f1eca34e7f2bb2f633d0c371505d4dad99e1eeb9a89150",
        "triangles": 196,
        "uploadedVertices": 588,
"normalizedFootprintDiameter": 0.097400987
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-cypress-golden-columnar-compact-d3131739f5140617.glb",
        "bytes": 16788,
        "sha256": "d3131739f5140617f18c230e0d05841fa1cd5aa48ab675767a908cbcfdae4b43",
        "triangles": 78,
        "uploadedVertices": 234,
"normalizedFootprintDiameter": 0.092214675
      }
    }
  },
  {
    "id": "warpkeep.tree.fir.alpine-lime",
    "name": "Alpine Lime Fir",
    "speciesId": "fir",
    "variantId": "alpine-lime",
    "biomes": [
      "coniferous",
      "mountain"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.359,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.4,
            0.0
          ],
          "height": 2.8,
          "radius": 0.3264,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-fir-alpine-lime-high-2e56bdecf6f2a0be.glb",
        "bytes": 195028,
        "sha256": "2e56bdecf6f2a0beaf3b35ef63bd12081f417ed16b22498adff9a18ded5cbc20",
        "triangles": 1104,
        "uploadedVertices": 3103,
"normalizedFootprintDiameter": 0.482641121
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-fir-alpine-lime-balanced-d9074bc47d69a880.glb",
        "bytes": 111876,
        "sha256": "d9074bc47d69a880dabef041c8c77900c902a1103ab81dade4b79e9b1b7ee9ba",
        "triangles": 590,
        "uploadedVertices": 1768,
"normalizedFootprintDiameter": 0.482172012
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-fir-alpine-lime-compact-044ec0642e200b04.glb",
        "bytes": 42416,
        "sha256": "044ec0642e200b040084409cee577c276aa257661cfece594b67cc17d248fead",
        "triangles": 216,
        "uploadedVertices": 648,
"normalizedFootprintDiameter": 0.483075527
      }
    }
  },
  {
    "id": "warpkeep.tree.fir.silver-young",
    "name": "Young Silver Fir",
    "speciesId": "fir",
    "variantId": "silver-young",
    "biomes": [
      "coniferous",
      "mountain"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.3098,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.54,
            0.0
          ],
          "height": 3.08,
          "radius": 0.2816,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-fir-silver-young-high-9de182a4e75469ce.glb",
        "bytes": 195392,
        "sha256": "9de182a4e75469ce6846d83d00ede9825a81336a7fbd308201708b9d63e9d22c",
        "triangles": 1104,
        "uploadedVertices": 3109,
"normalizedFootprintDiameter": 0.365529704
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-fir-silver-young-balanced-232b7414c486cad4.glb",
        "bytes": 112000,
        "sha256": "232b7414c486cad4cf65ccc64985522a92e267794cbc77d6ed55c85b7ef498c5",
        "triangles": 590,
        "uploadedVertices": 1770,
"normalizedFootprintDiameter": 0.365174411
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-fir-silver-young-compact-bf4127e8fee1157c.glb",
        "bytes": 42420,
        "sha256": "bf4127e8fee1157c6386d902d3d5c70276c2a8a1370c0cd6f37fc5a8edddf90f",
        "triangles": 216,
        "uploadedVertices": 648,
"normalizedFootprintDiameter": 0.364363655
      }
    }
  },
  {
    "id": "warpkeep.tree.maple.ember-crown",
    "name": "Ember Crown Maple",
    "speciesId": "maple",
    "variantId": "ember-crown",
    "biomes": [
      "deciduous",
      "temperate",
      "settlement"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.5108,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.2,
            0.0
          ],
          "height": 2.4,
          "radius": 0.4644,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-maple-ember-crown-high-c816a3522172dd1e.glb",
        "bytes": 101672,
        "sha256": "c816a3522172dd1ebf2806ec5f159634f7c8af2da6941fc6d58b4eb0998edac3",
        "triangles": 572,
        "uploadedVertices": 1600,
"normalizedFootprintDiameter": 0.512643087
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-maple-ember-crown-balanced-79da66170ae6443e.glb",
        "bytes": 61772,
        "sha256": "79da66170ae6443e8d98dd455d77742a6ea0b9fdb6b70909d715e1e334d7bbbf",
        "triangles": 320,
        "uploadedVertices": 960,
"normalizedFootprintDiameter": 0.540030312
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-maple-ember-crown-compact-498e0fb11472b33a.glb",
        "bytes": 25304,
        "sha256": "498e0fb11472b33a082268e70b868f4530be84d446ba250e54b7493d039c5c13",
        "triangles": 124,
        "uploadedVertices": 372,
"normalizedFootprintDiameter": 0.602109461
      }
    }
  },
  {
    "id": "warpkeep.tree.maple.meadow-round",
    "name": "Round Meadow Maple",
    "speciesId": "maple",
    "variantId": "meadow-round",
    "biomes": [
      "deciduous",
      "temperate",
      "settlement"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.4919,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.25,
            0.0
          ],
          "height": 2.5,
          "radius": 0.4472,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-maple-meadow-round-high-a519b4341eb0ee96.glb",
        "bytes": 101560,
        "sha256": "a519b4341eb0ee96f8fa967f763bd9934eb74e254661b2d54bc20354e5045e90",
        "triangles": 572,
        "uploadedVertices": 1598,
"normalizedFootprintDiameter": 0.495161864
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-maple-meadow-round-balanced-d6b459095b00c08a.glb",
        "bytes": 61776,
        "sha256": "d6b459095b00c08a9f77bdb487b4cfa4bf5a603c9cb2a968db87dc99a576829d",
        "triangles": 320,
        "uploadedVertices": 960,
"normalizedFootprintDiameter": 0.521615153
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-maple-meadow-round-compact-85b513a162ebcaf9.glb",
        "bytes": 25312,
        "sha256": "85b513a162ebcaf957a71b67a1dbf4afb832cf72bc3529ec428735bd66631716",
        "triangles": 124,
        "uploadedVertices": 372,
"normalizedFootprintDiameter": 0.580690197
      }
    }
  },
  {
    "id": "warpkeep.tree.oak.gnarled-amber",
    "name": "Gnarled Amber Oak",
    "speciesId": "oak",
    "variantId": "gnarled-amber",
    "biomes": [
      "deciduous",
      "temperate",
      "settlement"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.7401,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.092,
            0.0
          ],
          "height": 2.184,
          "radius": 0.6728,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-oak-gnarled-amber-high-89ea745f1d5e4949.glb",
        "bytes": 115708,
        "sha256": "89ea745f1d5e4949c0af2dba78ee34d2da6d8e29c3dd9e09b0787057e928b25e",
        "triangles": 650,
        "uploadedVertices": 1826,
"normalizedFootprintDiameter": 0.699889445
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-oak-gnarled-amber-balanced-2ef2442a1e75da60.glb",
        "bytes": 69904,
        "sha256": "2ef2442a1e75da60761bc6dd455bc0f23bfac0b9fd50bd52314719d32584742a",
        "triangles": 364,
        "uploadedVertices": 1091,
"normalizedFootprintDiameter": 0.679812141
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-oak-gnarled-amber-compact-24dc6a72c9171f33.glb",
        "bytes": 29216,
        "sha256": "24dc6a72c9171f33b30f29f09df6e9ccfa6fde35b0ca2e9a621195959bbb1f2d",
        "triangles": 145,
        "uploadedVertices": 435,
"normalizedFootprintDiameter": 0.764127225
      }
    }
  },
  {
    "id": "warpkeep.tree.oak.spring-broad",
    "name": "Broad Spring Oak",
    "speciesId": "oak",
    "variantId": "spring-broad",
    "biomes": [
      "deciduous",
      "temperate",
      "settlement"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.7018,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.152,
            0.0
          ],
          "height": 2.304,
          "radius": 0.638,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-oak-spring-broad-high-251706f103d5e7af.glb",
        "bytes": 115940,
        "sha256": "251706f103d5e7af400b6dde4c2d2aa84304c60efdad4b1aafb90acf9ce53d8d",
        "triangles": 650,
        "uploadedVertices": 1830,
"normalizedFootprintDiameter": 0.659324972
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-oak-spring-broad-balanced-eca7d04626717a92.glb",
        "bytes": 69896,
        "sha256": "eca7d04626717a9241fa780140736ba9ab6fb0e07c5930fd3e16a0e4ded3eddb",
        "triangles": 364,
        "uploadedVertices": 1091,
"normalizedFootprintDiameter": 0.637205102
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-oak-spring-broad-compact-0275d403ad952c37.glb",
        "bytes": 29212,
        "sha256": "0275d403ad952c37c854852a82f8aea4b2f3a9a18c5e25ab2f80c082524e5f2c",
        "triangles": 145,
        "uploadedVertices": 435,
"normalizedFootprintDiameter": 0.716235824
      }
    }
  },
  {
    "id": "warpkeep.tree.pine.alpine",
    "name": "Alpine Pine",
    "speciesId": "pine",
    "variantId": "alpine",
    "biomes": [
      "coniferous",
      "highland",
      "temperate"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.4013,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.664,
            0.0
          ],
          "height": 3.328,
          "radius": 0.3648,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-pine-alpine-high-78964fd53ab62938.glb",
        "bytes": 106296,
        "sha256": "78964fd53ab62938ebcc5afdbe9df6c3e655dbf78971b983307ed4cf87ddb7c9",
        "triangles": 586,
        "uploadedVertices": 1676,
"normalizedFootprintDiameter": 0.421941618
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-pine-alpine-balanced-c4e353df6bb8207e.glb",
        "bytes": 63236,
        "sha256": "c4e353df6bb8207e976a9d9d75dce25d5ab37d72cc716a85070c4ef74fba0061",
        "triangles": 328,
        "uploadedVertices": 984,
"normalizedFootprintDiameter": 0.421941618
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-pine-alpine-compact-a2b5cab2cdd5d669.glb",
        "bytes": 26396,
        "sha256": "a2b5cab2cdd5d66971896d13a42469919ca28dc9f3cc3b1005a6cf7b3755abfb",
        "triangles": 130,
        "uploadedVertices": 390,
"normalizedFootprintDiameter": 0.42181871
      }
    }
  },
  {
    "id": "warpkeep.tree.pine.windblown-blue",
    "name": "Windblown Blue Pine",
    "speciesId": "pine",
    "variantId": "windblown-blue",
    "biomes": [
      "coniferous",
      "highland",
      "temperate"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.4514,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.568,
            0.0
          ],
          "height": 3.136,
          "radius": 0.4104,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-pine-windblown-blue-high-c6a00c442659c010.glb",
        "bytes": 105856,
        "sha256": "c6a00c442659c010f0d7eb4a522cf8239c272d4dffb09fd1c84d1832d3d23aae",
        "triangles": 586,
        "uploadedVertices": 1668,
"normalizedFootprintDiameter": 0.479487841
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-pine-windblown-blue-balanced-25708dd15d9fff0a.glb",
        "bytes": 63272,
        "sha256": "25708dd15d9fff0ab7b15dfca5e93442d2175499b395aad6fadd632a23f20c3a",
        "triangles": 328,
        "uploadedVertices": 984,
"normalizedFootprintDiameter": 0.479487841
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-pine-windblown-blue-compact-5c44abbfc1f80895.glb",
        "bytes": 26436,
        "sha256": "5c44abbfc1f80895fdeb338e596d6404c34b69c9eeb708123af85774485354c1",
        "triangles": 130,
        "uploadedVertices": 390,
"normalizedFootprintDiameter": 0.479348171
      }
    }
  },
  {
    "id": "warpkeep.regular-tree",
    "name": "Regular Tree",
    "speciesId": "regular",
    "variantId": "meadow",
    "biomes": [
      "temperate",
      "deciduous",
      "meadow"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "policy": "presentation-only; no runtime collision is authorized for the legacy Regular Tree family",
      "lodIndependent": true,
      "primitives": []
    },
    "runtimeRandomization": {
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ],
      "additionalHueShift": [
        -0.025,
        0.025
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-high-5e2fcf234d834950.glb",
        "bytes": 118704,
        "sha256": "5e2fcf234d834950d6bade356a3431192232f6a631fab0d2f29983c208ff6d42",
        "triangles": 668,
        "uploadedVertices": 1869,
"normalizedFootprintDiameter": 0.433888993
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-balanced-c77293af2d83c210.glb",
        "bytes": 72128,
        "sha256": "c77293af2d83c21052d128b2faf05c7c5e7f857405c72921dbc42940e2e674c9",
        "triangles": 374,
        "uploadedVertices": 1122,
"normalizedFootprintDiameter": 0.432401344
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-compact-02e443d0bfa94a4a.glb",
        "bytes": 29332,
        "sha256": "02e443d0bfa94a4a53390ce8d625652ad837d3550119e2b72553633357621bb8",
        "triangles": 144,
        "uploadedVertices": 432,
"normalizedFootprintDiameter": 0.441463465
      }
    }
  },
  {
    "id": "warpkeep.regular-tree.coolevergreen",
    "name": "Regular Tree \u2014 Cool Evergreen",
    "speciesId": "regular",
    "variantId": "cool-evergreen",
    "biomes": [
      "temperate",
      "coniferous",
      "boreal"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "policy": "presentation-only; no runtime collision is authorized for the legacy Regular Tree family",
      "lodIndependent": true,
      "primitives": []
    },
    "runtimeRandomization": {
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ],
      "additionalHueShift": [
        -0.025,
        0.025
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-cool-evergreen-high-5f76ac38738f1c88.glb",
        "bytes": 119084,
        "sha256": "5f76ac38738f1c88ed90fbd058dbd41733fa66e70e20002a190e92a1284f1984",
        "triangles": 668,
        "uploadedVertices": 1874,
"normalizedFootprintDiameter": 0.304803155
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-cool-evergreen-balanced-3068821eb1c441d7.glb",
        "bytes": 72208,
        "sha256": "3068821eb1c441d7ec52730880b9d51a2d06af580975ebd8d426ee8550ba168e",
        "triangles": 374,
        "uploadedVertices": 1122,
"normalizedFootprintDiameter": 0.303758095
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-cool-evergreen-compact-1e2859a7d1d35ba5.glb",
        "bytes": 29412,
        "sha256": "1e2859a7d1d35ba5967820e12e508141b0b05ba9058a0ce4e5b533984cbfdd78",
        "triangles": 144,
        "uploadedVertices": 432,
"normalizedFootprintDiameter": 0.30208545
      }
    }
  },
  {
    "id": "warpkeep.regular-tree.deepforest",
    "name": "Regular Tree \u2014 Deep Forest",
    "speciesId": "regular",
    "variantId": "deep-forest",
    "biomes": [
      "temperate",
      "deciduous",
      "forest"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "policy": "presentation-only; no runtime collision is authorized for the legacy Regular Tree family",
      "lodIndependent": true,
      "primitives": []
    },
    "runtimeRandomization": {
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ],
      "additionalHueShift": [
        -0.025,
        0.025
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-deep-forest-high-47a1a716f3f57888.glb",
        "bytes": 119732,
        "sha256": "47a1a716f3f5788860169f19ee8deaac7ec8010ffcae0ea83a9bc40f6bb52bff",
        "triangles": 668,
        "uploadedVertices": 1885,
"normalizedFootprintDiameter": 0.456799683
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-deep-forest-balanced-0865e92147da454a.glb",
        "bytes": 72196,
        "sha256": "0865e92147da454a30fd79f74268b4ab654b071fcd865420f44246f4e190282e",
        "triangles": 374,
        "uploadedVertices": 1122,
"normalizedFootprintDiameter": 0.455233482
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-deep-forest-compact-ed3ea8b76c41da9c.glb",
        "bytes": 29400,
        "sha256": "ed3ea8b76c41da9c6eb166689ec83c93b485373fdb5d00b026c421d03a80338d",
        "triangles": 144,
        "uploadedVertices": 432,
"normalizedFootprintDiameter": 0.471254485
      }
    }
  },
  {
    "id": "warpkeep.regular-tree.embermaple",
    "name": "Regular Tree \u2014 Ember Maple",
    "speciesId": "regular",
    "variantId": "ember-maple",
    "biomes": [
      "temperate",
      "deciduous",
      "settlement"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "policy": "presentation-only; no runtime collision is authorized for the legacy Regular Tree family",
      "lodIndependent": true,
      "primitives": []
    },
    "runtimeRandomization": {
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ],
      "additionalHueShift": [
        -0.025,
        0.025
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-ember-maple-high-99abe9b02ee98bf6.glb",
        "bytes": 119072,
        "sha256": "99abe9b02ee98bf6ab91c87f7f361b106d1003c939e2eb1f1f1aa56b14f7b9a0",
        "triangles": 668,
        "uploadedVertices": 1874,
"normalizedFootprintDiameter": 0.412435964
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-ember-maple-balanced-e8ba1803bbe07468.glb",
        "bytes": 72196,
        "sha256": "e8ba1803bbe074682ad92cfe1f3f4b358659e1611e53d40efe1ab148be08898e",
        "triangles": 374,
        "uploadedVertices": 1122,
"normalizedFootprintDiameter": 0.41102187
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-ember-maple-compact-8756ffaa76140747.glb",
        "bytes": 29404,
        "sha256": "8756ffaa76140747a1abade1b1cfc2c717acc4939f0108ed18e585c9b270f04f",
        "triangles": 144,
        "uploadedVertices": 432,
"normalizedFootprintDiameter": 0.412437821
      }
    }
  },
  {
    "id": "warpkeep.regular-tree.goldengrove",
    "name": "Regular Tree \u2014 Golden Grove",
    "speciesId": "regular",
    "variantId": "golden-grove",
    "biomes": [
      "temperate",
      "deciduous",
      "settlement"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "policy": "presentation-only; no runtime collision is authorized for the legacy Regular Tree family",
      "lodIndependent": true,
      "primitives": []
    },
    "runtimeRandomization": {
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ],
      "additionalHueShift": [
        -0.025,
        0.025
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-golden-grove-high-cb1a14312c2554f3.glb",
        "bytes": 118476,
        "sha256": "cb1a14312c2554f312a21a49d2d22b0eed12a47f50f5d3f4e1f1f097c9e7a46f",
        "triangles": 668,
        "uploadedVertices": 1864,
"normalizedFootprintDiameter": 0.499581508
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-golden-grove-balanced-087a651b163d10cf.glb",
        "bytes": 72200,
        "sha256": "087a651b163d10cf0949e9c16491231a6c643d3375657c5b537ef9a3b655fe12",
        "triangles": 374,
        "uploadedVertices": 1122,
"normalizedFootprintDiameter": 0.497868623
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-golden-grove-compact-b0054a6d4e3fb528.glb",
        "bytes": 29404,
        "sha256": "b0054a6d4e3fb5281e5c4ccc5286dc625655f50d6c2157f932a0e88190721228",
        "triangles": 144,
        "uploadedVertices": 432,
"normalizedFootprintDiameter": 0.50272457
      }
    }
  },
  {
    "id": "warpkeep.regular-tree.sunlitlime",
    "name": "Regular Tree \u2014 Sunlit Lime",
    "speciesId": "regular",
    "variantId": "sunlit-lime",
    "biomes": [
      "temperate",
      "deciduous",
      "meadow"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "policy": "presentation-only; no runtime collision is authorized for the legacy Regular Tree family",
      "lodIndependent": true,
      "primitives": []
    },
    "runtimeRandomization": {
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ],
      "additionalHueShift": [
        -0.025,
        0.025
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-sunlit-lime-high-2f778f3a74dd6de0.glb",
        "bytes": 118592,
        "sha256": "2f778f3a74dd6de002de4e5d3f83b96e16c7a6b390b0f6489647ee9508d8e3ea",
        "triangles": 668,
        "uploadedVertices": 1866,
"normalizedFootprintDiameter": 0.370976848
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-sunlit-lime-balanced-36c5cdfcee796d7f.glb",
        "bytes": 72196,
        "sha256": "36c5cdfcee796d7f8d47e4007ae94019393c74d3386b42aab6900b4a7093b533",
        "triangles": 374,
        "uploadedVertices": 1122,
"normalizedFootprintDiameter": 0.369704902
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-regular-sunlit-lime-compact-3f6ee40deee26896.glb",
        "bytes": 29400,
        "sha256": "3f6ee40deee26896eb26a4848b53ffa0efb66510217aab4508aec91475a209ff",
        "triangles": 144,
        "uploadedVertices": 432,
"normalizedFootprintDiameter": 0.375118348
      }
    }
  },
  {
    "id": "warpkeep.tree.spruce.deep-narrow",
    "name": "Deep Narrow Spruce",
    "speciesId": "spruce",
    "variantId": "deep-narrow",
    "biomes": [
      "coniferous",
      "mountain",
      "temperate"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.3403,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.566,
            0.0
          ],
          "height": 3.132,
          "radius": 0.3094,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-spruce-deep-narrow-high-e95b4b424487a2ab.glb",
        "bytes": 114044,
        "sha256": "e95b4b424487a2ab0251871316e8d305f322b7856538aed48a6c72c375271480",
        "triangles": 652,
        "uploadedVertices": 1798,
"normalizedFootprintDiameter": 0.305540829
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-spruce-deep-narrow-balanced-0272637284758aaa.glb",
        "bytes": 69192,
        "sha256": "0272637284758aaa2e848519fb97a788267363aaaf6d2059d7c0053f59518969",
        "triangles": 364,
        "uploadedVertices": 1079,
"normalizedFootprintDiameter": 0.305490452
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-spruce-deep-narrow-compact-cf67e8d66d2c65a4.glb",
        "bytes": 28868,
        "sha256": "cf67e8d66d2c65a46a8d98053efe86a62830d593650256a34d40fa71ae4f316d",
        "triangles": 146,
        "uploadedVertices": 429,
"normalizedFootprintDiameter": 0.305095964
      }
    }
  },
  {
    "id": "warpkeep.tree.spruce.sunlit-dense",
    "name": "Sunlit Dense Spruce",
    "speciesId": "spruce",
    "variantId": "sunlit-dense",
    "biomes": [
      "coniferous",
      "mountain",
      "temperate"
    ],
    "evergreen": true,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.3964,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.421,
            0.0
          ],
          "height": 2.842,
          "radius": 0.3604,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-spruce-sunlit-dense-high-0f858ef30bdfb1a7.glb",
        "bytes": 112972,
        "sha256": "0f858ef30bdfb1a767a4fc5ba1c8c24aa75955a344d68061977f35fd66502944",
        "triangles": 652,
        "uploadedVertices": 1780,
"normalizedFootprintDiameter": 0.400559293
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-spruce-sunlit-dense-balanced-3b436d529f6405ef.glb",
        "bytes": 67936,
        "sha256": "3b436d529f6405efbd51bdb0f408f61fb01b16fb055e62b3a6af66cc299eebe9",
        "triangles": 364,
        "uploadedVertices": 1058,
"normalizedFootprintDiameter": 0.400493245
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-spruce-sunlit-dense-compact-06c7ee4adf7fdc23.glb",
        "bytes": 28096,
        "sha256": "06c7ee4adf7fdc23650e94d18c99bff9df378f6220ab4c996f4647651c9a3804",
        "triangles": 146,
        "uploadedVertices": 416,
"normalizedFootprintDiameter": 0.399976078
      }
    }
  },
  {
    "id": "warpkeep.tree.willow.lemon-weeping",
    "name": "Lemon Weeping Willow",
    "speciesId": "willow",
    "variantId": "lemon-weeping",
    "biomes": [
      "river",
      "wetland",
      "temperate"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.572,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.15,
            0.0
          ],
          "height": 2.3,
          "radius": 0.52,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-willow-lemon-weeping-high-bbf6eb8eea8b677f.glb",
        "bytes": 148104,
        "sha256": "bbf6eb8eea8b677f4e0fcf388f2205a8fd2c08d6ee667d7cfcb5226a7b1051bf",
        "triangles": 846,
        "uploadedVertices": 2346,
"normalizedFootprintDiameter": 0.672429767
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-willow-lemon-weeping-balanced-ca0d0e4a54312a46.glb",
        "bytes": 88764,
        "sha256": "ca0d0e4a54312a4681f7b8916baebcd9f35e11f9e52866c8ee9b29fb4c4770ca",
        "triangles": 474,
        "uploadedVertices": 1394,
"normalizedFootprintDiameter": 0.672022441
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-willow-lemon-weeping-compact-e2da964fef66675d.glb",
        "bytes": 37604,
        "sha256": "e2da964fef66675d1b9fdd22e24ed43fa97cead154c29f3655c1aba35e47d51f",
        "triangles": 190,
        "uploadedVertices": 570,
"normalizedFootprintDiameter": 0.678398451
      }
    }
  },
  {
    "id": "warpkeep.tree.willow.river-mist",
    "name": "River Mist Willow",
    "speciesId": "willow",
    "variantId": "river-mist",
    "biomes": [
      "river",
      "wetland",
      "temperate"
    ],
    "evergreen": false,
    "weight": 1.0,
    "collision": {
      "canopyCollision": false,
      "lodIndependent": true,
      "navObstacleRadius": 0.616,
      "policy": "trunk-only",
      "primitives": [
        {
          "axis": "Y",
          "center": [
            0.0,
            1.081,
            0.0
          ],
          "height": 2.162,
          "radius": 0.56,
          "type": "capsule"
        }
      ]
    },
    "runtimeRandomization": {
      "additionalHueShift": [
        -0.025,
        0.025
      ],
      "rotationYDegrees": [
        0.0,
        360.0
      ],
      "uniformScale": [
        0.9,
        1.1
      ]
    },
    "models": {
      "high": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-willow-river-mist-high-cafb8b9d246fb6fd.glb",
        "bytes": 148324,
        "sha256": "cafb8b9d246fb6fd5b31523dd8ac9e93362e9885616675eceb288da3141d85f6",
        "triangles": 846,
        "uploadedVertices": 2350,
"normalizedFootprintDiameter": 0.772688004
      },
      "balanced": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-willow-river-mist-balanced-545b967805851a9c.glb",
        "bytes": 88744,
        "sha256": "545b967805851a9cad9710038e335359e9076bc617e1092b0bdae9ad250e3b5a",
        "triangles": 474,
        "uploadedVertices": 1394,
"normalizedFootprintDiameter": 0.772219947
      },
      "compact": {
        "path": "public/models/hegemony/environment/trees/hegemony-tree-willow-river-mist-compact-96367ac3373d8c7d.glb",
        "bytes": 37584,
        "sha256": "96367ac3373d8c7d47c85bc237ed554f43797fc484ba51c4ad429a6cedb8fcd5",
        "triangles": 190,
        "uploadedVertices": 570,
"normalizedFootprintDiameter": 0.77954661
      }
    }
  }
] as const satisfies readonly HegemonyTreeRuntimeAsset[];

export const HEGEMONY_TREE_RUNTIME_ASSETS = Object.freeze(TREE_ASSETS);

export const HEGEMONY_TREE_RUNTIME_ASSET_BY_ID: Readonly<Record<string, HegemonyTreeRuntimeAsset>> =
  Object.freeze(Object.fromEntries(
    HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => [asset.id, asset])
  ));

export function hegemonyTreeModel(
  asset: HegemonyTreeRuntimeAsset,
  lod: HegemonyTreeLod
): HegemonyTreeRuntimeModel {
  return asset.models[lod];
}
