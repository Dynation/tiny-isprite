import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium,firefox,webkit} from '@playwright/test';
import {PNG} from 'pngjs';
import {buildSpriteContent} from '../core/sprite-content.js';

// Deliberately separate fill/stroke channels, with solid sample points away from edges.
const icons=[{name:'badge',content:'<svg viewBox="0 0 80 80"><rect x="5" y="5" width="70" height="70" fill="#333" stroke="#fff" stroke-width="10"/><circle cx="40" cy="40" r="12" fill="#fff"/></svg>'}];
const generated=await buildSpriteContent({icons,forceAllVars:true,target:'external',prefix:''});
const server=createServer((req,res)=>{
 if(req.url==='/sprite.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(generated.sprite);return;}
 res.setHeader('Content-Type','text/html');
 res.end('<!doctype html><style>body{margin:0;background:#123}.host{display:inline-block;width:80px;height:80px}svg{display:block;width:80px;height:80px}</style><div class="host" id="a"></div><div class="host" id="b"></div>');
});
server.listen(0,'127.0.0.1');await once(server,'listening');
try{for(const [name,engine,executablePath] of [['chromium',chromium,process.env.SVG_CHROMIUM_EXECUTABLE],['firefox',firefox,process.env.SVG_FIREFOX_EXECUTABLE],['webkit',webkit,process.env.SVG_WEBKIT_EXECUTABLE]]){
 const browser=await engine.launch({headless:true,executablePath});
 try{const page=await browser.newPage({deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(()=>{for(const id of ['a','b'])document.getElementById(id).innerHTML='<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="/sprite.svg#badge"/></svg>';});
 async function check(id,expected){const png=PNG.sync.read(await page.locator('#'+id).screenshot());for(const [index,[x,y]] of [[15,40],[40,40],[3,40]].entries()){const start=(y*png.width+x)*4;assert.deepEqual([...png.data.slice(start,start+3)],expected[index],`${name}/${id}/paint ${index}`);}}
 const original=[[51,51,51],[255,255,255],[255,255,255]];
 await check('a',original);await check('b',original);
 await page.addStyleTag({content:generated.css});await check('a',original);
 await page.evaluate(()=>{const a=document.getElementById('a');a.style.setProperty('--all-badge-fill-1','#2563eb');a.style.setProperty('--all-badge-fill-2','#fbbf24');a.style.setProperty('--all-badge-stroke-1','#16a34a');});
 await check('a',[[37,99,235],[251,191,36],[22,163,74]]);await check('b',original);
 await page.evaluate(()=>{for(const s of document.querySelectorAll('style'))if(s.textContent.includes('--all-'))s.remove();document.getElementById('a').removeAttribute('style');});
 await check('a',original);
 await page.evaluate(()=>document.getElementById('a').innerHTML='<svg><use href="/sprite.svg#badge"/></svg>');await check('a',original);
 assert.deepEqual(errors,[]);console.log(`PASS ${name}: external href/xlink, absent/loaded/removed CSS, per-instance multicolor overrides and source fallbacks`);
 }finally{await browser.close();}
}}finally{server.close();}
