# 🧩 tyny-isprite

> Lightweight React SVG sprite component for projects using Vite, Next.js or Turbopack.

`tyny-isprite` helps you render SVG icons via `<use>` from a generated sprite — no more bloated icon imports, just one cached SVG for all your icons.

---

## 💡 Why use `tyny-isprite`?

Modern frontend apps often import dozens of icons like this:

```tsx
import StarIcon from './icons/star.svg';
```

But this causes:
- ❌ Every icon adds bytes to your JS bundle  
- ❌ Styling via CSS or Tailwind is tricky  
- ❌ Harder to change icon sets globally  

**SVG sprite solves this**:

✅ All icons are combined into a single file (`sprite.svg`)  
✅ Loaded once and cached forever  
✅ Icons are injected with `<use>` — clean, tiny, and styleable

---

## ✨ Features

- ⚡ Ultra-light, zero-runtime dependency
- 🧠 Works with `vite`, `next`, `turbopack`
- 🎨 Easy to style with Tailwind/CSS
- 📦 Peer-dependency friendly (`react` only)

---

## 🚀 How to use

### 1. Drop your raw `.svg` files into `/icons/`

For example:

```
icons/
├─ star.svg
├─ heart.svg
├─ user.svg
```

### 2. Generate your SVG sprite

```bash
npm run build:sprite
```

This creates a file at `public/sprite.svg` like:

```xml
<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
  <symbol id="icon-star" viewBox="0 0 24 24">...</symbol>
  <symbol id="icon-heart" viewBox="0 0 24 24">...</symbol>
</svg>
```

> This file is **never rendered directly** — it's used as a reference for all your icons via `<use>`.

### 3. Use `<Icon />` component in your app

```tsx
import { Icon } from 'tyny-isprite';

<Icon name="star" size={32} external />
```

> The `name` maps to your filename:  
> `icons/heart.svg` → `icon-heart`

---

## ⚙️ Props

| Prop        | Type       | Default | Description                            |
|-------------|------------|---------|----------------------------------------|
| `name`      | `string`   | —       | Icon name (corresponds to ID in sprite) |
| `size`      | `number`   | `24`    | Width and height of SVG                |
| `className` | `string`   | —       | Optional CSS/Tailwind classes          |
| `external`  | `boolean`  | `false` | Use external sprite instead of inline  |

---

## 🧩 License

MIT — © 2025 [Dina](https://github.com/Dynation)
