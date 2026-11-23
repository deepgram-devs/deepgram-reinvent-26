/* <deepgram-data-grid> from @deepgram-devs/dg-brand-ui 0.6.0 (source b8553b56c1489989) */
"use strict";(()=>{var J=Object.defineProperty;var V=e=>{throw TypeError(e)};var Y=(e,t,d)=>t in e?J(e,t,{enumerable:!0,configurable:!0,writable:!0,value:d}):e[t]=d;var P=(e,t,d)=>Y(e,typeof t!="symbol"?t+"":t,d),B=(e,t,d)=>t.has(e)||V("Cannot "+d);var s=(e,t,d)=>(B(e,t,"read from private field"),d?d.call(e):t.get(e)),k=(e,t,d)=>t.has(e)?V("Cannot add the same private member more than once"):t instanceof WeakSet?t.add(e):t.set(e,d),S=(e,t,d,f)=>(B(e,t,"write to private field"),f?f.call(e,d):t.set(e,d),d),c=(e,t,d)=>(B(e,t,"access private method"),d);var $={settings:"Settings",close:"Close",back:"Back",viewOnly:"View only",builtWith:"Built with",you:"You",copy:"Copy link",copied:"Copied",openInNewTab:"(opens in a new tab)",appearance:"Appearance",themeDark:"Dark",themeLight:"Light",themeSystem:"System",themeNote:"Changes the record and this panel. The call screens stay dark.",themeNoteSystemDark:"Follows your device, which is set to dark right now.",themeNoteSystemLight:"Follows your device, which is set to light right now.",live:"Live",ended:"Ended",listening:"Listening",thinking:"Thinking",searching:"Searching",paused:"Paused",connecting:"Connecting\u2026",startConversation:"Start conversation",micNote:"Talk naturally. We\u2019ll ask for microphone access.",sessionTitle:"Voice session",assistant:"Assistant",speaking:"Speaking",functionCall:"Function call",running:"running",done:"done",cancelled:"cancelled",tryAsking:"Try asking",mute:"Mute microphone",unmute:"Unmute microphone",endConversation:"End conversation",liveNote:"Conversation is live. Just talk, and interrupt anytime.",pausedNote:"Paused. Close settings to keep talking.",endedNote:"This conversation has ended.",transcript:"Transcript",conversation:"Conversation",openConversation:"Open the conversation",dockLive:"Conversation is live. Just talk.",callLabel:(e,t,d)=>`Function call ${e}, ${t}. ${d?"Hide":"Show"} the request.`,open:"Open",breadcrumb:"Breadcrumb",results:"Results",lastUpdated:e=>`Last updated ${e}`,scanToOpen:"Scan to open",noRows:"No matches.",sortBy:"Sort by",sortOption:(e,t,d)=>`${e}, ${d?t==="asc"?"low to high":"high to low":t==="asc"?"A to Z":"Z to A"}`,qrLabel:e=>`QR code for ${e}`};var Z=new Intl.Collator(void 0,{numeric:!0,sensitivity:"base"});function Q(e){return e==null||e===""?null:e instanceof Date?e.getTime():typeof e=="boolean"?e?1:0:e}function F(e,t,d){let f=d==="asc"?1:-1;return e.map(m=>({item:m,value:Q(t(m))})).sort((m,h)=>m.value===null||h.value===null?m.value===h.value?0:m.value===null?1:-1:typeof m.value=="number"&&typeof h.value=="number"?f*(m.value-h.value):f*Z.compare(String(m.value),String(h.value))).map(({item:m})=>m)}function D(e){if(!e)return null;let[t,d]=e.trim().split(":");return t?{key:t,direction:d==="desc"?"desc":"asc"}:null}var _=`
deepgram-data-grid {
  --dg-ink: var(--color-ink, #1d1d1d);
  --dg-ink-3: var(--color-ink-3, #3a3835);
  --dg-fg-paper: var(--color-fg, #1d1d1d);
  --dg-paper: var(--color-paper, #fcfaf8);
  --dg-card: var(--color-card, #ffffff);
  --dg-line: var(--color-line, #e8e5e0);
  --dg-muted: var(--color-muted, #6b6862);
  --dg-magenta: var(--color-magenta, #e042ff);
  --dg-lime: var(--color-lime, #7cd941);
  --dg-orange: var(--color-orange, #fa8100);
  --dg-red: var(--color-red, #eb2a2e);
  --dg-sans: var(--font-sans, "Work Sans", ui-sans-serif, system-ui, sans-serif);
  --dg-mono: var(--font-mono, "Azeret Mono", ui-monospace, monospace);
  --dg-radius: var(--radius-card, 1.25rem);

  /* What changes with the tone */
  --dg-fg: var(--dg-fg-paper);
  --dg-fg-muted: var(--dg-muted);
  --dg-rule: var(--dg-line);
  --dg-hover: var(--dg-paper);
  --dg-lit: color-mix(in srgb, var(--dg-magenta) 10%, var(--dg-card));
  --dg-neutral: color-mix(in srgb, var(--dg-fg-paper) 6%, transparent);

  display: block;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  color: var(--dg-fg);
  background: var(--dg-card);
  border: 1px solid var(--dg-rule);
  border-radius: var(--dg-radius);
  font-family: var(--dg-sans);
  font-size: 1rem;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* The dark theme flips the paper surface. Pages with the kit's theme set --color-*; these are for pages without it */
:root[data-theme="dark"] deepgram-data-grid {
  --dg-fg-paper: var(--color-fg, #fcfaf8);
  --dg-paper: var(--color-paper, #141413);
  --dg-card: var(--color-card, #201f1e);
  --dg-line: var(--color-line, #353331);
  --dg-muted: var(--color-muted, #a19d96);
}

/* Frosted glass on the stage */
deepgram-data-grid[tone="stage"] {
  --dg-fg: #fff;
  --dg-fg-muted: rgb(255 255 255 / 0.7);
  --dg-rule: rgb(255 255 255 / 0.15);
  --dg-hover: rgb(255 255 255 / 0.1);
  --dg-lit: color-mix(in srgb, var(--dg-magenta) 20%, transparent);
  --dg-neutral: rgb(255 255 255 / 0.2);
  background: rgb(255 255 255 / 0.05);
  border-color: rgb(255 255 255 / 0.1);
  border-radius: 1.5rem;
  backdrop-filter: blur(20px);
}

deepgram-data-grid table { width: 100%; border-collapse: collapse; text-align: left; }

deepgram-data-grid caption,
deepgram-data-grid .dg-sortbar label,
deepgram-data-grid thead th,
deepgram-data-grid .dg-status,
deepgram-data-grid td.dg-go::before,
deepgram-data-grid td::before {
  font-family: var(--dg-mono);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

deepgram-data-grid caption {
  padding: 1.5rem 1.5rem 1rem;
  font-size: 0.75rem;
  line-height: 1rem;
  text-align: left;
  color: color-mix(in srgb, var(--dg-fg) 80%, transparent);
}

deepgram-data-grid thead :is(th, td) {
  padding: 0.75rem 1rem;
  font-size: 0.7rem;
  line-height: 1rem;
  white-space: nowrap;
  color: var(--dg-fg-muted);
  border-bottom: 1px solid var(--dg-rule);
}
deepgram-data-grid th[aria-sort] { color: var(--dg-fg); }
deepgram-data-grid th:first-child,
deepgram-data-grid td:first-child { padding-left: 1.5rem; }
deepgram-data-grid th:last-child,
deepgram-data-grid td:last-child { padding-right: 1.5rem; }

deepgram-data-grid tbody td { padding: 0.875rem 1rem; vertical-align: middle; }
deepgram-data-grid tbody tr + tr { border-top: 1px solid var(--dg-rule); }
deepgram-data-grid [data-numeric] { text-align: right; font-variant-numeric: tabular-nums; }
deepgram-data-grid td.dg-primary { font-weight: 600; white-space: nowrap; }
deepgram-data-grid [data-nowrap] { white-space: nowrap; }

deepgram-data-grid .dg-sort-button,
deepgram-data-grid .dg-open {
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: none;
}
deepgram-data-grid .dg-sort-button { display: inline-flex; align-items: center; gap: 0.375rem; border-radius: 999px; }
deepgram-data-grid th[data-numeric] .dg-sort-button { flex-direction: row-reverse; }
deepgram-data-grid .dg-sort-button svg { width: 0.875rem; height: 0.875rem; flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
deepgram-data-grid .dg-sort-button:hover svg { opacity: 0.5; }
deepgram-data-grid th[aria-sort] .dg-sort-button svg { opacity: 1; }
deepgram-data-grid th[aria-sort="descending"] .dg-sort-button svg { transform: rotate(180deg); }
deepgram-data-grid .dg-open { border-radius: 0.125rem; }
deepgram-data-grid :is(.dg-sort-button, .dg-open, select):focus-visible {
  outline: 2px solid var(--dg-magenta);
  outline-offset: 4px;
}

/* Rows that open */
deepgram-data-grid tr.dg-openable { cursor: pointer; transition: background-color 0.15s; }
deepgram-data-grid tr.dg-openable:hover { background-color: var(--dg-hover); }
deepgram-data-grid tr.dg-openable:hover .dg-open { text-decoration: underline; text-underline-offset: 4px; }
deepgram-data-grid td.dg-go { width: 2.5rem; text-align: right; color: var(--dg-fg-muted); transition: color 0.15s; }
deepgram-data-grid tr:hover td.dg-go { color: var(--dg-magenta); }
deepgram-data-grid td.dg-go::before { content: none; }

/* Rows the agent points at: tinted, a magenta edge, and one glow */
deepgram-data-grid tr.dg-lit { background-color: var(--dg-lit); animation: dg-glow 2.6s ease-out 1; }
deepgram-data-grid tr.dg-lit > td:first-child { box-shadow: inset 3px 0 0 var(--dg-magenta); }
@keyframes dg-glow {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dg-magenta) 55%, transparent); }
  25% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--dg-magenta) 35%, transparent); }
  100% { box-shadow: 0 0 0 0 transparent; }
}

/* Status pills: <span class="dg-status" data-tone="good">Delivered</span> */
deepgram-data-grid .dg-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  line-height: 1rem;
  white-space: nowrap;
  color: var(--dg-fg);
  background: var(--dg-neutral);
}
deepgram-data-grid .dg-status::before { content: ""; width: 0.375rem; height: 0.375rem; border-radius: 999px; background: currentColor; }
deepgram-data-grid .dg-status[data-tone="review"] { background: var(--dg-orange); color: var(--dg-ink); }
deepgram-data-grid .dg-status[data-tone="good"] { background: var(--dg-lime); color: var(--dg-ink); }
deepgram-data-grid .dg-status[data-tone="bad"] { background: var(--dg-red); color: #fff; }
deepgram-data-grid .dg-status[data-tone="done"] { background: var(--dg-ink-3); color: #fff; }

deepgram-data-grid .dg-empty { margin: 0; padding: 2rem 1.5rem; font-size: 1.125rem; color: var(--dg-fg-muted); }
deepgram-data-grid .dg-sortbar { display: none; }

/* Phones (below Tailwind's sm): no frame, each row a card, and a select for the sort */
@media (width < 40rem) {
  deepgram-data-grid,
  deepgram-data-grid[tone="stage"] {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow: visible;
    padding: 0;
    background: none;
    border: 0;
    backdrop-filter: none;
  }
  deepgram-data-grid table { display: contents; }
  deepgram-data-grid caption { order: 0; display: block; padding: 0 0.25rem; }
  deepgram-data-grid .dg-sortbar { order: 1; display: flex; align-items: center; gap: 0.75rem; padding: 0 0.25rem; }
  deepgram-data-grid thead { display: none; }
  deepgram-data-grid tbody { order: 2; display: flex; flex-direction: column; gap: 0.75rem; }
  deepgram-data-grid .dg-empty { order: 2; padding: 0 0.25rem; }

  deepgram-data-grid tbody tr,
  deepgram-data-grid tbody tr + tr {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 2rem;
    padding: 1.25rem;
    background-color: var(--dg-card);
    border: 1px solid var(--dg-line);
    border-radius: var(--dg-radius);
  }
  deepgram-data-grid[tone="stage"] tbody tr,
  deepgram-data-grid[tone="stage"] tbody tr + tr {
    background-color: rgb(255 255 255 / 0.1);
    border-color: rgb(255 255 255 / 0.2);
    border-radius: 1.5rem;
    backdrop-filter: blur(12px);
  }
  deepgram-data-grid tbody tr.dg-lit { background-color: var(--dg-lit); box-shadow: 0 0 0 2px var(--dg-magenta); }
  deepgram-data-grid tbody tr.dg-lit > td:first-child { box-shadow: none; }

  deepgram-data-grid tbody td,
  deepgram-data-grid tbody td:first-child,
  deepgram-data-grid tbody td:last-child { display: block; max-width: 100%; min-width: 0; padding: 0; text-align: left; }
  deepgram-data-grid tbody td::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.65rem;
    line-height: 1rem;
    color: var(--dg-fg-muted);
  }
  deepgram-data-grid tbody td.dg-primary { order: -1; flex-basis: 100%; font-size: 1.25rem; letter-spacing: -0.01em; white-space: normal; }
  deepgram-data-grid tbody td.dg-primary::before { content: none; }
  deepgram-data-grid tbody td[data-hide-on-phone] { display: none; }
  deepgram-data-grid tbody td.dg-go {
    order: 99;
    flex-basis: 100%;
    width: auto;
    padding-top: 0.75rem;
    border-top: 1px solid var(--dg-rule);
    text-align: right;
    font-family: var(--dg-mono);
    font-size: 0.7rem;
    line-height: 1rem;
  }
  deepgram-data-grid tbody td.dg-go::before { content: attr(data-label) " "; display: inline; margin: 0; font-size: inherit; color: inherit; }

  deepgram-data-grid .dg-sortbar label { flex-shrink: 0; font-size: 0.7rem; line-height: 1rem; color: var(--dg-fg-muted); }
  deepgram-data-grid .dg-sortbar select {
    flex: 1;
    min-width: 0;
    height: 3rem;
    padding: 0 1rem;
    font: inherit;
    font-size: 1.05rem;
    color: var(--dg-fg-paper);
    background: var(--dg-card);
    border: 1px solid var(--dg-line);
    border-radius: 999px;
  }
}

@media (prefers-reduced-motion: reduce) {
  deepgram-data-grid tr.dg-lit { animation: none; }
}
`;var K="deepgram-data-grid-css",X='<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';function ee(e){if(e.getElementById(K))return;let t=e.createElement("style");t.id=K,t.textContent=_,e.head.prepend(t)}function te(e){e.style.animation="none",e.offsetWidth,e.style.animation=""}function H(e){return[...e.cells].filter(t=>!t.classList.contains("dg-go"))}function ne(){var e,t,d,f,m,h,r,N,E,G,q,M,z,W,j,O,U,R,I,L,A;return e=class extends HTMLElement{constructor(){super(...arguments);k(this,r);k(this,t,[]);k(this,d,new MutationObserver(()=>c(this,r,q).call(this)));k(this,f,!1);k(this,m,!1);k(this,h,!1);k(this,L,a=>{let n=a.target;if(!(n instanceof HTMLSelectElement)||!n.closest(".dg-sortbar"))return;let i=D(n.value);i&&c(this,r,I).call(this,i)});k(this,A,a=>{let n=a.target,i=n.closest(".dg-sort-button");if(i&&this.contains(i)){let p=i.closest("th")?.dataset.dgKey;if(!p)return;let b=this.sort;c(this,r,I).call(this,{key:p,direction:b?.key===p&&b.direction==="asc"?"desc":"asc"});return}let l=n.closest("tbody tr.dg-openable");if(!l||!this.contains(l))return;let g=n.closest("a, button, input, select, textarea, label, summary");if(g&&!g.classList.contains("dg-open"))return;let u=new CustomEvent("row-open",{detail:{id:l.dataset.id??null,row:l},bubbles:!0,cancelable:!0}),T=this.dispatchEvent(u);if(g instanceof HTMLAnchorElement){T||a.preventDefault();return}let o=l.dataset.href;!o||!T||(a.metaKey||a.ctrlKey?window.open(o,"_blank","noopener"):window.location.assign(o))})}connectedCallback(){ee(this.ownerDocument),this.addEventListener("click",s(this,A)),this.addEventListener("change",s(this,L)),s(this,d).observe(this,{childList:!0,subtree:!0}),S(this,h,!0),c(this,r,z).call(this)}disconnectedCallback(){s(this,d).disconnect(),this.removeEventListener("click",s(this,A)),this.removeEventListener("change",s(this,L)),S(this,h,!1)}attributeChangedCallback(a,n,i){!s(this,h)||n===i||(a==="sort"?c(this,r,M).call(this,()=>c(this,r,O).call(this)):a==="pointed"?c(this,r,M).call(this,()=>c(this,r,R).call(this,!0)):c(this,r,q).call(this))}get sort(){return D(this.getAttribute("sort"))}set sort(a){let n=typeof a=="string"?D(a):a;n?this.setAttribute("sort",`${n.key}:${n.direction}`):this.removeAttribute("sort")}pointAt(a){let n=a.join(" ");this.getAttribute("pointed")===n?c(this,r,M).call(this,()=>c(this,r,R).call(this,!0)):this.setAttribute("pointed",n)}clear(){this.removeAttribute("pointed")}},t=new WeakMap,d=new WeakMap,f=new WeakMap,m=new WeakMap,h=new WeakMap,r=new WeakSet,N=function(){return this.querySelector(":scope > table")},E=function(){return[...s(this,r,N)?.tBodies[0]?.rows??[]]},G=function(a,n){return this.getAttribute(a)??$[n]},q=function(){s(this,m)||s(this,f)||(S(this,f,!0),queueMicrotask(()=>{S(this,f,!1),s(this,h)&&c(this,r,z).call(this)}))},M=function(a){S(this,m,!0);try{a()}finally{s(this,d).takeRecords(),S(this,m,!1)}},z=function(){c(this,r,M).call(this,()=>{let a=s(this,r,N),n=a?.tHead?.rows[0];if(!a||!n)return;let i=H(n);S(this,t,i.map((o,p)=>({th:o,key:o.dataset.key||String(p),label:(o.querySelector(".dg-label")??o).textContent?.trim()??"",numeric:o.hasAttribute("data-numeric"),sortable:o.dataset.sortable!=="false",hideOnPhone:o.hasAttribute("data-hide-on-phone"),nowrap:o.hasAttribute("data-nowrap")})));let l=Math.max(0,i.findIndex(o=>o.hasAttribute("data-primary")));for(let o of s(this,t)){let{th:p}=o;if(p.scope="col",p.dataset.dgKey=o.key,o.sortable&&!p.querySelector(".dg-sort-button")){let b=this.ownerDocument.createElement("button");b.type="button",b.className="dg-sort-button";let y=this.ownerDocument.createElement("span");y.className="dg-label",y.append(...p.childNodes),b.append(y),b.insertAdjacentHTML("beforeend",X),p.append(b)}}let g=this.hasAttribute("openable"),u=!1;for(let o of s(this,r,E)){H(o).forEach((v,w)=>{let C=s(this,t)[w];C&&(v.hasAttribute("data-label")||(v.dataset.label=C.label),v.toggleAttribute("data-numeric",C.numeric),v.toggleAttribute("data-hide-on-phone",C.hideOnPhone),v.toggleAttribute("data-nowrap",C.nowrap),v.classList.toggle("dg-primary",w===l))});let p=o.dataset.href,b=!!p||g;o.classList.toggle("dg-openable",b),u||(u=b);let y=H(o)[l];if(b&&y&&!y.querySelector(".dg-open")){let v=y.querySelector("a[href]");if(v)v.classList.add("dg-open");else{let w=this.ownerDocument.createElement(p?"a":"button");w.className="dg-open",w instanceof HTMLAnchorElement?w.href=p:w.type="button",w.append(...y.childNodes),y.append(w)}}let x=[...o.cells].find(v=>v.classList.contains("dg-go"));b&&!x&&(x=this.ownerDocument.createElement("td"),x.className="dg-go",x.setAttribute("aria-hidden","true"),x.textContent="\u2192",o.append(x)),x&&(x.dataset.label=c(this,r,G).call(this,"open-label","open"))}let T=[...n.cells].find(o=>o.classList.contains("dg-go"));if(u&&!T){let o=this.ownerDocument.createElement("td");o.className="dg-go",o.setAttribute("aria-hidden","true"),n.append(o)}c(this,r,W).call(this,a),c(this,r,j).call(this,a),c(this,r,O).call(this),c(this,r,R).call(this,!1)})},W=function(a){let n=this.querySelector(":scope > .dg-empty");if(s(this,r,E).length){n?.remove();return}n||(n=this.ownerDocument.createElement("p"),n.className="dg-empty",a.after(n)),n.textContent=c(this,r,G).call(this,"empty-label","noRows")},j=function(a){let n=s(this,t).filter(g=>g.sortable),i=this.querySelector(":scope > .dg-sortbar");if(!n.length||!s(this,r,E).length){i?.remove();return}if(!i){i=this.ownerDocument.createElement("div"),i.className="dg-sortbar";let g=`dg-sort-${Math.random().toString(36).slice(2,8)}`;i.innerHTML=`<label for="${g}"></label><select id="${g}"></select>`,a.before(i)}i.querySelector("label").textContent=c(this,r,G).call(this,"sort-label","sortBy"),i.querySelector("select").replaceChildren(...n.flatMap(g=>["asc","desc"].map(u=>new Option($.sortOption(g.label,u,g.numeric),`${g.key}:${u}`))))},O=function(){let a=this.sort,n=a?s(this,t).findIndex(o=>o.key===a.key):-1;for(let[o,p]of s(this,t).entries())o===n?p.th.setAttribute("aria-sort",a.direction==="asc"?"ascending":"descending"):p.th.removeAttribute("aria-sort");let i=this.querySelector(":scope > .dg-sortbar select");i&&(i.querySelector("option[value='']")?.remove(),n<0?i.prepend(new Option("\u2014","",!0,!0)):i.value=`${a.key}:${a.direction}`);let l=s(this,r,N)?.tBodies[0];if(!l||n<0)return;let g=s(this,t)[n],u=s(this,r,E),T=F(u,o=>c(this,r,U).call(this,o,n,g.numeric),a.direction);T.every((o,p)=>o===u[p])||l.append(...T)},U=function(a,n,i){let l=H(a)[n];if(!l)return null;let g=(l.dataset.sort??l.textContent??"").trim();if(!i||g==="")return g;let u=Number.parseFloat(g.replace(/[^\d.-]/g,""));return Number.isNaN(u)?null:u},R=function(a){let n=(this.getAttribute("pointed")??"").split(/\s+/).filter(Boolean),i;for(let l of s(this,r,E)){let g=!!l.dataset.id&&n.includes(l.dataset.id);l.classList.toggle("dg-lit",g),g&&(a&&te(l),l.dataset.id===n[0]&&(i=l))}a&&i?.scrollIntoView({behavior:"smooth",block:"nearest"})},I=function(a){this.sort=a,this.dispatchEvent(new CustomEvent("sort-change",{detail:a,bubbles:!0}))},L=new WeakMap,A=new WeakMap,P(e,"observedAttributes",["sort","pointed","sort-label","open-label","empty-label","openable"]),e}function re(){typeof window>"u"||!window.customElements||customElements.get("deepgram-data-grid")||customElements.define("deepgram-data-grid",ne())}re();})();
