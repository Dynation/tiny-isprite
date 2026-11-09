import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from 'tiny-isprite';
import sprite from './generated/sprite.js';

function App() {
  const [count, setCount] = useState(0);
  return <main>
    <h1>Vite sprite rebuild</h1>
    <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    <Icon name="star" spriteUrl={sprite.url} prefix={sprite.prefix} size={24} />
    <p data-testid="sprite-url">{sprite.url}</p>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
