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

## ⚡ How It Works

`tyny-isprite` leverages native **SVG Sprites** technology. Instead of embedding full SVG code for each icon, it references symbols inside a single `sprite.svg` file using the `<use>` tag:

```html
<svg width="24" height="24">
  <use href="/sprite.svg#icon-star"></use>
</svg>
```

This means:
- One HTTP request for all icons
- Better caching
- Smaller JavaScript bundles
- Easy styling with CSS/Tailwind

All you need is to generate `sprite.svg` from your raw icons and use the provided `<Icon />` component.

---

## 🚀 Quick Start

1. Place your `.svg` files in `/icons/` folder.
2. Run:

```bash
npx build-sprite
```

3. Use in React:

```tsx
import { Icon } from 'tyny-isprite';

<Icon name="star" size={32} external />
```

---

## ❓ FAQ

**Q: My icon doesn't show up, what's wrong?**  
A: Ensure that:
- `sprite.svg` is located in your `public/` folder.
- You are using the correct `name` prop (matching your SVG filename).
- Check browser DevTools for any 404 errors.

---

**Q: Can I style icons with Tailwind or CSS?**  
A: Yes! The `<Icon />` component supports `className` prop for full control.

```tsx
<Icon name="heart" className="text-red-500 hover:text-pink-400" />
```

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

MIT — © 2025 [Dina](https://github.com/YOUR_USERNAME)