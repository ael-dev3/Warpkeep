// Reviewed deployed B0 source, retrieved through authenticated Cloudflare APIs
// on 2026-09-12. Deployment ec7c0f41-1404-40f8-9330-3c531afae621 serves version
// 79dfceec-9810-4868-afca-5b794d08a9a5 (49), source 308f901d91a1fb68d90f157a2ec164ed1acaf51d.
// The module inventory and multipart-v1 digest bind the actual downloaded bytes.
// Cloudflare's script etag is a different value and is not a source digest.
// This authority is independent of the newly built candidate's source digest.
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_B0_SOURCE_AUTHORITY = Object.freeze({
  sourceDigest: '8744a3767fb0cbe9b99c34ab3351f9744b0b4134d6244c393dea5e828296654d',
  entrypoint: 'index.js',
  modules: Object.freeze([
    Object.freeze({
      field: 'index.js',
      name: 'index.js',
      contentType: 'application/javascript+module',
      size: 1124442,
      sha256: '1442aca3fda8cc9d408d8614261ba8c472526ec0a17d2e513385f3885f33c4b3',
    }),
  ]),
});
