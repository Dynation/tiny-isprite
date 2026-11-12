import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
} from "react";
import { createPortal } from "react-dom";

export function RegionEditor({
  anchorRef,
  prepared,
  selected,
  origin,
  timing,
  customTiming,
  customOrigin,
  paint,
  onOrigin,
  onTiming,
  onResetTiming,
  onResetOrigin,
  onPlace,
  onClose,
}) {
  const popup = useRef(null);
  const title = useId();
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    function locate() {
      const region = prepared.components[selected],
        svg = anchorRef.current,
        panel = popup.current;
      const matrix = svg?.getScreenCTM();
      if (!region || !matrix || !panel) return;
      const point = new DOMPoint(
        region.seed % prepared.width,
        Math.floor(region.seed / prepared.width),
      ).matrixTransform(matrix);
      const rect = panel.getBoundingClientRect(),
        margin = 8;
      const above = point.y - rect.height - 16;
      const top = above >= margin ? above : point.y + 16;
      setPosition({
        left: Math.max(
          margin,
          Math.min(innerWidth - rect.width - margin, point.x - rect.width / 2),
        ),
        top: Math.max(
          margin,
          Math.min(innerHeight - rect.height - margin, top),
        ),
      });
    }
    locate();
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    const observer = new ResizeObserver(locate);
    observer.observe(popup.current);
    return () => {
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
      observer.disconnect();
    };
  }, [anchorRef, prepared, selected]);
  useEffect(() => {
    popup.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const outside = (event) => {
      if (
        !popup.current?.contains(event.target) &&
        !anchorRef.current?.contains(event.target)
      )
        onClose(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchorRef, onClose]);
  function number(event, low, high) {
    return Math.max(low, Math.min(high, Number(event.target.value) || low));
  }
  return createPortal(
    <section
      ref={popup}
      className="region-editor-popover"
      role="dialog"
      tabIndex={-1}
      aria-modal="false"
      aria-labelledby={title}
      style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h3 id={title}>Region {selected + 1} settings</h3>
        <button
          type="button"
          aria-label="Close region settings"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="animation-paint-label">
        {paint?.color && (
          <span
            className="animation-color-dot"
            style={{ backgroundColor: paint.color }}
            aria-hidden="true"
          />
        )}
        <code>{paint?.name}</code>
      </div>
      <div className="region-editor-coordinates">
        <label>
          X (%)
          <input
            aria-label="Region origin X"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={Number((origin.x * 100).toFixed(1))}
            onChange={(event) =>
              onOrigin(number(event, 0, 100), origin.y * 100)
            }
          />
        </label>
        <label>
          Y (%)
          <input
            aria-label="Region origin Y"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={Number((origin.y * 100).toFixed(1))}
            onChange={(event) =>
              onOrigin(origin.x * 100, number(event, 0, 100))
            }
          />
        </label>
      </div>
      <div className="region-editor-timing">
        <label>
          Start (s)
          <input
            aria-label="Region start"
            type="number"
            min="0"
            max="30"
            step="0.01"
            value={timing.start}
            onChange={(event) => onTiming("start", number(event, 0, 30))}
          />
        </label>
        <label>
          Duration (s)
          <input
            aria-label="Region duration"
            type="number"
            min="0.01"
            max="30"
            step="0.01"
            value={timing.duration}
            onChange={(event) => onTiming("duration", number(event, 0.01, 30))}
          />
        </label>
        <label>
          End fill (%)
          <input
            aria-label="Region end fill"
            type="number"
            min="0"
            max="100"
            step="5"
            value={timing.end}
            onChange={(event) => onTiming("end", number(event, 0, 100))}
          />
        </label>
      </div>
      <p>
        {customTiming
          ? "Own timing for this region."
          : "Timing follows its color."}{" "}
        Start is the delay from the beginning of the timeline.
      </p>
      <button type="button" className="button secondary" onClick={onPlace}>
        Place origin on artwork
      </button>
      <div className="region-editor-resets">
        <button type="button" disabled={!customTiming} onClick={onResetTiming}>
          Use color timing
        </button>
        <button type="button" disabled={!customOrigin} onClick={onResetOrigin}>
          Use shared origin
        </button>
      </div>
    </section>,
    document.body,
  );
}
