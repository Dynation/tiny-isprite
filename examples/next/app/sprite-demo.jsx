"use client";
import { useState } from 'react';
import { Icon } from 'tiny-isprite';
import sprite from '../src/generated/sprite.js';

export default function SpriteDemo() {
  const [count, setCount] = useState(0);
  return <main>
    <h1>Next.js sprite rebuild</h1>
    <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    <Icon name="star" spriteUrl={sprite.url} prefix={sprite.prefix} size={24} />
    <p data-testid="sprite-url">{sprite.url}</p>
  </main>;
}
