"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/Ikon.tsx
var Ikon_exports = {};
__export(Ikon_exports, {
  Icon: () => Icon
});
module.exports = __toCommonJS(Ikon_exports);
var import_react = __toESM(require("react"), 1);
var Icon = ({
  name,
  size = 24,
  className,
  external = false
}) => {
  const href = external ? `/sprite.svg#icon-${name}` : `#icon-${name}`;
  return /* @__PURE__ */ import_react.default.createElement(
    "svg",
    {
      width: size,
      height: size,
      className,
      "aria-hidden": "true",
      xmlns: "http://www.w3.org/2000/svg"
    },
    /* @__PURE__ */ import_react.default.createElement("use", { xlinkHref: href })
  );
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Icon
});
