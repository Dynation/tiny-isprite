# 🧩 tiny-isprite 2.0.0

![npm](https://img.shields.io/npm/v/tiny-isprite) ![license](https://img.shields.io/npm/l/tiny-isprite) ![downloads](https://img.shields.io/npm/dm/tiny-isprite)

> ⚡️ Lightweight & Flexible React SVG Sprite Generator and Component for Vite, Next.js, Turbopack.

`tiny-isprite` v2.0 — not just a component, but a tool for generating optimized SVG sprites with color customization, CSS variables, and minification support.

---

## 🚀 Features
- 🔹 **CLI** with flexible arguments
- 🎨 Supports `currentColor` for icon styling
- 🖍️ Preserve multicolor icons (`--preserve-colored`)
- 🧩 Convert to CSS variables (`--use-css-vars`)
- ✂️ Minify SVG (`--minify`)
- ⚛️ React component for easy usage

---

## 📦 Installation
```bash
npm install tiny-isprite
```

---

## ⚡ Quick CLI Usage

1. Place your `.svg` icons in the `icons/` folder.
2. Run the generator:

```bash
npx build-sprite
```

### 🔧 Example with arguments:
```bash
npx build-sprite ./assets/icons ./public/sprite.svg --preserve-colored --prefix custom- --minify
```

| Argument              | Description                                         |
|-----------------------|-----------------------------------------------------|
| `srcDir`              | Directory with icons (`./icons` by default)         |
| `outputFile`          | Output sprite file (`./public/sprite.svg`)          |
| `--preserve-colored`  | Preserve multicolor icons                           |
| `--use-css-vars`      | Convert fill/stroke to CSS variables                |
| `--minify`            | Minify sprite                                       |
| `--prefix <prefix>`   | Prefix for icon IDs                                 |

---

## ⚛️ React Usage

```tsx
import { Icon } from 'tiny-isprite';

<Icon name="star" size={32} className="text-blue-500" external />
```

---

## 🎨 Advanced: Using CSS Variables

Generate sprite with CSS variables support:

```bash
npx build-sprite --use-css-vars
```

### Example CSS:

```css
:root {
  --icon-fill: #4ade80;
  --icon-stroke: #1e40af;
}

.custom-icon {
  --icon-fill: red;
  --icon-stroke: black;
}
```

### Usage:

```tsx
<Icon name="folder" size={48} className="custom-icon" external />
```

➡️ Easily adapt colors to themes or component context!

---

### 🌈 Tailwind CSS Example

**Important:**  
For `currentColor` to work, the icon must inherit color from a parent element or have it defined via CSS.

1. **Works** — when the icon is inside a parent with a Tailwind color class:

```tsx
<p className="text-green-700">
   Made by Dina 
   <Icon name="mono-heart" size={64} external />
</p>
```

2. **Doesn't work** — if you apply the class directly to the icon:

```tsx
<Icon name="mono-heart" size={64} external className="text-red-800" />
```
*This won't change the color because the SVG `<use>` element doesn't directly accept Tailwind classes.*

3. **Solution via CSS:**

```css
:root {
  --all-mono-heart-fill-1: currentColor;
}
```

```tsx
<p className="text-green-700">
   Made by Dina 
   <Icon name="mono-heart" size={64} external className="text-red-800" />
</p>
```

*In this case, the icon will take the color from the `text-red-800` class.*

---

## 📂 Recommended Structure
```
my-app/
├── icons/              # Your raw SVG icons
├── public/
│   └── sprite.svg      # Generated sprite
└── src/
```

---

## 🛠 Roadmap
- [x] CLI arguments
- [x] CSS Variables
- [x] Tailwind integration example
- [ ] Watch Mode
- [ ] StackBlitz Demo
- [ ] TypeScript improvements

---

## 📄 License
MIT — © 2025 [Dina](https://github.com/Dynation)

