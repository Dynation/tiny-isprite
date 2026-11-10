"use client";
import React, { useEffect, useRef } from "react";
import animation from "./animation-data.js";
import { createAnimation } from "./player.js";

export function AnimatedIcon({
  width = animation.display.width,
  autoPlay = false,
  progress,
  theme = animation.defaultTheme,
  colors,
  label = animation.name,
  onReady,
  onComplete,
  className,
  style,
  ...props
}) {
  const host = useRef(null),
    player = useRef(null),
    callbacks = useRef({ onReady, onComplete });
  callbacks.current = { onReady, onComplete };
  useEffect(() => {
    const instance = createAnimation(host.current, animation, {
      onComplete: () => callbacks.current.onComplete?.(),
    });
    player.current = instance;
    callbacks.current.onReady?.(instance);
    return () => {
      instance.destroy();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    player.current?.setTheme(theme);
    player.current?.setColors(colors);
  }, [theme, colors]);
  useEffect(() => {
    if (progress !== undefined) player.current?.seek(progress);
  }, [progress]);
  useEffect(() => {
    if (autoPlay) player.current?.replay();
    else player.current?.pause();
  }, [autoPlay]);
  useEffect(() => {
    player.current?.setLabel(label);
  }, [label]);
  return (
    <span
      {...props}
      ref={host}
      className={className}
      style={{
        display: "inline-block",
        width,
        aspectRatio: String(1 / animation.display.aspectRatio),
        ...style,
      }}
    />
  );
}
