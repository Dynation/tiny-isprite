import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
} from "react";
import { createPortal } from "react-dom";

// The overlay never intercepts canvas/control input. Only this small popover
// receives pointer events, so each instruction can be tried on the live editor.
export function AnimationTour({ index, steps, onStep, onClose }) {
  const panel = useRef(null),
    title = useId();
  const [box, setBox] = useState(null),
    [position, setPosition] = useState({ left: 8, top: 8 }),
    [arrow, setArrow] = useState(null);
  const step = steps[index],
    selector = step?.selector;
  useLayoutEffect(() => {
    if (!step) return;
    setBox(null);
    let frame, scrollFrame;
    const locate = () => {
      const node = document.querySelector(selector);
      if (node && node.getClientRects().length) {
        const rect = node.getBoundingClientRect();
        const avoid =
          node.closest(".region-editor-popover")?.getBoundingClientRect() ||
          rect;
        const value = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          avoidLeft: avoid.left,
          avoidTop: avoid.top,
          avoidWidth: avoid.width,
          avoidHeight: avoid.height,
        };
        setBox((old) =>
          old &&
          Object.keys(value).every(
            (key) => Math.abs(old[key] - value[key]) < 0.5,
          )
            ? old
            : value,
        );
      } else setBox((old) => (old === null ? old : null));
      frame = requestAnimationFrame(locate);
    };
    // Let mobile sheets and the region dialog mount before scrolling to a target.
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = requestAnimationFrame(() => {
        document.querySelector(selector)?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
        panel.current?.focus({ preventScroll: true });
      });
    });
    frame = requestAnimationFrame(locate);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
    };
  }, [index, selector]);
  useLayoutEffect(() => {
    if (!panel.current) return;
    const width = panel.current.offsetWidth,
      height = panel.current.offsetHeight,
      margin = 8,
      gap = 12;
    const clamp = (value, high) => Math.max(margin, Math.min(high, value));
    let left = (innerWidth - width) / 2,
      top = margin;
    if (box) {
      const x = box.avoidLeft,
        y = box.avoidTop,
        w = box.avoidWidth,
        h = box.avoidHeight;
      const candidates = [
        [x + w + gap, clamp(y, innerHeight - height - margin)],
        [x - width - gap, clamp(y, innerHeight - height - margin)],
        [clamp(x + (w - width) / 2, innerWidth - width - margin), y + h + gap],
        [
          clamp(x + (w - width) / 2, innerWidth - width - margin),
          y - height - gap,
        ],
      ];
      const fit = candidates.find(
        ([a, b]) =>
          a >= margin &&
          b >= margin &&
          a + width <= innerWidth - margin &&
          b + height <= innerHeight - margin,
      );
      [left, top] = fit || [
        clamp(x, innerWidth - width - margin),
        clamp(y - height - gap, innerHeight - height - margin),
      ];
    }
    const next = {
      left: clamp(left, innerWidth - width - margin),
      top: clamp(top, innerHeight - height - margin),
    };
    if (box) {
      const between = (n, low, high) => Math.max(low, Math.min(high, n));
      const x1 = between(
        box.left + box.width / 2,
        next.left,
        next.left + width,
      );
      const y1 = between(box.top + box.height / 2, next.top, next.top + height);
      const x2 = between(x1, box.left, box.left + box.width);
      const y2 = between(y1, box.top, box.top + box.height);
      const line =
        Math.hypot(x2 - x1, y2 - y1) > 10 ? { x1, y1, x2, y2 } : null;
      setArrow((old) =>
        JSON.stringify(old) === JSON.stringify(line) ? old : line,
      );
    } else setArrow(null);
    setPosition((old) =>
      old.left === next.left && old.top === next.top ? old : next,
    );
  }, [box, index, step?.canNext]);
  useEffect(() => {
    if (!step) return;
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [!!step, onClose]);
  if (!step) return null;
  function focusControl() {
    const node = document.querySelector(selector);
    const focusable = node?.matches("button,input,select,[tabindex]")
      ? node
      : node?.querySelector("input,select,button,[tabindex]");
    focusable?.focus({ preventScroll: true });
  }
  return createPortal(
    <div className="animation-tour" data-animation-tour="true">
      {box && (
        <div
          className="animation-tour-highlight"
          aria-hidden="true"
          style={{
            left: box.left - 4,
            top: box.top - 4,
            width: box.width + 8,
            height: box.height + 8,
          }}
        />
      )}
      {box && arrow && (
        <svg className="animation-tour-pointer" aria-hidden="true">
          <defs>
            <marker
              id={`${title}-arrow`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0L8 4L0 8Z" fill="#ffb64d" />
            </marker>
          </defs>
          <line
            {...arrow}
            stroke="#ffb64d"
            strokeWidth="2"
            markerEnd={`url(#${title}-arrow)`}
          />
        </svg>
      )}
      <section
        ref={panel}
        className="animation-tour-popover"
        role="dialog"
        aria-modal="false"
        aria-labelledby={title}
        tabIndex={-1}
        style={position}
      >
        <header>
          <span aria-live="polite">
            Step {index + 1} of {steps.length}
          </span>
          <button
            type="button"
            aria-label="Close animation tour"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <h3 id={title}>{step.title}</h3>
        <p>{step.body}</p>
        {step.hint && (
          <p className="tour-hint" role="status">
            {step.hint}
          </p>
        )}
        {!box && <p role="status">Preparing this control…</p>}
        <button
          type="button"
          className="tour-focus"
          disabled={!box}
          onClick={focusControl}
        >
          Go to control ↗
        </button>
        <footer>
          <button type="button" onClick={onClose}>
            Skip tour
          </button>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onStep(index - 1)}
          >
            Back
          </button>
          <button
            type="button"
            className="tour-next"
            disabled={step.canNext === false || !box}
            onClick={() =>
              index === steps.length - 1 ? onClose() : onStep(index + 1)
            }
          >
            {index === steps.length - 1 ? "Done" : "Next"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
