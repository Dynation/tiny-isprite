const shapes = {
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9zm-9 11 9 5 9-5m-18 5 9 4 9-4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  'mouse-pointer': '<path d="m5 3 15 9-7 2-3 7z"/>',
  sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  zap: '<path d="m13 2-9 12h7l-1 8L21 9h-8z"/>',
};
export const samples = Object.entries(shapes).map(([name, content]) => ({ name, original: `${name}.svg`,
  content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${content}</g></svg>`,
}));
