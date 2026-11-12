export interface SpriteSource {
  /** Filename used to derive the symbol ID, for example "heart.svg". */
  name: string;
  /** Valid SVG markup. Sanitize untrusted input before passing it here. */
  content: string;
}
export interface BuildSpriteContentOptions {
  icons: SpriteSource[];
  preserveColored?: boolean;
  useCssVars?: boolean;
  forceAllVars?: boolean;
  minify?: boolean;
  prefix?: string;
}
export interface SpriteContent {
  sprite: string;
  css?: string;
}
/** Generate SVG/CSS strings in memory; does not sanitize untrusted SVG. */
export function buildSpriteContent(options: BuildSpriteContentOptions): Promise<SpriteContent>;
