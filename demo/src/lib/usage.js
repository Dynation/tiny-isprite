export function singleUsageSnippet(single, name, variables, color, width) {
  const colors = variables.length
    ? `// Keep the variable names. Change the color values on the right.\nconst iconColors = {\n${variables.map((v) => `  ${JSON.stringify(v.name)}: ${JSON.stringify(v.value)}, // ${v.property}`).join("\n")}\n};\n\n`
    : "";
  return `// 1. Download React component and save it as ${name}.jsx.\n// 2. Save this example beside it, then render <IconExample /> in your app.\nimport { ExampleIcon } from './${name}.jsx';\n\n${colors}export default function IconExample() {\n  const width = ${width}; // Change this number; height keeps the original proportions.\n\n  return (\n    <ExampleIcon\n      width={width}\n      height={width * ${single.aspectRatio}}\n      color=${JSON.stringify(color)} // Only changes paints that use currentColor.\n${variables.length ? "      style={iconColors} // Overrides the generated CSS-variable fallback colors.\n" : ""}      className="my-icon" // Optional: your CSS class, or Tailwind utility classes.\n      role="img"\n      aria-label="Your icon"\n    />\n  );\n}\n`;
}
