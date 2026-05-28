let DATA=null,currentSection='inicio',activeTag=null,searchQuery='',readerMode=false,currentPostId=null,activeProjTag=null,twDone=false;

async function loadData(){
  const local=localStorage.getItem('bydan_content');
  if(local){try{DATA=JSON.parse(local);}catch(e){}}
  if(!DATA){try{const r=await fetch('data/content.json?v='+Date.now());DATA=await r.json();}catch(e){DATA={};}}
  render();
}

function render(){
  const m=DATA.meta||{};
  const siteTitle=(m.siteTitle||'bydan')+' — arquivo pessoal';
  const siteDesc=m.siteSub||'Arquivo pessoal de bydan: projetos, blog, stack e contato.';
  setText('site-title',m.siteTitle||'bydan');
  setText('site-sub',m.siteSub||'');
  setText('site-sym',m.siteSym||'✦');
  setText('marquee',m.marquee||'');
  setText('footer-sym',m.footerSym||'✦');
  setText('footer-info',m.footerInfo||'');
  document.title=siteTitle;
  setMeta('og:title',siteTitle);
  setMeta('og:description',siteDesc);
  setMetaName('description',siteDesc);
  setMetaName('twitter:title',siteTitle);
  setMetaName('twitter:description',siteDesc);
  document.getElementById('site-badges').innerHTML=(m.badges||[]).map(b=>'<span class="px-badge">'+esc(b)+'</span>').join('');
  if(!twDone)startTypewriter(m.typewriterMsg||'');
  document.getElementById('novidades').innerHTML=(DATA.novidades||[]).map(n=>'<div class="i-box"><div class="i-box-title">'+esc(n.title)+'</div>'+(n.lines||[]).map(l=>'<p>'+esc(l)+'</p>').join('')+'</div>').join('');
  const pub=(DATA.posts||[]).filter(p=>p.status==='published');
  document.getElementById('recent-posts').innerHTML=pub.slice(0,2).map(renderPostCard).join('')||'<div class="empty-state">// nenhuma transmissão ainda</div>';
  renderBlog();
  renderProjetos();
  const s=DATA.sobre||{};
  const av=s.avatar||'D';
  const avBox=document.getElementById('avatar');
  if(avBox){
    if(av.startsWith('http')||av.startsWith('data:')){
      avBox.innerHTML='<img class="avatar-img" src="'+esc(av)+'" alt="avatar">';
      avBox.style.padding='0';avBox.style.overflow='hidden';
    }else{avBox.textContent=av;avBox.style.padding='';}
  }
  document.getElementById('sobre-text').innerHTML=(s.paragraphs||[]).map(p=>'<p>'+esc(p)+'</p>').join('')+(s.handnote?'<span class="handnote">'+esc(s.handnote)+'</span>':'');
  const f=DATA.filosofia||{};
  setText('filo-quote',f.quote||'');
  document.getElementById('filo-paras').innerHTML=(f.paragraphs||[]).map(p=>'<p>'+esc(p)+'</p>').join('');
  document.getElementById('stack-table').innerHTML=(DATA.stack||[]).map(s=>'<div class="st-row"><span class="st-name">'+esc(s.name)+'</span><div class="st-bar"><div class="st-fill" data-pct="'+s.pct+'"></div></div><span class="st-level">'+esc(s.level)+'</span></div>').join('');
  setTimeout(()=>document.querySelectorAll('.st-fill').forEach(el=>el.style.width=el.dataset.pct+'%'),100);
  const c=DATA.contato||{};
  setText('contato-note',c.note||'');
  document.getElementById('contato-links').innerHTML=(c.links||[]).map(l=>'<div class="c-row"><span class="c-key">'+esc(l.key)+'</span><a class="c-val" href="'+esc(l.href)+'" target="_blank" rel="noopener">'+esc(l.val)+'</a></div>').join('');
}

function renderBlog(){
  const posts=(DATA.posts||[]).filter(p=>p.status==='published');
  const tags=[...new Set(posts.flatMap(p=>p.tags||[]))];
  const el=document.getElementById('blog-tag-filter');
  el.innerHTML=tags.length?[
    '<button class="tag-filter-btn on" type="button" data-filter-tag="" data-ns="blog">todos</button>',
    ...tags.map(t=>'<button class="tag-filter-btn" type="button" data-filter-tag="'+escAttr(t)+'" data-ns="blog">'+esc(t)+'</button>')
  ].join(''):'';
  renderBlogPosts(posts);
}

function renderBlogPosts(posts){
  let f=posts;
  if(activeTag)f=f.filter(p=>(p.tags||[]).includes(activeTag));
  if(searchQuery){const q=searchQuery.toLowerCase();f=f.filter(p=>(p.title||'').toLowerCase().includes(q)||(p.excerpt||'').toLowerCase().includes(q)||(p.tags||[]).some(t=>t.toLowerCase().includes(q)));}
  const cnt=document.getElementById('search-results-count');
  if(searchQuery||activeTag){cnt.style.display='block';cnt.textContent='// '+f.length+' resultado'+(f.length!==1?'s':'')+' encontrado'+(f.length!==1?'s':'');}
  else cnt.style.display='none';
  document.getElementById('blog-posts').innerHTML=f.length?f.map(renderPostCard).join(''):'<div class="empty-state">// nenhum resultado encontrado</div>';
}

function renderProjetos(){
  const projs=(DATA.projetos||[]).filter(p=>p.status==='published');
  const tags=[...new Set(projs.flatMap(p=>p.tags||[]))];
  const el=document.getElementById('proj-tag-filter');
  el.innerHTML=tags.length?[
    '<button class="tag-filter-btn on" type="button" data-filter-tag="" data-ns="proj">todos</button>',
    ...tags.map(t=>'<button class="tag-filter-btn" type="button" data-filter-tag="'+escAttr(t)+'" data-ns="proj">'+esc(t)+'</button>')
  ].join(''):'';
  renderProjCards(projs);
}

function renderProjCards(projs){
  let f=projs;
  if(activeProjTag)f=f.filter(p=>(p.tags||[]).includes(activeProjTag));
  document.getElementById('proj-grid').innerHTML=f.length?f.map(p=>{
    const thumb=p.coverImage?'<img src="'+esc(p.coverImage)+'" alt="'+esc(p.title)+'">'  :'[ capa ]';
    const tags=(p.tags||[]).map(t=>'<span class="proj-tag" role="button" tabindex="0" data-filter-tag="'+escAttr(t)+'" data-ns="proj">'+esc(t)+'</span>').join('');
    return '<div class="proj-card"><div class="proj-thumb">'+thumb+'</div><div class="proj-body"><div class="proj-title">'+esc(p.title)+'</div><div class="proj-desc">'+esc(p.desc)+'</div><div class="proj-tags">'+tags+'</div>'+renderProjLinks(p)+'</div></div>';
  }).join(''):'<div class="empty-state empty-state--span-grid">// nenhum projeto encontrado</div>';
}

function filterTag(tag,ns,btn){
  if(ns==='blog'){activeTag=tag;document.querySelectorAll('#blog-tag-filter .tag-filter-btn').forEach(b=>b.classList.remove('on'));if(btn)btn.classList.add('on');renderBlogPosts((DATA.posts||[]).filter(p=>p.status==='published'));}
  else{activeProjTag=tag;document.querySelectorAll('#proj-tag-filter .tag-filter-btn').forEach(b=>b.classList.remove('on'));if(btn)btn.classList.add('on');renderProjCards((DATA.projetos||[]).filter(p=>p.status==='published'));}
}

function onSearch(val){
  searchQuery=val.trim();
  document.getElementById('search-clear').style.display=val?'block':'none';
  renderBlogPosts((DATA.posts||[]).filter(p=>p.status==='published'));
}

function clearSearch(){
  document.getElementById('search-input').value='';
  searchQuery='';
  document.getElementById('search-clear').style.display='none';
  renderBlogPosts((DATA.posts||[]).filter(p=>p.status==='published'));
}

function renderPostCard(p){
  const rt=readTime(p.content||'');
  const tags=p.tags&&p.tags.length?'<div class="post-tags">'+p.tags.map(t=>'<span class="post-tag" role="button" tabindex="0" data-filter-tag="'+escAttr(t)+'" data-ns="blog" data-go="blog">'+esc(t)+'</span>').join('')+'</div>':'';
  const cover=p.coverImage?'<img class="post-cover" src="'+esc(p.coverImage)+'" alt="'+esc(p.coverAlt||p.title)+'" loading="lazy">':'';
  return '<div class="post"><div class="post-date">'+esc(p.date)+'<span class="read-time">~'+rt+' min de leitura</span></div><div class="post-title">'+esc(p.title)+'</div><div class="post-excerpt">'+esc(p.excerpt)+'</div>'+tags+'<div class="post-readmore"><a class="read-more" data-open-post="'+escAttr(p.id)+'" href="#">[ seguir lendo &rarr; ]</a></div>'+cover+'</div>';
}

function renderProjLinks(p){
  const links=[];
  if(p.links&&p.links.itch)links.push('<a class="proj-link" href="'+esc(p.links.itch)+'" target="_blank" rel="noopener">[ itch ]</a>');
  if(p.links&&p.links.github)links.push('<a class="proj-link" href="'+esc(p.links.github)+'" target="_blank" rel="noopener">[ github ]</a>');
  if(p.links&&p.links.demo)links.push('<a class="proj-link" href="'+esc(p.links.demo)+'" target="_blank" rel="noopener">[ demo ]</a>');
  return links.length?'<div class="proj-links">'+links.join('')+'</div>':'';
}

function readTime(html){
  return Math.max(1,Math.round(html.replace(/<[^>]+>/g,'').split(/\s+/).filter(Boolean).length/200));
}

function openPost(id){
  const posts=(DATA.posts||[]).filter(p=>p.status==='published');
  const post=posts.find(p=>p.id===id);
  if(!post)return;
  currentPostId=id;
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('on'));
  document.querySelectorAll('.nlink').forEach(b=>b.classList.remove('on'));
  const rt=readTime(post.content||'');
  const attach=post.attachments&&post.attachments.length?'<div class="post-attachments"><div class="attach-title">// anexos</div>'+post.attachments.map(a=>'<div class="attach-item"><span class="attach-type">'+esc(a.type)+'</span><a href="'+esc(a.url)+'" target="_blank">'+esc(a.name)+'</a></div>').join('')+'</div>':'';
  const tags=post.tags&&post.tags.length?'<div class="post-tags post-tags--spaced">'+post.tags.map(t=>'<span class="post-tag" role="button" tabindex="0" data-filter-tag="'+escAttr(t)+'" data-ns="blog" data-go="blog">'+esc(t)+'</span>').join('')+'</div>':'';
  const cover=post.coverImage?'<img class="post-view-cover" src="'+esc(post.coverImage)+'" alt="'+esc(post.coverAlt||post.title)+'" loading="lazy">':'';
  document.getElementById('post-view-content').innerHTML='<div class="post-view-meta"><span>'+esc(post.date)+'</span><span>~'+rt+' min de leitura</span></div><div class="post-view-title">'+esc(post.title)+'</div>'+tags+cover+(post.content||'')+attach;
  const idx=posts.indexOf(post);
  const prev=posts[idx+1];
  const next=posts[idx-1];
  document.getElementById('post-nav').innerHTML=(prev?'<a data-open-post="'+escAttr(prev.id)+'" href="#">[ &larr; '+esc(prev.title.slice(0,30))+(prev.title.length>30?'…':'')+' ]</a>':'<span></span>')+(next?'<a data-open-post="'+escAttr(next.id)+'" href="#" class="post-nav-next">[ '+esc(next.title.slice(0,30))+(next.title.length>30?'…':'')+' &rarr; ]</a>':'<span></span>');
  document.querySelector('[data-t="blog"]').classList.add('on');
  const pv=document.getElementById('post-view');
  pv.style.display='block';pv.classList.add('on');
  window.scrollTo(0,0);
}

function closePost(){
  if(readerMode)toggleReader();
  document.getElementById('post-view').style.display='none';
  document.getElementById('post-view').classList.remove('on');
  currentPostId=null;go('blog');
}

function toggleReader(){
  readerMode=!readerMode;
  document.body.classList.toggle('reader-mode',readerMode);
  document.getElementById('reader-btn').classList.toggle('on',readerMode);
  document.getElementById('reader-btn').textContent=readerMode?'[ normal ]':'[ leitura ]';
}

function go(id){
  document.querySelectorAll('.nlink').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('on'));
  document.getElementById('post-view').style.display='none';
  const btn=document.querySelector('[data-t="'+id+'"]');
  const sec=document.getElementById(id);
  if(btn)btn.classList.add('on');
  if(sec)sec.classList.add('on');
  currentSection=id;
  window.scrollTo(0,0);
  if(id==='stack')setTimeout(()=>document.querySelectorAll('.st-fill').forEach(el=>el.style.width=el.dataset.pct+'%'),100);
}

document.querySelectorAll('.nlink').forEach(b=>b.addEventListener('click',()=>go(b.dataset.t)));

const backTop=document.getElementById('back-top');
window.addEventListener('scroll',()=>backTop.classList.toggle('show',window.scrollY>400),{passive:true});

function startTypewriter(msg){
  twDone=true;
  const tw=document.getElementById('tw-text');
  tw.innerHTML='';
  let ti=0;
  function type(){
    if(ti<msg.length){tw.innerHTML+=msg[ti]==='\n'?'<br>':msg[ti];ti++;setTimeout(type,Math.random()*80+20);}
  }
  setTimeout(type,600);
}

const dbtn=document.getElementById('dbtn');
let dark=localStorage.getItem('bydan_dark')==='1';
if(dark){document.body.classList.add('dark');dbtn.textContent='[ modo : escuro ]';}
dbtn.addEventListener('click',()=>{
  dark=!dark;
  document.body.classList.toggle('dark',dark);
  dbtn.textContent=dark?'[ modo : escuro ]':'[ modo : claro ]';
  localStorage.setItem('bydan_dark',dark?'1':'0');
});

let actx,masterGain,playing=false;
const abtn=document.getElementById('abtn');
function initAudio(){
  actx=new(window.AudioContext||window.webkitAudioContext)();
  const m=DATA&&DATA.meta?DATA.meta:{};
  const preset=m.musicPreset||'noise';
  const vol=m.musicVol!=null?m.musicVol:0.35;
  masterGain=actx.createGain();masterGain.gain.value=vol;
  masterGain.connect(actx.destination);
  if((m.musicMode==='url'||m.musicMode==='file')&&(m.musicUrl||m.musicFile)){
    const src=new Audio(m.musicUrl||m.musicFile);
    src.loop=true;src.volume=vol;
    src.play().catch(()=>{});
    window._bydan_audio=src;
    return;
  }
  buildPreset(actx,preset,masterGain);
}
function buildPreset(ctx,preset,out){
  if(preset==='noise'||!preset){
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const d=buf.getChannelData(0);let last=0;
    for(let i=0;i<d.length;i++){let w=Math.random()*2-1;d[i]=(last+0.02*w)/1.02;last=d[i];d[i]*=3.5;}
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
    const flt=ctx.createBiquadFilter();flt.type='lowpass';flt.frequency.value=350;
    src.connect(flt);flt.connect(out);src.start();
  }else if(preset==='rain'){
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.3*(Math.random()<0.003?5:1);
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
    const flt=ctx.createBiquadFilter();flt.type='bandpass';flt.frequency.value=1200;flt.Q.value=0.5;
    src.connect(flt);flt.connect(out);src.start();
  }else if(preset==='drone'){
    const o=ctx.createOscillator();o.type='sine';o.frequency.value=80;
    const o2=ctx.createOscillator();o2.type='sine';o2.frequency.value=80.5;
    o.connect(out);o2.connect(out);o.start();o2.start();
  }else if(preset==='glitch'){
    const buf=ctx.createBuffer(1,ctx.sampleRate*0.5,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()<0.05?(Math.random()*2-1):0;
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
    const flt=ctx.createBiquadFilter();flt.type='highpass';flt.frequency.value=200;
    src.connect(flt);flt.connect(out);src.start();
  }else if(preset==='cassette'){
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const d=buf.getChannelData(0);let last=0;
    for(let i=0;i<d.length;i++){let w=Math.random()*2-1;d[i]=(last+0.05*w)/1.05;last=d[i];}
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
    const flt=ctx.createBiquadFilter();flt.type='lowpass';flt.frequency.value=800;
    const flt2=ctx.createBiquadFilter();flt2.type='highpass';flt2.frequency.value=120;
    src.connect(flt);flt.connect(flt2);flt2.connect(out);src.start();
  }
}
abtn.addEventListener('click',()=>{
  if(!actx){initAudio();playing=true;abtn.textContent='[ som : on ]';return;}
  if(window._bydan_audio){window._bydan_audio.paused?window._bydan_audio.play():window._bydan_audio.pause();}
  else{playing?(actx.suspend()):(actx.resume());}
  playing?(abtn.textContent='[ som : off ]'):(abtn.textContent='[ som : on ]');
  playing=!playing;
});

function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function setMeta(prop,val){const el=document.querySelector('meta[property="'+prop+'"]');if(el)el.setAttribute('content',val);}
function setMetaName(name,val){const el=document.querySelector('meta[name="'+name+'"]');if(el)el.setAttribute('content',val);}
function esc(str){if(!str)return '';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(str){return esc(str).replace(/'/g,'&#39;');}

window.addEventListener('storage',e=>{
  if(e.key==='bydan_content'){try{DATA=JSON.parse(e.newValue);render();}catch(err){}}
});

loadData();
