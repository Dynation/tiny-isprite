import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
const defaults = {
  packageWidth: 220,
  inspectorWidth: 340,
  packageCollapsed: false,
  inspectorCollapsed: false,
};
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function useEditorLayout() {
  const [layout, setLayout] = useState(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("isprite-editor-layout") || "null",
      );
      return value
        ? {
            packageWidth: clamp(Number(value.packageWidth) || 220, 180, 380),
            inspectorWidth: clamp(
              Number(value.inspectorWidth) || 340,
              260,
              520,
            ),
            packageCollapsed: value.packageCollapsed === true,
            inspectorCollapsed: value.inspectorCollapsed === true,
          }
        : defaults;
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("isprite-editor-layout", JSON.stringify(layout));
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [layout]);
  return [
    layout,
    (patch) => setLayout((previous) => ({ ...previous, ...patch })),
    () => setLayout(defaults),
  ];
}
export function usePanelWidth(node) {
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return width;
}
export function PanelSeparator({
  label,
  value,
  min,
  max,
  direction = 1,
  onChange,
  reset,
}) {
  const drag = useRef(null),
    frame = useRef(0),
    next = useRef(value);
  const [dragging, setDragging] = useState(false);
  const previous = useRef(null);
  function end() {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    onChange(next.current);
    if (previous.current) {
      document.body.style.cursor = previous.current.cursor;
      document.body.style.userSelect = previous.current.select;
      previous.current = null;
    }
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      if (previous.current) {
        document.body.style.cursor = previous.current.cursor;
        document.body.style.userSelect = previous.current.select;
      }
    },
    [],
  );
  return (
    <div
      className="panel-separator"
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} pixels`}
      data-dragging={dragging || undefined}
      title="Drag to resize. Arrow keys adjust width; double-click resets it."
      onDoubleClick={reset}
      onKeyDown={(event) => {
        let n;
        if (event.key === "ArrowRight")
          n = value + direction * (event.shiftKey ? 40 : 16);
        else if (event.key === "ArrowLeft")
          n = value - direction * (event.shiftKey ? 40 : 16);
        else if (event.key === "Home") n = min;
        else if (event.key === "End") n = max;
        else return;
        event.preventDefault();
        onChange(clamp(n, min, max));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, value };
        next.current = value;
        previous.current = {
          cursor: document.body.style.cursor,
          select: document.body.style.userSelect,
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        next.current = clamp(
          drag.current.value + (event.clientX - drag.current.x) * direction,
          min,
          max,
        );
        if (!frame.current)
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            onChange(next.current);
          });
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span />
    </div>
  );
}
