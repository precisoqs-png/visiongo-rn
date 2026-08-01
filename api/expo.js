// Vercel serverless function entry point — NOT part of the Expo Router app
// (that lives in app/, and app/api/coach+api.ts is bundled separately by
// `expo export` into dist/server/_expo/functions). This file just wires the
// pre-built dist/server output into Vercel's Node.js runtime, via the same
// adapter Expo ships for exactly this purpose. It only exists on the Vercel
// deploy path — the GitHub Pages static export never looks at this file.
const path = require('path');
const { createRequestHandler } = require('@expo/server/adapter/vercel');

module.exports = createRequestHandler({
  build: path.join(__dirname, '..', 'dist', 'server'),
});
