export interface SpriteManifest {
  url: string;
  hash: string;
  prefix: string;
  cssUrl?: string;
}

export interface GenerateSpriteOptions {
  srcDir?: string;
  outputFile?: string;
  preserveColored?: boolean;
  useCssVars?: boolean;
  forceAllVars?: boolean;
  minify?: boolean;
  prefix?: string;
  publicPath?: string;
  manifestFile?: string;
}

export function generateSprite(options: GenerateSpriteOptions): Promise<SpriteManifest>;
export function processSvgWithCssVars(
  svgContent: string, iconId: string, variablesMap: Set<string>, allMode?: boolean
): Promise<string>;
export function generateCssFileContent(variablesMap: Set<string>): string;
