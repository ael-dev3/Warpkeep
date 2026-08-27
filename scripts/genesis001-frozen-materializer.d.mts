export const G001_BASELINE: '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
export const G001_BASELINE_ABI_SHA256: 'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03';
export const G001_FREEZE_NONCE: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';
export function materializeGenesis001HistoricalBaseline(input:{repoRoot:string;destination:string}):Readonly<{baseline:string;baselineAbiSha256:string;extractedFileCount:number}>;
export function materializeGenesis001Frozen(input:{repoRoot:string;destination:string}):Readonly<{baseline:string;baselineAbiSha256:string;freezeNonce:string;extractedFileCount:number}>;
export function sha256(value:string):string;
