const NS = "http://www.w3.org/2000/svg";
let sequence = 0;

// Keep one native SVG mask attached during playback, just like the portable
// ZIP player. Changing CSS mask-image URLs can transiently hide the mask in Gecko;
// changing this image's href keeps the SVG mask reference itself stable.
export function createPreviewMask(svg, width, height, separateRegions) {
  const originals = [...svg.childNodes];
  const defs = document.createElementNS(NS, "defs");
  const mask = document.createElementNS(NS, "mask");
  const image = document.createElementNS(NS, "image");
  const content = document.createElementNS(NS, "g");
  const id = `isprite-preview-${++sequence}-${Math.random().toString(36).slice(2, 9)}`;
  defs.setAttribute("data-preview-mask", "");
  content.setAttribute("data-preview-content", "");
  mask.id = id;
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");
  mask.style.maskType = "alpha";
  const box = svg.viewBox.baseVal;
  const preserve = svg.getAttribute("preserveAspectRatio") || "xMidYMid meet";
  let bounds = [box.x, box.y, box.width, box.height];
  if (!separateRegions && !preserve.includes("none")) {
    const scale = (preserve.includes("slice") ? Math.max : Math.min)(
      width / box.width,
      height / box.height,
    );
    const align =
      preserve.split(/\s+/).find((v) => /^x(Min|Mid|Max)Y/.test(v)) ||
      "xMidYMid";
    const x = align.startsWith("xMin") ? 0 : align.startsWith("xMax") ? 1 : 0.5;
    const y = align.endsWith("YMin") ? 0 : align.endsWith("YMax") ? 1 : 0.5;
    bounds = [
      box.x - (width / scale - box.width) * x,
      box.y - (height / scale - box.height) * y,
      width / scale,
      height / scale,
    ];
  }
  for (const [index, key] of ["x", "y", "width", "height"].entries()) {
    mask.setAttribute(key, String(bounds[index]));
    image.setAttribute(key, String(bounds[index]));
  }
  image.setAttribute("preserveAspectRatio", "none");
  mask.append(image);
  defs.append(mask);
  for (const node of originals) {
    if (
      node.nodeType === 1 &&
      ["defs", "title", "desc"].includes(node.localName)
    )
      continue;
    content.append(node);
  }
  svg.append(defs, content);
  let lastURL;
  return {
    svg,
    width,
    height,
    separateRegions,
    update(url, complete) {
      if (complete) content.removeAttribute("mask");
      else {
        if (lastURL !== url) {
          image.setAttribute("href", url);
          lastURL = url;
        }
        content.setAttribute("mask", `url(#${id})`);
      }
    },
    destroy() {
      for (const node of originals) svg.append(node);
      defs.remove();
      content.remove();
    },
  };
}
