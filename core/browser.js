// Filesystem-free API for browsers and other in-memory consumers.
// Input must already be sanitized by the application. This module does not
// read files, hash assets, create manifests, or access the DOM.
export { buildSpriteContent } from "./sprite-content.js";
