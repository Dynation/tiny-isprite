import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpriteContent,processSvgWithCssVars} from '../core/sprite-content.js';

test('variable conversion keeps original attribute and CSS paints as fallbacks',async()=>{
  for(const options of [{useCssVars:true},{forceAllVars:true}]){
    const {sprite,css}=await buildSpriteContent({icons:[{name:'tone',content:'<svg viewBox="0 0 24 24" fill="rgb(12, 34, 56)" style="stroke:#abcdef!important"><path fill="none" stroke="currentColor" d="M0 0h24v24z"/><circle fill="var(--authored, orange)" r="4"/></svg>'}],...options});
    const prefix=options.forceAllVars?'all-':'';
    assert.ok(sprite.includes(`var(--${prefix}tone-fill-1, rgb(12, 34, 56))`));
    assert.ok(sprite.includes(`var(--${prefix}tone-stroke-1,#abcdef)!important`));
    assert.match(css,/rgb\(12, 34, 56\)/);
    assert.match(sprite,/fill="none"/);
    assert.match(sprite,/stroke="currentColor"/);
    assert.match(sprite,/var\(--authored, orange\)/);
  }
});

test('multicolor conversion remains opt-in and legacy helper has the same fallback behavior',async()=>{
  const icons=[{name:'multi',content:'<svg><path fill="red"/><path fill="blue" stroke="white"/></svg>'}];
  const normal=await buildSpriteContent({icons,useCssVars:true});
  assert.match(normal.sprite,/fill="red"/);
  assert.doesNotMatch(normal.sprite,/var\(/);
  const all=await buildSpriteContent({icons,forceAllVars:true});
  assert.match(all.sprite,/var\(--all-multi-fill-1, red\)/);
  assert.match(all.sprite,/var\(--all-multi-fill-2, blue\)/);
  assert.match(all.sprite,/var\(--all-multi-stroke-1, white\)/);
  const variables=new Set();
  assert.match(await processSvgWithCssVars('<path fill="red"/>','legacy',variables),/var\(--legacy-fill-1, red\)/);
});
