function isTypingTarget(el){
  return !!el && (el.tagName==='INPUT' || el.tagName==='TEXTAREA' || el.isContentEditable);
}

function initBackTop(){
  const btn=document.getElementById('back-top');
  if(!btn)return;
  btn.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
}

function initIndexHandlers(){
  const searchInput=document.getElementById('search-input');
  if(searchInput){
    searchInput.addEventListener('input',e=>{
      if(typeof window.onSearch==='function')window.onSearch(e.target.value);
    });
  }

  const searchClear=document.getElementById('search-clear');
  if(searchClear){
    searchClear.addEventListener('click',()=>{
      if(typeof window.clearSearch==='function')window.clearSearch();
    });
  }

  const readerBtn=document.getElementById('reader-btn');
  if(readerBtn){
    readerBtn.addEventListener('click',()=>{
      if(typeof window.toggleReader==='function')window.toggleReader();
    });
  }

  document.addEventListener('click',e=>{
    const a=e.target.closest('a,button,span');
    if(!a)return;

    const openPostId=a.getAttribute('data-open-post');
    if(openPostId){
      e.preventDefault();
      if(typeof window.openPost==='function')window.openPost(openPostId);
      return;
    }

    const action=a.getAttribute('data-action');
    if(action==='close-post'){
      e.preventDefault();
      if(typeof window.closePost==='function')window.closePost();
      return;
    }
    if(action==='history-back'){
      e.preventDefault();
      history.back();
      return;
    }

    const tag=a.getAttribute('data-filter-tag');
    const ns=a.getAttribute('data-ns');
    if(ns && tag!=null){
      e.preventDefault();
      const t=tag===''?null:tag;
      const btn=a.classList.contains('tag-filter-btn') ? a : null;
      if(typeof window.filterTag==='function')window.filterTag(t,ns,btn);
      const goAfter=a.getAttribute('data-go');
      if(goAfter && typeof window.go==='function')window.go(goAfter);
      return;
    }

    const go=a.getAttribute('data-go');
    if(go){
      e.preventDefault();
      if(typeof window.go==='function')window.go(go);
      return;
    }
  });

  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter' && e.key!==' ')return;
    if(isTypingTarget(e.target))return;
    const el=e.target.closest('[data-filter-tag],[data-open-post],[data-go],[data-action]');
    if(!el)return;
    e.preventDefault();
    el.click();
  });
}

function init404(){
  if(!document.body.classList.contains('page-404'))return;

  const msgs=[
    { emoji:'🕳️', msg:'// buraco negro detectado', note:'a página caiu nessa dimensão e sumiu.', sub:'clique para voltar antes que você também suma.' },
    { emoji:'👻', msg:'// assombrado e inacessível', note:'a página foi embora, mas o fantasma ficou.', sub:'f para pagar respeitos.' },
    { emoji:'🦗', msg:'// só grilos por aqui', note:'tinha algo aqui. tinha. juramos.', sub:'o servidor também não faz ideia do que aconteceu.' },
    { emoji:'🧩', msg:'// peça faltando', note:'alguém removeu essa parte do quebra-cabeça.', sub:'o restante do site sobreviveu, porém.' },
    { emoji:'🌫️', msg:'// rota evaporada', note:'esta URL se dissolveu no ar de madrugada.', sub:'o arquivo segue existindo em outro link.' },
    { emoji:'📡', msg:'// sinal perdido', note:'transmissão interrompida. estática infinita.', sub:'tente sintonizar em outra frequência.' },
    { emoji:'🐌', msg:'// a página foi embora devagar', note:'levou as malas. deixou só esse erro.', sub:'não deixou nem bilhete.' },
    { emoji:'🔮', msg:'// futuro sombrio para essa URL', note:'a bola de cristal diz que a página não volta.', sub:'mas o arquivo principal ainda respira.' },
    { emoji:'🗿', msg:'// imóvel e vazio', note:'nem a estátua sabe onde está a página.', sub:'a escultura apenas observa. sem respostas.' },
    { emoji:'🌒', msg:'// a página foi para o lado escuro', note:'não é pessoal. simplesmente desapareceu.', sub:'o universo deletou e não deixou lixeira.' },
    { emoji:'🐛', msg:'// bug encontrado... ou você é o bug?', note:'reflexão: quem é o 404 aqui?', sub:'a filosofia não resolve, mas é bonita.' },
    { emoji:'📭', msg:'// caixa de correio vazia', note:'esperamos. a carta nunca chegou.', sub:'o endereço pode ter mudado. ou nunca existiu.' },
    { emoji:'🧊', msg:'// congelado para sempre', note:'a página estava aqui. agora é gelo digital.', sub:'beleza cristalina. utilidade zero.' },
    { emoji:'🎲', msg:'// acesso aleatório: falhou', note:'o dado rolou e tirou 404.', sub:'recarregue para uma nova mensagem. é isso.' },
  ];

  const r=msgs[Math.floor(Math.random()*msgs.length)];
  const emojiEl=document.getElementById('emoji');
  const msgEl=document.getElementById('msg');
  const noteEl=document.getElementById('note');
  const subEl=document.getElementById('subnote');
  if(emojiEl)emojiEl.textContent=r.emoji;
  if(msgEl)msgEl.textContent=r.msg;
  if(noteEl)noteEl.textContent=r.note;
  if(subEl)subEl.textContent=r.sub;

  const row=document.getElementById('static-row');
  if(row){
    row.innerHTML='';
    for(let i=0;i<20;i++){
      const d=document.createElement('div');
      d.className='px';
      d.style.opacity=(Math.random()*0.4+0.1).toFixed(2);
      row.appendChild(d);
    }
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  initBackTop();
  initIndexHandlers();
  init404();
});