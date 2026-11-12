import React, { useEffect, useMemo, useRef, useState } from "react";
import { RegionEditor } from "./RegionEditor.jsx";
import { createPortal } from "react-dom";

// This overlay is a sibling of the artwork. It is never part of exported SVGs.
export function RegionOverlay({
  prepared,
  targetRef,
  selected,
  placing,
  onSelect,
  onPlace,
  editor,
  onEdit,
}) {
  const overlayRef = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const target = targetRef.current?.querySelector("svg");
    const host = targetRef.current?.parentElement;
    if (!target || !host) return;
    const measure = () => {
      const rect = target.getBoundingClientRect(),
        parent = host.getBoundingClientRect();
      setBox({
        host,
        left: rect.left - parent.left - host.clientLeft,
        top: rect.top - parent.top - host.clientTop,
        width: rect.width,
        height: rect.height,
        preserve: target.getAttribute("preserveAspectRatio") || "xMidYMid meet",
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    observer.observe(host);
    return () => observer.disconnect();
  }, [targetRef, prepared.width, prepared.height]);
  const highlight = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = prepared.width;
    canvas.height = prepared.height;
    const ctx = canvas.getContext("2d"),
      image = ctx.createImageData(canvas.width, canvas.height);
    for (let p = 0; p < prepared.regionMap.length; p++)
      if (prepared.regionMap[p] === selected) {
        image.data[p * 4] = 90;
        image.data[p * 4 + 1] = 190;
        image.data[p * 4 + 2] = 255;
        image.data[p * 4 + 3] = 130;
      }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL();
  }, [prepared.regionMap, selected]);
  if (!box) return null;
  const region = prepared.components[selected];
  function click(event) {
    // The SVG screen transform includes the same letterboxing as the artwork.
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const x = Math.max(0, Math.min(100, (point.x / prepared.width) * 100));
    const y = Math.max(0, Math.min(100, (point.y / prepared.height) * 100));
    if (placing) {
      onPlace(x, y);
      return;
    }
    const px = Math.floor(point.x),
      py = Math.floor(point.y);
    if (px < 0 || py < 0 || px >= prepared.width || py >= prepared.height)
      return;
    const id = prepared.regionMap[py * prepared.width + px];
    if (id >= 0) onSelect(id);
  }
  return (
    <>
      {createPortal(
        <svg
          ref={overlayRef}
          className="region-origin-overlay"
          aria-label="Region selection overlay"
          viewBox={`0 0 ${prepared.width} ${prepared.height}`}
          preserveAspectRatio={box.preserve}
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
          onClick={click}
          onDoubleClick={(event) => {
            event.preventDefault();
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix || placing) return;
            const point = new DOMPoint(
              event.clientX,
              event.clientY,
            ).matrixTransform(matrix.inverse());
            const px = Math.floor(point.x),
              py = Math.floor(point.y);
            const id =
              px >= 0 && py >= 0 && px < prepared.width && py < prepared.height
                ? prepared.regionMap[py * prepared.width + px]
                : -1;
            onEdit(id >= 0 ? id : selected);
          }}
        >
          <rect
            width={prepared.width}
            height={prepared.height}
            fill="transparent"
          />
          <image
            href={highlight}
            width={prepared.width}
            height={prepared.height}
            pointerEvents="none"
          />
          {region && (
            <g pointerEvents="none" className="region-origin-marker">
              <circle
                cx={region.seed % prepared.width}
                cy={Math.floor(region.seed / prepared.width)}
                r="5"
                fill="#245cf3"
                stroke="white"
                strokeWidth="2"
              />
              <circle
                cx={region.seed % prepared.width}
                cy={Math.floor(region.seed / prepared.width)}
                r="8"
                fill="none"
                stroke="#111827"
                strokeWidth="1"
              />
              <text
                x={(region.seed % prepared.width) + 10}
                y={Math.floor(region.seed / prepared.width) - 8}
                fill="white"
                stroke="#111827"
                strokeWidth="3"
                paintOrder="stroke"
                fontSize="13"
              >
                {selected + 1}
              </text>
            </g>
          )}
        </svg>,
        box.host,
      )}
      {editor && region && (
        <RegionEditor
          {...editor}
          anchorRef={overlayRef}
          prepared={prepared}
          selected={selected}
        />
      )}
    </>
  );
}
