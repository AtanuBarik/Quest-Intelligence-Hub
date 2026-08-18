const S={docs:[],chunks:[],qa:null,loading:null,failed:false};
const MODEL="Xenova/distilbert-base-uncased-distilled-squad";
const HF="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const STOP=new Set("a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may might more most of on or our should so than that the their them there these they this those to was we were what when where which who why will with would you your about across based please tell say says".split(" "));
const E={
 file:document.getElementById("fileInput"),browse:document.getElementById("browseFilesButton"),drop:document.getElementById("dropZone"),list:document.getElementById("fileList"),
 files:document.getElementById("fileCount"),chunks:document.getElementById("chunkCount"),words:document.getElementById("wordCount"),clear:document.getElementById("clearFilesButton"),
 chat:document.getElementById("chatBody"),form:document.getElementById("chatForm"),q:document.getElementById("questionInput"),send:document.getElementById("sendButton"),
 fresh:document.getElementById("newChatButton"),tpl:document.getElementById("messageTemplate"),status:document.getElementById("privacyStatus")
};
const fmt=new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1});
const esc=v=>String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const norm=t=>String(t||"").replace(/\u0000/g," ").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").replace(/[ \t]{2,}/g," ").trim();
const tok=t=>(String(t).toLowerCase().match(/[a-z0-9][a-z0-9'%-]*/g)||[]).filter(x=>x.length>1&&!STOP.has(x));
const ext=n=>String(n).toLowerCase().split(".").pop();
const sentences=t=>(norm(t).replace(/\n+/g," ").match(/[^.!?]+(?:[.!?]+|$)/g)||[]).map(x=>x.trim()).filter(x=>x.length>25);
const label=c=>c.loc&&c.loc!=="Document"?`${c.name} - ${c.loc}`:c.name;
function status(text,mode="ready"){
 E.status.classList.remove("status-ready","status-loading","status-error");E.status.classList.add(`status-${mode}`);E.status.innerHTML=`<span class="status-dot"></span>${esc(text)}`;
}
function banner(text){removeBanner();const x=document.createElement("div");x.id="processingBanner";x.className="processing-banner";x.textContent=text;E.chat.prepend(x)}
function removeBanner(){document.getElementById("processingBanner")?.remove()}
function chunk(text,name,loc,docId){
 const t=norm(text),out=[];let start=0;while(start<t.length){let end=Math.min(start+1300,t.length);const v=t.slice(start,end).trim();if(v){const ts=tok(v);out.push({id:`c-${Math.random()}`,docId,name,loc,text:v,tokens:ts,set:new Set(ts)})}if(end>=t.length)break;start=Math.max(start+1,end-180)}return out;
}
async function pdf(file){
 if(!window.__pdf){const p=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");p.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";window.__pdf=p}
 const d=await window.__pdf.getDocument({data:await file.arrayBuffer()}).promise,out=[];for(let i=1;i<=d.numPages;i++){const p=await d.getPage(i),c=await p.getTextContent(),t=c.items.map(x=>x.str).join(" ");if(t.trim())out.push({text:t,loc:`Page ${i}`})}return out;
}
async function parse(file){
 const x=ext(file.name);if(x==="pdf")return pdf(file);
 if(x==="docx"){if(!window.mammoth)throw Error("DOCX parser unavailable");const r=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return[{text:r.value,loc:"Document"}]}
 if(["xlsx","xls"].includes(x)){if(!window.XLSX)throw Error("Spreadsheet parser unavailable");const w=window.XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});return w.SheetNames.map(n=>({text:window.XLSX.utils.sheet_to_csv(w.Sheets[n],{blankrows:false}),loc:`Sheet: ${n}`})).filter(s=>s.text.trim())}
 if(["txt","md","csv","json"].includes(x))return[{text:await file.text(),loc:"Document"}];throw Error(`Unsupported file type: .${x}`);
}
function render(){
 const ready=S.docs.filter(d=>d.ok);E.files.textContent=ready.length;E.chunks.textContent=fmt.format(S.chunks.length);E.words.textContent=fmt.format(ready.reduce((a,d)=>a+d.words,0));
 if(!S.docs.length){E.list.innerHTML='<div class="empty-files">No project files loaded yet.</div>';return}
 E.list.innerHTML=S.docs.map(d=>`<div class="file-row ${d.err?"error":""}"><div class="file-type">${esc(ext(d.name).toUpperCase().slice(0,5))}</div><div><div class="file-name" title="${esc(d.name)}">${esc(d.name)}</div><div class="file-meta">${d.err?esc(d.err):d.ok?`${d.count} evidence chunks`:"Reading file..."}</div></div><button class="file-remove" type="button" data-remove="${d.id}">x</button></div>`).join("");
 E.list.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{S.docs=S.docs.filter(d=>d.id!==b.dataset.remove);S.chunks=S.chunks.filter(c=>c.docId!==b.dataset.remove);render();if(!S.chunks.length)status("Upload files to begin")});
}
async function add(files){
 files=[...files];if(!files.length)return;banner(`Reading and indexing ${files.length} project file${files.length===1?"":"s"}...`);E.send.disabled=true;
 for(const f of files){if(S.docs.some(d=>d.name===f.name&&d.size===f.size))continue;const d={id:`d-${Date.now()}-${Math.random()}`,name:f.name,size:f.size,ok:false,err:null,count:0,words:0};S.docs.push(d);render();try{const parts=await parse(f),cs=parts.flatMap(p=>chunk(p.text,f.name,p.loc,d.id));if(!cs.length)throw Error("No readable text found");S.chunks.push(...cs);d.ok=true;d.count=cs.length;d.words=cs.reduce((a,c)=>a+c.tokens.length,0)}catch(e){d.err=e.message||"File could not be read"}render()}
 removeBanner();E.send.disabled=false;E.file.value="";const n=S.docs.filter(d=>d.ok).length;if(n)status(`${n} file${n===1?"":"s"} ready for local AI`);
}
function retrieve(q,limit=6){
 const qt=tok(q);if(!S.chunks.length)return[];const df=new Map(qt.map(t=>[t,S.chunks.reduce((n,c)=>n+(c.set.has(t)?1:0),0)]));
 let ranked=S.chunks.map(c=>{let s=0;for(const t of qt){const n=c.tokens.reduce((a,x)=>a+(x===t?1:0),0);s+=Math.min(n,7)*Math.log(1+(S.chunks.length+1)/((df.get(t)||0)+1));if(c.name.toLowerCase().includes(t))s+=2}return{c,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
 if(!ranked.length&&/(summar|overview|finding|theme|expert|interview|survey|disagree|compare)/i.test(q))ranked=S.chunks.map(c=>({c,s:.5}));
 const out=[],per=new Map();for(const x of ranked){const n=per.get(x.c.docId)||0;if(n>=3)continue;out.push(x);per.set(x.c.docId,n+1);if(out.length>=limit)break}return out;
}
function bestSentence(text,q,answer=""){
 const ss=sentences(text),a=answer.toLowerCase();const exact=ss.find(s=>a&&s.toLowerCase().includes(a));if(exact)return exact;const qs=new Set(tok(q));return ss.sort((x,y)=>tok(y).filter(t=>qs.has(t)).length-tok(x).filter(t=>qs.has(t)).length)[0]||text.slice(0,360);
}
async function model(){
 if(S.qa)return S.qa;if(S.failed)throw Error("Local model unavailable");if(S.loading)return S.loading;
 S.loading=(async()=>{status("Loading local AI model...","loading");banner("Downloading the free QA model to this browser. The first question can take longer; later questions reuse the browser cache.");try{const{pipeline,env}=await import(HF);env.allowLocalModels=false;S.qa=await pipeline("question-answering",MODEL,{dtype:"q8"});status("Local AI ready");return S.qa}catch(e){console.error(e);S.failed=true;status("Local AI unavailable - evidence fallback active","error");throw e}finally{S.loading=null;removeBanner()}})();return S.loading;
}
function fallback(q,rs,prefix="The local AI model could not run, so here is the strongest direct evidence from your files:"){
 const qt=new Set(tok(q)),cand=[];rs.forEach((r,i)=>sentences(r.c.text).forEach(s=>cand.push({s,i,score:tok(s).filter(t=>qt.has(t)).length+r.s/4})));cand.sort((a,b)=>b.score-a.score);const chosen=[],seen=new Set();for(const x of cand){const k=x.s.toLowerCase().replace(/[^a-z0-9]+/g," ").slice(0,100);if(seen.has(k))continue;seen.add(k);chosen.push(x);if(chosen.length===4)break}
 const src=[],map=new Map(),cite=i=>{const l=label(rs[i].c);if(!map.has(l)){src.push(l);map.set(l,src.length)}return map.get(l)};return{html:`<p>${esc(prefix)}</p><ul>${chosen.map(x=>`<li>${esc(x.s)} <strong>[${cite(x.i)}]</strong></li>`).join("")}</ul>`,src};
}
async function answer(q){
 if(!S.chunks.length)return{html:"<p><strong>No project file is loaded.</strong> Click Choose files or drag files into the upload area, then ask again.</p>",src:[]};const rs=retrieve(q);if(!rs.length)return{html:"<p>I could not find relevant evidence in the uploaded files for that question. I will not answer from outside knowledge.</p>",src:[]};
 let qa;try{qa=await model()}catch(_){return fallback(q,rs)}banner("Running local AI over the most relevant passages from your uploaded files...");const hits=[];try{for(let i=0;i<rs.length;i++){try{const o=await qa(q,rs[i].c.text,{top_k:1}),r=Array.isArray(o)?o[0]:o,a=String(r?.answer||"").trim(),score=Number(r?.score||0);if(a.length>1&&score>=.025)hits.push({a,score,i,support:bestSentence(rs[i].c.text,q,a),combined:score*(1+Math.min(rs[i].s,8)/8)})}catch(e){console.warn(e)}}}finally{removeBanner()}
 hits.sort((a,b)=>b.combined-a.combined);const u=[],seen=new Set();for(const h of hits){const k=h.a.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();if(!k||seen.has(k))continue;seen.add(k);u.push(h);if(u.length===4)break}if(!u.length)return fallback(q,rs,"The local AI did not find a reliable answer span, so here is the strongest direct evidence from your files:");
 const src=[],map=new Map(),cite=i=>{const l=label(rs[i].c);if(!map.has(l)){src.push(l);map.set(l,src.length)}return map.get(l)},broad=/(summar|overview|finding|theme|expert|interview|survey|disagree|compare)/i.test(q);let html="";
 if(!broad&&u[0].score>=.06){const x=u[0],n=cite(x.i);html=`<p><strong>Answer:</strong> ${esc(x.a)} <strong>[${n}]</strong></p><p><strong>Supporting evidence:</strong> ${esc(x.support)} <strong>[${n}]</strong></p>`;if(u[1]&&u[1].score>=.04){const y=u[1],m=cite(y.i);html+=`<p><strong>Additional evidence:</strong> ${esc(y.support)} <strong>[${m}]</strong></p>`}}
 else html=`<p>The local AI found these strongest answers in the uploaded project evidence:</p><ul>${u.map(x=>`<li><strong>${esc(x.a)}</strong> - ${esc(x.support)} <strong>[${cite(x.i)}]</strong></li>`).join("")}</ul>`;
 html+=`<span class="confidence">${u[0].score>=.3?"Strong":u[0].score>=.08?"Moderate":"Low-confidence"} local QA match - restricted to uploaded files</span>`;return{html,src};
}
function msg(role,html,src=[]){const f=E.tpl.content.cloneNode(true),a=f.querySelector(".message"),av=f.querySelector(".message-avatar"),l=f.querySelector(".message-label"),t=f.querySelector(".message-text"),s=f.querySelector(".sources");a.classList.add(role);av.textContent=role==="assistant"?"AI":"You";l.textContent=role==="assistant"?"Insights Copilot":"You";t.innerHTML=role==="assistant"?html:`<p>${esc(html)}</p>`;if(src.length)s.innerHTML=src.map((x,i)=>`<span class="source-chip" title="${esc(x)}">[${i+1}] ${esc(x)}</span>`).join("");E.chat.appendChild(f);E.chat.scrollTop=E.chat.scrollHeight}
async function ask(q){q=String(q||"").trim();if(!q)return;document.getElementById("welcomeCard")?.remove();msg("user",q);E.send.disabled=true;try{const r=await answer(q);msg("assistant",r.html,r.src)}catch(e){console.error(e);msg("assistant","<p>A browser-side processing error occurred. Reload the page, re-upload the file, and try again.</p>")}finally{E.send.disabled=false}}
function welcome(){E.chat.innerHTML='<div class="welcome-card" id="welcomeCard"><div class="copilot-avatar">AI</div><h2>Ask your uploaded project files</h2><p>Choose files on the left, then ask a question. Insights Copilot retrieves relevant passages and runs a local question-answering model over that evidence.</p><div class="suggestion-grid"><button class="suggestion">What are the most important findings?</button><button class="suggestion">What themes recur across expert interviews?</button><button class="suggestion">What does the survey data say about customer priorities?</button><button class="suggestion">Where do the sources disagree?</button></div></div>';bindSuggestions()}
function bindSuggestions(){document.querySelectorAll(".suggestion").forEach(b=>b.onclick=()=>ask(b.textContent))}
async function manifest(){try{const r=await fetch("project-files/manifest.json",{cache:"no-store"});if(!r.ok)return;const j=await r.json(),fs=[];for(const e of Array.isArray(j.files)?j.files:[]){const p=typeof e==="string"?e:e.path;if(!p)continue;try{const x=await fetch(encodeURI(p),{cache:"no-store"});if(!x.ok)continue;const b=await x.blob(),n=typeof e==="object"&&e.name?e.name:decodeURIComponent(p.split("/").pop());fs.push(new File([b],n,{type:b.type}))}catch(_){}}if(fs.length)await add(fs)}catch(_){}}
E.browse.onclick=e=>{e.preventDefault();E.file.click()};E.file.onchange=e=>add(e.target.files);["dragenter","dragover"].forEach(n=>E.drop.addEventListener(n,e=>{e.preventDefault();E.drop.classList.add("is-dragging")}));["dragleave","drop"].forEach(n=>E.drop.addEventListener(n,e=>{e.preventDefault();E.drop.classList.remove("is-dragging")}));E.drop.ondrop=e=>add(e.dataTransfer.files);E.clear.onclick=()=>{S.docs=[];S.chunks=[];render();status("Upload files to begin")};E.fresh.onclick=welcome;E.q.oninput=()=>{E.q.style.height="auto";E.q.style.height=`${Math.min(E.q.scrollHeight,150)}px`};E.q.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();E.form.requestSubmit()}};E.form.onsubmit=e=>{e.preventDefault();const q=E.q.value;if(!q.trim())return;E.q.value="";E.q.style.height="auto";ask(q)};
render();bindSuggestions();status("Upload files to begin");manifest();