import test from "node:test";
import assert from "node:assert/strict";
import { buildSpriteContent } from "../core/sprite-content.js";
import { parseSvg } from "../core/svg-document.js";

const content = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><style>:where(svg){height:auto;height:intrinsic;max-width:100%;display:block}:where(text){white-space:pre}:is(rect,#paint){fill:red}rect{fill:blue}</style><rect id="paint" width="640" height="400"/><text>two  spaces</text></svg>';
test("responsive layout remains with the generated symbol and is explicitly inline-only", async () => {
  await assert.rejects(buildSpriteContent({icons:[{name:"chart.svg",content}],target:"external"}),/generate an inline sprite/);
  const {sprite}=await buildSpriteContent({icons:[{name:"chart.svg",content}],target:"inline",preserveColored:true});
  const root=parseSvg(sprite),symbol=root.getElementsByTagName("symbol")[0];
  assert.deepEqual(JSON.parse(symbol.getAttribute("data-isprite-viewport")),{width:640,height:400});
  const svg=symbol.getElementsByTagName("svg")[0];
  assert.equal(svg.getAttribute("width"),"100%");
  assert.doesNotMatch(svg.getAttribute("style"),/height|max-width/);
  assert.match(symbol.getElementsByTagName("rect")[0].getAttribute("style"),/fill:red/);
  assert.match(symbol.getElementsByTagName("text")[0].getAttribute("style"),/white-space:pre/);
});
test("unverified root layouts remain errors instead of being silently flattened", async () => {
  for (const changed of [content.replace('height="400"','height="300"'),content.replace('height:auto;height:intrinsic','height:100px'),content.replace('max-width:100%','max-width:50%'),content.replace('width="640"','width="40em"')])
    await assert.rejects(buildSpriteContent({icons:[{name:"chart.svg",content:changed}],target:"inline"}),/root CSS viewport/);
});
