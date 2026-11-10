import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from 'tiny-isprite';
import { samples } from './samples.js';
import { buildProject, cleanSvg, defaultOptions, download, exportBundle, iconName, MAX_FILE_SIZE, MAX_ICONS, reactSnippet, validateOptions } from './lib/project.js';
import './style.css';

const github = 'https://github.com/Dynation/tiny-isprite';
const symbols = { upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5', download: 'M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3', arrow: 'M5 19 19 5M5 5h14v14', search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', copy: 'M9 9h12v12H9zM15 5V2H2v13h3', check: 'm5 12 4 4L20 5', grid: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z', close: 'm6 6 12 12M6 18 18 6', refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6', file: 'M5 3h9l5 5v13H5zM14 3v6h5' };
function Glyph({ name, size = 18, ...props }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={symbols[name] || symbols.file}/></svg>; }
function App() {
  const [icons, setIcons] = useState(() => samples.map(icon => ({ ...icon })));
  const [options, setOptions] = useState(defaultOptions);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('sparkle');
  const [color, setColor] = useState('#245cf3');
  const [size, setSize] = useState(32);
  const [tab, setTab] = useState('react');
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState('');
  const [build, setBuild] = useState({ busy: true, artifact: null, url: '', error: '' });
  const input = useRef(null);
  const copyTimer = useRef(null);
  const signature = useMemo(() => JSON.stringify({ icons, options }), [icons, options]);
  useEffect(() => {
    let disposed = false;
    let url = '';
    const error = validateOptions(options);
    setBuild(previous => ({ ...previous, busy: true, error }));
    const timer = setTimeout(async () => {
      try {
        if (error) throw new Error(error);
        const artifact = await buildProject(icons, options);
        if (disposed) return;
        url = URL.createObjectURL(new Blob([artifact.sprite], { type: 'image/svg+xml' }));
        setBuild({ busy: false, artifact, url, signature, error: '' });
      } catch (error) { if (!disposed) setBuild({ busy: false, artifact: null, url: '', error: error.message }); }
    }, 100);
    return () => { disposed = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [signature]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const matches = icons.filter(icon => icon.name.includes(query.toLowerCase()));
  const current = icons.find(icon => icon.name === selected) || icons[0];
  const artifact = build.artifact;
  const ready = artifact && !build.busy && !build.error && build.signature === signature && icons.length > 0;
  const snippet = artifact && current ? reactSnippet(artifact, current.name, size) : '// Add an SVG to get started.';
  const code = tab === 'react' ? snippet : tab === 'sprite' ? artifact?.sprite || '' : artifact?.module || '';
  const update = (key, value) => setOptions(previous => ({ ...previous, [key]: value }));
  async function addFiles(files) {
    if (reading) return;
    setReading(true);
    const additions = [];
    const failures = [];
    const names = new Set(icons.map(icon => icon.name));
    for (const file of [...files]) {
      if (icons.length + additions.length >= MAX_ICONS) { failures.push(`Limit: ${MAX_ICONS} icons.`); break; }
      try {
        if (!/\.svg$/i.test(file.name)) throw new Error('Only .svg files are supported.');
        if (file.size > MAX_FILE_SIZE) throw new Error('SVG exceeds 128 KB.');
        const base = iconName(file.name);
        let name = base;
        let count = 2;
        while (names.has(name)) name = `${base}-${count++}`;
        const content = cleanSvg(await file.text(), name);
        additions.push({ name, content, original: file.name });
        names.add(name);
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    if (additions.length) { setIcons(previous => [...previous, ...additions]); setSelected(additions[0].name); setQuery(''); }
    setNotice([additions.length ? `Added ${additions.length} ${additions.length === 1 ? 'icon' : 'icons'}. SVGs cleaned for preview and export.` : '', ...failures].filter(Boolean).join(' '));
    setReading(false);
    if (input.current) input.current.value = '';
  }
  async function copy(value, key) {
    try { await navigator.clipboard.writeText(value); setCopied(key); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(''), 1800); }
    catch { setNotice('Clipboard is unavailable. Select and copy the code from the panel instead.'); }
  }
  function remove(name) { setIcons(previous => previous.filter(icon => icon.name !== name)); }
  function saveBundle() { if (ready) download(exportBundle(artifact, icons, options, { name: current.name, size }), 'tiny-isprite-bundle.zip', 'application/zip'); }
  return <div className="app-shell">
    <header className="header"><a className="brand" href="/" aria-label="tiny-isprite home"><span className="brand-mark"><i/><i/><i/><i/></span><strong>tiny-isprite<span className="brand-dot">.</span></strong></a><span className="header-label">THE SPRITE PLAYGROUND</span><nav aria-label="Main"><a href={`${github}#quick-start`} target="_blank" rel="noreferrer">Documentation <Glyph name="arrow" size={14}/></a><a href={github} target="_blank" rel="noreferrer">GitHub <Glyph name="arrow" size={14}/></a><span className="version">v2.1.0</span></nav></header>
    <main>
      <section className="intro"><div><p className="eyebrow"><span className="live-dot"/> SMALL PACKAGE. BIG ICON ENERGY.</p><h1>Your icons.<br/>All together<span>.</span></h1><p className="intro-copy">Turn a folder of SVGs into one tiny sprite.<br/>Preview it in React. Make it yours. Ship it.</p></div><div className="intro-aside"><span className="mini-label">START SMALL. BUILD SOMETHING.</span><button className="install" onClick={() => copy('npm install tiny-isprite', 'install')}><span><b>$</b> npm install tiny-isprite</span><Glyph name={copied === 'install' ? 'check' : 'copy'} size={17}/></button><p><span className="shield-icon">↳</span> Everything happens in your browser.<br/><span className="indent">Your files stay yours.</span></p></div></section>
      <section className="workspace" aria-label="SVG sprite builder">
        <div className="workspace-top"><div className="workspace-title"><Glyph name="grid"/><h2>Sprite builder</h2><span className="small-badge">LIVE PLAYGROUND</span></div><div className="workspace-actions"><button className="text-button" disabled={reading} onClick={() => { setIcons(samples.map(icon => ({ ...icon }))); setSelected('sparkle'); setQuery(''); setNotice('Sample set loaded.'); }}><Glyph name="refresh" size={15}/>Load samples</button><button className="button primary compact" onClick={() => input.current.click()} disabled={reading}><Glyph name="upload" size={16}/>{reading ? 'Reading…' : 'Add SVGs'}</button></div></div>
        <input ref={input} id="svg-input" className="visually-hidden" type="file" accept=".svg,image/svg+xml" multiple tabIndex={-1} aria-label="Upload SVG files" disabled={reading} onChange={event => addFiles(event.target.files)}/>
        <div className="workspace-body"><aside className="settings"><div className="settings-heading"><h3>Make it yours</h3><span>01 — CONFIGURE</span></div>
          <label className="field-label" htmlFor="prefix">Symbol prefix</label><div className="input-wrapper"><span>#</span><input id="prefix" value={options.prefix} onChange={event => update('prefix', event.target.value)} maxLength={32} spellCheck="false"/></div><p className="field-note">Names become {options.prefix || ''}sparkle</p>
          <label className="field-label" htmlFor="asset-path">Asset path</label><input id="asset-path" value={options.publicPath} onChange={event => update('publicPath', event.target.value)} maxLength={120} spellCheck="false"/><p className="field-note">Your public URL folder, e.g. /assets/</p>
          <fieldset className="color-mode"><legend className="field-label">Color handling</legend>{[['currentColor','Use currentColor','Convert monochrome fills.'],['original','Keep original colors','Keep the colors in your SVGs.'],['variables','Generate CSS variables','Export an editable color palette.']].map(([mode, label, hint]) => <label className={`mode-option ${options.mode === mode ? 'chosen' : ''}`} key={mode}><input type="radio" name="mode" value={mode} checked={options.mode === mode} onChange={() => update('mode', mode)}/><span><b>{label}</b><small>{hint}</small></span></label>)}</fieldset>
          <label className="toggle-row"><span><b>Minify output</b><small>A little less whitespace.</small></span><input type="checkbox" checked={options.minify} onChange={event => update('minify', event.target.checked)}/><span className="toggle-track"/></label>
          <div className="safe-note"><span>↗</span><p>Content-hashed filenames.<br/>Fresh icons after every rebuild.</p></div>
        </aside>
        <div className="stage"><div className="stage-toolbar"><div className="section-label">YOUR ICONS <span>{icons.length.toString().padStart(2,'0')}</span></div><label className="search"><Glyph name="search" size={15}/><input aria-label="Search icons" placeholder="Find an icon…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
          <div className={`icon-canvas ${dragging ? 'dragging' : ''}`} style={{ '--preview-color': color }} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
            {dragging && <div className="drop-overlay"><Glyph name="upload" size={30}/>Drop your SVGs here</div>}
            <div className="icon-grid">{matches.map(icon => <div className={`icon-card ${current?.name === icon.name ? 'selected' : ''}`} key={icon.name}><button className="icon-select" aria-pressed={current?.name === icon.name} onClick={() => setSelected(icon.name)} title={icon.original}>{artifact && <Icon name={icon.name} spriteUrl={build.url} prefix={artifact.manifest.prefix} size={size}/>}<span>{icon.name}</span></button><button className="remove-icon" aria-label={`Remove ${icon.name}`} onClick={() => remove(icon.name)} disabled={reading}><Glyph name="close" size={12}/></button></div>)}</div>
            {!matches.length && <div className="empty-state"><Glyph name="grid" size={30}/><h3>{icons.length ? 'Nothing by that name.' : 'A blank canvas. A fresh start.'}</h3><p>{icons.length ? 'Try another search.' : 'Drop SVG files here or load the sample set.'}</p></div>}
            <button className="drop-hint" onClick={() => input.current.click()} disabled={reading}><Glyph name="upload" size={15}/>Drop SVGs here, or <b>browse files</b><span>Up to {MAX_ICONS} icons · 128 KB each</span></button>
          </div>
          <div className="preview-controls"><label className="color-control">Preview color <span className="color-swatch" style={{background:color}}><input aria-label="Preview color" type="color" value={color} onChange={event => setColor(event.target.value)}/></span><code>{color.toUpperCase()}</code></label><label className="size-control" htmlFor="preview-size">Size<input id="preview-size" type="range" min="20" max="64" value={size} onChange={event => setSize(Number(event.target.value))}/><code>{size}px</code></label></div>
          <div className="preview-footnote">Preview color applies to <code>currentColor</code>. Fixed fills, strokes and CSS-variable defaults keep their colors.</div>
        </div></div>
        <div className="workspace-status" aria-live="polite"><div className={build.error ? 'error-status' : ''}><span className={`status-dot ${build.error ? 'error' : ''}`}/>{build.error || (build.busy ? 'Building your sprite…' : icons.length ? `${icons.length} icons, one sprite. Looking good.` : 'Ready for your first SVG.')}</div><span>{artifact ? `${(artifact.bytes/1024).toFixed(2)} KB` : '—'}<span className="status-divider">/</span>No uploads. No account.</span></div>
      </section>
      {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><Glyph name="close" size={16}/></button></div>}
      {artifact?.css && <style>{artifact.css}</style>}
      <section className="output-section"><div className="code-panel"><div className="code-toolbar"><div className="tabs" role="tablist" aria-label="Export code">{[['react','React usage'],['sprite','SVG sprite'],['manifest','Manifest']].map(([value,label]) => <button key={value} role="tab" id={`tab-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onKeyDown={event => {
      const all = ['react', 'sprite', 'manifest'];
      const index = all.indexOf(value);
      const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
      if (next !== null) { event.preventDefault(); setTab(all[next]); event.currentTarget.parentElement.children[next].focus(); }
    }} aria-controls="code-output" onClick={() => setTab(value)}>{label}</button>)}</div><button className="copy-code" aria-label="Copy code" onClick={() => copy(code, 'code')} disabled={!ready}><Glyph name={copied === 'code' ? 'check' : 'copy'} size={16}/>{copied === 'code' ? 'Copied' : 'Copy'}</button></div><pre id="code-output" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex="0"><code>{code}</code></pre><div className="code-caption"><span className="code-dot"/>The actual tiny-isprite React component. The same generation engine as the CLI.</div></div>
        <aside className="export-panel"><span className="mini-label">02 — TAKE IT WITH YOU</span><h2>Ready to leave<br/>the playground?</h2><p>Your sprite, hashed assets, source icons,<br className="desktop-break"/> manifest, and React snippet. All packed up.</p><button className="button primary export-button" onClick={saveBundle} disabled={!ready}><Glyph name="download" size={18}/>Download bundle<Glyph name="arrow" size={16}/></button><button className="download-single" disabled={!ready} onClick={() => download(artifact.sprite, artifact.filename, 'image/svg+xml')}>Just the SVG sprite <span>↓</span></button><div className="export-file"><Glyph name="file" size={15}/><span>{artifact?.filename || 'sprite.<hash>.svg'}</span></div></aside></section>
      <section className="how-it-works"><div><span className="step-number">01</span><h3>Bring your SVGs</h3><p>Start with the samples or drop in your own. We clean scripts and external references.</p></div><div><span className="step-number">02</span><h3>Keep the good parts</h3><p>Choose your prefix and colors. Preview real SVG symbols rendered with React.</p></div><div><span className="step-number">03</span><h3>Ship a fresh sprite</h3><p>Use the generated URL in your app. Changed bytes get a new content-hashed filename.</p></div></section>
    </main><footer><a className="brand footer-brand" href={github}><span className="brand-mark small"><i/><i/><i/><i/></span><strong>tiny-isprite.</strong></a><p>A little less icon chaos.</p><a href="https://ko-fi.com/dynation" target="_blank" rel="noreferrer">Built by Dynation <span>↗</span></a></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
