import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PawIcon } from "./PawIcon.jsx";

// View-only zoom. The artwork and region overlay share one scrollable plane;
// neither the SVG source nor exported sizes/animation coordinates are changed.
export function PreviewCanvas({ children }) {
  const viewport = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [hand, setHand] = useState(false);
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  const zoomRef = useRef(1),
    pending = useRef(null),
    drag = useRef(null);
  const suppressClick = useRef(false);
  function changeZoom(value, x, y) {
    const node = viewport.current;
    const next = Math.max(1, Math.min(16, value));
    if (!node || next === zoomRef.current) return;
    x ??= node.clientWidth / 2;
    y ??= node.clientHeight / 2;
    pending.current = {
      x: (node.scrollLeft + x) / zoomRef.current,
      y: (node.scrollTop + y) / zoomRef.current,
      anchorX: x,
      anchorY: y,
    };
    zoomRef.current = next;
    setZoom(next);
  }
  useLayoutEffect(() => {
    const node = viewport.current,
      anchor = pending.current;
    if (node && anchor) {
      node.scrollLeft = zoom === 1 ? 0 : anchor.x * zoom - anchor.anchorX;
      node.scrollTop = zoom === 1 ? 0 : anchor.y * zoom - anchor.anchorY;
      pending.current = null;
    }
  }, [zoom]);
  useEffect(() => {
    const node = viewport.current;
    // A non-passive listener keeps Ctrl/trackpad pinch scoped to this canvas.
    const wheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (drag.current) return;
      const rect = node.getBoundingClientRect();
      changeZoom(
        zoomRef.current * Math.exp(-event.deltaY * 0.01),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    const release = (event) => {
      if (event.type === "blur" || event.code === "Space") setSpace(false);
      if (event.type === "blur") {
        drag.current = null;
        setDragging(false);
      }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keyup", release);
    window.addEventListener("blur", release);
    return () => {
      node.removeEventListener("wheel", wheel);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", release);
    };
  }, []);
  useEffect(() => {
    const node = viewport.current;
    // Native capture also intercepts the region overlay rendered through a
    // React portal. Synthetic parent handlers would miss that overlay.
    function down(event) {
      if (event.button === 0 || event.button === 1)
        node.focus({ preventScroll: true });
      if (!((event.button === 0 && (hand || space)) || event.button === 1)) {
        suppressClick.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      node.setPointerCapture(event.pointerId);
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: node.scrollLeft,
        top: node.scrollTop,
      };
      suppressClick.current = true;
      setDragging(true);
    }
    function move(event) {
      const start = drag.current;
      if (!start || event.pointerId !== start.id) return;
      event.preventDefault();
      node.scrollLeft = start.left - (event.clientX - start.x);
      node.scrollTop = start.top - (event.clientY - start.y);
    }
    function end(event) {
      if (!drag.current || event.pointerId !== drag.current.id) return;
      suppressClick.current = true;
      drag.current = null;
      setDragging(false);
    }
    function click(event) {
      if (hand || space || suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    node.addEventListener("pointerdown", down, true);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    node.addEventListener("lostpointercapture", end);
    node.addEventListener("click", click, true);
    node.addEventListener("dblclick", click, true);
    return () => {
      node.removeEventListener("pointerdown", down, true);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      node.removeEventListener("lostpointercapture", end);
      node.removeEventListener("click", click, true);
      node.removeEventListener("dblclick", click, true);
    };
  }, [hand, space]);
  return (
    <>
      <div
        className="canvas-tools"
        role="group"
        aria-label="Preview zoom and pan"
      >
        <button
          type="button"
          aria-label="Zoom out preview"
          disabled={zoom <= 1}
          onClick={() => changeZoom(zoom / 1.5)}
        >
          −
        </button>
        <output aria-live="polite" aria-label="Preview zoom">
          {Math.round(zoom * 100)}%
        </output>
        <button
          type="button"
          aria-label="Zoom in preview"
          disabled={zoom >= 16}
          onClick={() => changeZoom(zoom * 1.5)}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            changeZoom(1);
            viewport.current?.scrollTo(0, 0);
            setHand(false);
          }}
        >
          Fit
        </button>
        <button
          type="button"
          aria-label="Pan preview"
          aria-pressed={hand}
          onClick={() => setHand(!hand)}
          title="Pan preview — drag to move the canvas. You can also hold Space or use the middle mouse button."
        >
          <PawIcon />
        </button>
        <span className="canvas-zoom-help">View only · Ctrl + wheel</span>
      </div>
      <div
        ref={viewport}
        className="preview-viewport"
        tabIndex={0}
        role="region"
        aria-label="Zoomable artwork preview"
        data-pan={hand || space || undefined}
        data-dragging={dragging || undefined}
        style={{ touchAction: hand ? "none" : "pan-x pan-y" }}
        onKeyDown={(event) => {
          if (event.code === "Space") {
            event.preventDefault();
            setSpace(true);
          }
        }}
      >
        <div
          className="preview-plane"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
