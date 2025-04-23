// src/Ikon.tsx
import React from "react";
var Icon = ({
  name,
  size = 24,
  className,
  external = false
}) => {
  const href = external ? `/sprite.svg#icon-${name}` : `#icon-${name}`;
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: size,
      height: size,
      className,
      "aria-hidden": "true",
      xmlns: "http://www.w3.org/2000/svg"
    },
    /* @__PURE__ */ React.createElement("use", { xlinkHref: href })
  );
};
export {
  Icon
};
