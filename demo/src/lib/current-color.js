// Inspect generated, sanitized paint attributes rather than the chosen mode:
// original SVGs may already use currentColor, while editable palettes replace it.
export function usesCurrentColor(svg = "") {
  return /\s(?:fill|stroke|stop-color|flood-color|lighting-color)="[^"]*\bcurrentColor\b[^"]*"/i.test(
    svg || "",
  );
}
