/* Admin panel logic extracted from admin/index.html */

/* ══════════════════════════════════════════════════════AUTH══════════════════════════════════════════════════════ */const SALT='SALT-SECRETO-DAN_';const DEFAULT_PASS_HASH='297ba64bfa1f3c64033b9722fc010f5a90314d1f5443bdc2aeea0dcb8419d9ff';let loginAttempts=0;const MAX_ATTEMPTS = 5;let lockedUntil = 0;async function sha256(msg) {const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');}async function hashPassword(pass) { return sha256(SALT + pass); }async function verifyPassword(pass) {const stored = localStorage.getItem('bydan_pass_hash') || DEFAULT_PASS_HASH;const hash = await hashPassword(pass);if (hash === stored) return true;const legacy = await sha256(pass);if (legacy === stored) { localStorage.setItem('bydan_pass_hash', hash); return true; }return false;}async function doLogin() {const now = Date.now();if (now < lockedUntil) {const secs = Math.ceil((lockedUntil - now) / 1000);showLoginErr(`bloqueado. aguarde ${secs}s.`);return;}const pass = document.getElementById('login-pass').value;if (!pass) return;if (await verifyPassword(pass)) {loginAttempts = 0;localStorage.setItem('bydan_session', Date.now().toString());document.getElementById('login-screen').classList.add('is-hidden');document.getElementById('admin-app').classList.add('visible');initAdmin();} else {loginAttempts++;document.getElementById('login-err').classList.add('is-visible');if (loginAttempts >= MAX_ATTEMPTS) {lockedUntil = Date.now() + 60000;showLoginErr(`muitas tentativas. aguarde 60s.`);} else {document.getElementById('login-attempts').textContent = `tentativa ${loginAttempts}/${MAX_ATTEMPTS}`;}}}function showLoginErr(msg) {const el = document.getElementById('login-err');el.textContent = msg; el.classList.add('is-visible');}function doLogout() {localStorage.removeItem('bydan_session');location.reload();}function checkSession() {const s = localStorage.getItem('bydan_session');if (s && Date.now() - parseInt(s) < 8 * 3600000) {document.getElementById('login-screen').classList.add('is-hidden');document.getElementById('admin-app').classList.add('visible');initAdmin();}}document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });checkSession();/* ══════════════════════════════════════════════════════DATA══════════════════════════════════════════════════════ */let DATA = null;let activity = JSON.parse(localStorage.getItem('bydan_activity') || '[]');async function loadData() {
  /* Sempre busca o content.json do servidor primeiro */
  try {
    const r = await fetch('../data/content.json?' + Date.now());
    if (r.ok) { DATA = await r.json(); return; }
  } catch(e) {}
  /* Fallback: usa localStorage se o fetch falhar (offline) */
  try {
    const raw = localStorage.getItem('bydan_content');
    if (raw) { DATA = JSON.parse(raw); return; }
  } catch(e) {}
  DATA = getDefaultData();
}function saveData() {localStorage.setItem('bydan_content', JSON.stringify(DATA));}

async function uploadContentToGitHub(commitMessage, onProgress) {
  const c = loadGithubConfig();
  if (!c.user || !c.repo || !c.token) return { ok: false, reason: 'no-github' };
  const json = JSON.stringify(DATA, null, 2);
  const content = btoa(unescape(encodeURIComponent(json)));
  const apiBase = `https://api.github.com/repos/${c.user}/${c.repo}/contents/${c.path}`;
  const headers = { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
  try {
    onProgress?.(20, '/* verificando arquivo atual... */');
    let sha = null;
    const getResp = await fetch(`${apiBase}?ref=${c.branch}`, { headers });
    if (getResp.ok) sha = (await getResp.json()).sha;
    else if (getResp.status !== 404) {
      const err = await getResp.json();
      throw new Error(err.message || `erro ${getResp.status}`);
    }
    onProgress?.(60, '/* enviando content.json... */');
    const body = { message: commitMessage, content, branch: c.branch, ...(sha ? { sha } : {}) };
    const putResp = await fetch(apiBase, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!putResp.ok) {
      const err = await putResp.json();
      if (putResp.status === 401) throw new Error('token inválido ou expirado. vá em Config → GitHub para renovar.');
      if (putResp.status === 403) throw new Error('sem permissão. o token precisa de Contents: Read & Write.');
      if (putResp.status === 409) throw new Error('conflito de versão. recarregue o admin e tente novamente.');
      throw new Error(err.message || `erro ${putResp.status}`);
    }
    const result = await putResp.json();
    onProgress?.(100, '/* publicado com sucesso! */');
    return { ok: true, sha: result.commit?.sha?.slice(0, 7) || '—' };
  } catch (e) {
    return { ok: false, reason: 'error', message: e.message || 'erro desconhecido' };
  }
}

function contentJsonPayload() {
  return JSON.stringify(DATA, null, 2) + '\n';
}

let contentSaveApiReady = false;

async function probeContentSaveApi() {
  if (location.protocol === 'file:') {
    contentSaveApiReady = false;
    return false;
  }
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      contentSaveApiReady = !!data.canSave;
      return contentSaveApiReady;
    }
  } catch (e) { /* no dev server */ }
  contentSaveApiReady = false;
  return false;
}

async function persistContentViaApi() {
  if (location.protocol === 'file:') {
    return { ok: false, reason: 'file-protocol' };
  }
  const payload = contentJsonPayload();
  const paths = ['/api/content', '/data/content.json'];
  let lastErr = '';
  for (const apiPath of paths) {
    try {
      const r = await fetch(apiPath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        cache: 'no-store'
      });
      if (r.ok) return { ok: true, via: 'local' };
      const err = await r.json().catch(() => ({}));
      lastErr = err.error || `HTTP ${r.status}`;
    } catch (e) {
      lastErr = e.message;
    }
  }
  return { ok: false, reason: 'api-error', message: lastErr };
}

const CONTENT_FILE_DB = 'bydan_admin_files';
const CONTENT_FILE_STORE = 'handles';

function openContentFileDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CONTENT_FILE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(CONTENT_FILE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeContentFileHandle(handle) {
  const db = await openContentFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONTENT_FILE_STORE, 'readwrite');
    tx.objectStore(CONTENT_FILE_STORE).put(handle, 'content_json');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getContentFileHandle() {
  const db = await openContentFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONTENT_FILE_STORE, 'readonly');
    const req = tx.objectStore(CONTENT_FILE_STORE).get('content_json');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function ensureFileWritePermission(handle) {
  let perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return true;
  perm = await handle.requestPermission({ mode: 'readwrite' });
  return perm === 'granted';
}

async function persistViaContentFileHandle() {
  if (!('showOpenFilePicker' in window)) return { ok: false, reason: 'no-fs-api' };
  try {
    const handle = await getContentFileHandle();
    if (!handle) return { ok: false, reason: 'no-handle' };
    if (!(await ensureFileWritePermission(handle))) return { ok: false, reason: 'denied' };
    const writable = await handle.createWritable();
    await writable.write(contentJsonPayload());
    await writable.close();
    return { ok: true, via: 'file', name: handle.name };
  } catch (e) {
    return { ok: false, reason: 'file-error', message: e.message };
  }
}

async function connectContentJsonFile(silent) {
  if (!('showOpenFilePicker' in window)) {
    if (!silent) toast('use Chrome/Edge ou rode: npm run dev', true);
    return false;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'content.json', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    if (!(await ensureFileWritePermission(handle))) {
      if (!silent) toast('permissão de escrita negada', true);
      return false;
    }
    await storeContentFileHandle(handle);
    updateContentFileLinkUI(handle.name);
    if (!silent) toast(`conectado a ${handle.name} — salvar grava no arquivo`);
    return true;
  } catch (e) {
    if (e.name !== 'AbortError' && !silent) toast(e.message || 'erro ao conectar arquivo', true);
    return false;
  }
}

async function ensureContentFileForSave() {
  let file = await persistViaContentFileHandle();
  if (file.ok) return file;
  if (!('showOpenFilePicker' in window)) return file;
  toast('selecione data/content.json do projeto para gravar');
  const linked = await connectContentJsonFile(true);
  if (!linked) return { ok: false, reason: 'no-handle' };
  return persistViaContentFileHandle();
}

async function initContentFileLink() {
  const apiOk = await probeContentSaveApi();
  if (apiOk) {
    updateContentFileLinkUI(null, true);
    return;
  }
  try {
    const handle = await getContentFileHandle();
    if (handle && (await ensureFileWritePermission(handle))) {
      updateContentFileLinkUI(handle.name, false);
      return;
    }
  } catch (e) { /* ignore */ }
  updateContentFileLinkUI(null, false);
}

function updateContentFileLinkUI(name, apiReady) {
  const el = document.getElementById('content-file-status');
  if (!el) return;
  el.classList.remove('is-linked', 'is-error');
  if (apiReady) {
    el.textContent = '// servidor ativo — salvar grava em data/content.json';
    el.classList.add('is-linked');
    return;
  }
  if (name) {
    el.textContent = `// gravando em: ${name}`;
    el.classList.add('is-linked');
    return;
  }
  el.textContent = '// inicie o servidor: npm run dev (na pasta do projeto) e abra http://127.0.0.1:8080/admin/';
  el.classList.add('is-error');
}

async function persistContentJson(opts = {}) {
  const commitMessage = opts.commitMessage || `conteúdo: atualização via admin · ${new Date().toLocaleString('pt-BR')}`;
  saveData();
  const api = await persistContentViaApi();
  if (api.ok) return { ok: true, via: 'local' };
  const file = await ensureContentFileForSave();
  if (file.ok) return { ok: true, via: 'file', name: file.name };
  const gh = await uploadContentToGitHub(commitMessage, opts.onProgress);
  if (gh.ok) return { ok: true, via: 'github', sha: gh.sha };
  return { ok: false, via: 'localStorage', github: gh, api, file };
}

async function finalizeContentSave(activityMsg, successMsg) {
  toast('salvando em data/content.json...');
  const result = await persistContentJson({
    commitMessage: `conteúdo: ${activityMsg} · ${new Date().toLocaleString('pt-BR')}`
  });
  logActivity(activityMsg);
  if (result.ok && result.via === 'local') {
    toast(`${successMsg} · data/content.json atualizado`);
    return result;
  }
  if (result.ok && result.via === 'file') {
    toast(`${successMsg} · ${result.name || 'content.json'} atualizado`);
    return result;
  }
  if (result.ok && result.via === 'github') {
    toast(`${successMsg} · data/content.json no GitHub (${result.sha})`);
    return result;
  }
  toast(`${successMsg} falhou — rode "npm run dev" e abra http://127.0.0.1:8080/admin/`, true);
  return result;
}

function getDefaultData() {return { meta:{siteTitle:'bydan',siteSub:'arquivo pessoal · em deriva',siteSym:'✦ ◌ ✦ ◌ ✦',marquee:'✦ bydan.com.br',footerSym:'✦ ◌ ✦ ◌ ✦',footerInfo:'bydan.com.br · 2026',wanderText:'✦ bydan.com.br · arquivo pessoal · em deriva · ✦',badges:['bydan.com.br'],typewriterMsg:'Um espaço esquecido.'}, sobre:{avatar:'D',paragraphs:['Olá, eu sou Dan.'],handnote:'faço coisas que não deveriam existir.'}, filosofia:{quote:'',paragraphs:[]}, contato:{note:'',links:[]}, stack:[], novidades:[], posts:[], projetos:[] };}function logActivity(msg) {const now = new Date();const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} ${now.toLocaleDateString('pt-BR')}`;activity.unshift({ time, text: msg });if (activity.length > 20) activity.pop();localStorage.setItem('bydan_activity', JSON.stringify(activity));}/* ══════════════════════════════════════════════════════INIT══════════════════════════════════════════════════════ */let darkAdmin = localStorage.getItem('bydan_admin_dark') === '1';if (darkAdmin) document.body.classList.add('dark');function toggleDark() {darkAdmin = !darkAdmin;document.body.classList.toggle('dark', darkAdmin);localStorage.setItem('bydan_admin_dark', darkAdmin ? '1' : '0');}async function initAdmin() {await loadData();renderDashboard();renderBlogList();renderProjList();populateSiteEditor();populateGithubConfig();initContentFileLink();}/* ══════════════════════════════════════════════════════PANELS══════════════════════════════════════════════════════ */function showPanel(id) {document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('on'));document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('on'));document.getElementById('panel-' + id).classList.add('on');document.getElementById('tb-' + id).classList.add('on');}/* ══════════════════════════════════════════════════════DASHBOARD══════════════════════════════════════════════════════ */function renderDashboard() {const posts = DATA.posts || [];const projs = DATA.projetos || [];const published = posts.filter(p => p.status === 'published').length;const drafts = posts.filter(p => p.status === 'draft').length;const scheduled = posts.filter(p => p.scheduledAt).length;const stats = [{ num: posts.length, label: 'posts total' },{ num: published, label: 'publicados' },{ num: drafts, label: 'rascunhos' },{ num: projs.filter(p => p.status === 'published').length, label: 'projetos' },];document.getElementById('dash-stats').innerHTML = stats.map(s =>`<div class="stat-card"><span class="stat-num">${s.num}</span><span class="stat-label">${s.label}</span></div>`).join('');const act = activity.length ? activity.slice(0, 10).map(a =>`<div class="activity-item"><span class="activity-time">${a.time}</span><span class="activity-text">${a.text}</span></div>`).join('') : '<div class="empty-state">// sem atividade registrada</div>';document.getElementById('dash-activity').innerHTML = act;checkTokenExpiry();checkScheduledPosts();}function checkTokenExpiry() {const saved = localStorage.getItem('bydan_gh_token_saved_at');if (!saved || !localStorage.getItem('bydan_gh_token')) return;const days = (Date.now() - parseInt(saved)) / 86400000;const warn = document.getElementById('token-warning');if (days > 75) { 
/* warn 2 weeks before 90 day expiry */
warn.classList.add('is-visible');const remaining = Math.max(0, Math.round(90 - days));warn.querySelector('span') && (warn.innerHTML = warn.innerHTML); 
/* keep */
warn.firstChild.textContent = `⚠ token do github expira em ~${remaining} dia${remaining!==1?'s':''}. `;}}async function checkScheduledPosts() {if (!DATA.posts) return;let changed = false;DATA.posts.forEach(p => {if (p.scheduledAt && p.status === 'draft') {if (new Date(p.scheduledAt) <= new Date()) {p.status = 'published';p.scheduledAt = null;changed = true;logActivity(`publicou automaticamente: "${p.title}"`);}}});if (changed) { await finalizeContentSave('publicação agendada', 'posts agendados publicados'); renderBlogList(); }}/* ══════════════════════════════════════════════════════BLOG LIST══════════════════════════════════════════════════════ */function renderBlogList() {const posts = DATA.posts || [];const el = document.getElementById('blog-list');if (!posts.length) { el.innerHTML = '<div class="empty-state">// nenhum post ainda. clique em "novo post" para começar.</div>'; return; }el.innerHTML = '<div class="item-list" id="sortable-posts">' + posts.map((p,i) => `<div class="item-row" draggable="true" data-id="${p.id}" data-idx="${i}" data-reorder="posts"><span class="item-drag-handle" title="arrastar para reordenar">⠿</span><div class="item-title">${esc(p.title)}</div><div class="item-date">${esc(p.date)}</div>${p.scheduledAt ? `<div class="item-status item-status--scheduled">agendado</div>` :`<div class="item-status status-${p.status}">${p.status === 'published' ? 'publicado' : 'rascunho'}</div>`}<div class="item-actions"><button class="btn btn-sm" data-action="edit-post" data-id="${escAttr(p.id)}">editar</button><button class="btn btn-sm" data-action="duplicate-post" data-id="${escAttr(p.id)}">duplicar</button><button class="btn btn-sm btn-danger" data-action="delete-post" data-id="${escAttr(p.id)}">excluir</button></div></div>`).join('') + '</div>';}function updatePostSlug(title) {const slug = slugify(title);const el = document.getElementById('post-slug');if (el && !el.dataset.manual) el.value = slug;}function removeCover() {document.getElementById('post-cover-data').value = '';document.getElementById('cover-preview').classList.remove('is-visible');document.getElementById('cover-remove-btn').classList.remove('is-visible');document.getElementById('cover-upload-text').textContent = '[ clique ou arraste uma imagem ]';}async function duplicatePost(id) {const p = (DATA.posts||[]).find(x=>x.id===id);if (!p) return;const copy = { ...p, id:'post-'+Date.now(), title: p.title+' (cópia)', status:'draft', slug: p.slug+'-copia', date:'', dateISO:'' };DATA.posts.unshift(copy);await finalizeContentSave(`duplicou post: "${p.title}"`, 'post duplicado como rascunho!');renderBlogList(); renderDashboard();}/* ── DRAG REORDER ── */let dragSrcId = null;function dragStart(e) { dragSrcId = e.currentTarget.dataset.id; e.currentTarget.style.opacity='0.5'; }function dragOver2(e) { e.preventDefault(); }async function dropReorder(e, type) {e.preventDefault();const targetId = e.currentTarget.dataset.id;if (!dragSrcId || dragSrcId === targetId) { resetDragStyles(); return; }if (type === 'posts') {const arr = DATA.posts;const from = arr.findIndex(p=>p.id===dragSrcId);const to = arr.findIndex(p=>p.id===targetId);arr.splice(to,0,arr.splice(from,1)[0]);await finalizeContentSave('reordenou posts', 'ordem dos posts salva'); renderBlogList();} else {const arr = DATA.projetos;const from = arr.findIndex(p=>p.id===dragSrcId);const to = arr.findIndex(p=>p.id===targetId);arr.splice(to,0,arr.splice(from,1)[0]);await finalizeContentSave('reordenou projetos', 'ordem dos projetos salva'); renderProjList();}resetDragStyles();}function resetDragStyles() {document.querySelectorAll('.item-row').forEach(r=>r.style.opacity='');dragSrcId = null;}/* ── FULL PREVIEW ── */function closeFullPreview() {document.getElementById('full-preview-modal').classList.remove('is-visible');}/* ══════════════════════════════════════════════════════POST EDITOR══════════════════════════════════════════════════════ */let postTags = [];let postAttachments = [];let currentEditorTab = 'write';function openPostEditor(id) {postTags = []; postAttachments = [];document.getElementById('post-editing-id').value = '';document.getElementById('post-title').value = '';document.getElementById('post-slug').value = '';document.getElementById('post-slug').dataset.manual = '';document.getElementById('post-date').value = new Date().toISOString().split('T')[0];document.getElementById('post-schedule').value = '';document.getElementById('post-excerpt').value = '';document.getElementById('post-content-editor').innerHTML = '';document.getElementById('post-status').value = 'draft';document.getElementById('cover-preview').classList.remove('is-visible');document.getElementById('cover-remove-btn').classList.remove('is-visible');document.getElementById('post-cover-data').value = '';document.getElementById('cover-upload-text').textContent = '[ clique ou arraste uma imagem ]';document.getElementById('post-editor-title').textContent = 'Novo Post';renderTagChips('post-tags', postTags);renderAttachList();document.getElementById('blog-list').classList.add('is-hidden');document.getElementById('post-editor').classList.remove('is-hidden');document.getElementById('post-editor').scrollIntoView({ behavior: 'smooth' });}function editPost(id) {const p = (DATA.posts || []).find(x => x.id === id);if (!p) return;postTags = [...(p.tags || [])];postAttachments = [...(p.attachments || [])];document.getElementById('post-editing-id').value = p.id;document.getElementById('post-title').value = p.title || '';document.getElementById('post-slug').value = p.slug || '';document.getElementById('post-slug').dataset.manual = p.slug ? '1' : '';document.getElementById('post-date').value = p.dateISO || '';document.getElementById('post-schedule').value = p.scheduledAt || '';document.getElementById('post-excerpt').value = p.excerpt || '';document.getElementById('post-content-editor').innerHTML = p.content || '';document.getElementById('post-status').value = p.status || 'draft';document.getElementById('post-editor-title').textContent = 'Editar Post';if (p.coverImage) {document.getElementById('cover-preview').src = p.coverImage;document.getElementById('cover-preview').classList.add('is-visible');document.getElementById('cover-remove-btn').classList.add('is-visible');document.getElementById('post-cover-data').value = p.coverImage;document.getElementById('cover-upload-text').textContent = '[ imagem selecionada — clique para trocar ]';} else {document.getElementById('cover-preview').classList.remove('is-visible');document.getElementById('cover-remove-btn').classList.remove('is-visible');document.getElementById('post-cover-data').value = '';document.getElementById('cover-upload-text').textContent = '[ clique ou arraste uma imagem ]';}renderTagChips('post-tags', postTags);renderAttachList();document.getElementById('blog-list').classList.add('is-hidden');document.getElementById('post-editor').classList.remove('is-hidden');}function closePostEditor() {document.getElementById('post-editor').classList.add('is-hidden');document.getElementById('blog-list').classList.remove('is-hidden');}async function savePost(statusOverride) {const title = document.getElementById('post-title').value.trim();if (!title) { toast('título obrigatório', true); return; }const editingId = document.getElementById('post-editing-id').value;const dateISO = document.getElementById('post-date').value;const dateParts = dateISO ? dateISO.split('-') : [];const dateDisplay = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : '';const scheduledAt = document.getElementById('post-schedule').value || null;let status = statusOverride || document.getElementById('post-status').value;
/* If scheduled and not yet due, keep as draft */
if (scheduledAt && new Date(scheduledAt) > new Date()) status = 'draft';const post = {id: editingId || 'post-' + Date.now(),slug: document.getElementById('post-slug').value.trim() || slugify(title),title, date: dateDisplay, dateISO,excerpt: document.getElementById('post-excerpt').value.trim(),content: document.getElementById('post-content-editor').innerHTML,tags: [...postTags],coverImage: document.getElementById('post-cover-data').value,coverAlt: title,attachments: [...postAttachments],status, scheduledAt,featured: !editingId};if (!DATA.posts) DATA.posts = [];if (editingId) {const idx = DATA.posts.findIndex(p => p.id === editingId);if (idx > -1) DATA.posts[idx] = post; else DATA.posts.unshift(post);} else { DATA.posts.unshift(post); }const msg = scheduledAt && new Date(scheduledAt) > new Date()? `agendado para ${new Date(scheduledAt).toLocaleString('pt-BR')}`: status === 'published' ? 'post publicado!' : 'rascunho salvo!';await finalizeContentSave(`${status==='published'?'publicou':'salvou rascunho de'} post: "${title}"`, msg);closePostEditor();renderBlogList();renderDashboard();}async function deletePost(id) {const p = (DATA.posts || []).find(x => x.id === id);if (!p) return;if (!confirm(`Excluir "${p.title}"?`)) return;DATA.posts = DATA.posts.filter(x => x.id !== id);await finalizeContentSave(`excluiu post: "${p.title}"`, 'post excluído');renderBlogList();renderDashboard();}/* ══════════════════════════════════════════════════════EDITOR TOOLS══════════════════════════════════════════════════════ */function edCmd(cmd) {document.getElementById('post-content-editor').focus();document.execCommand(cmd, false, null);}function edInsert(type) {const editor = document.getElementById('post-content-editor');editor.focus();const tags = {h2: '<h2>Título</h2>',h3: '<h3>Subtítulo</h3>',p: '<p>Parágrafo...</p>',bq: '<blockquote>Citação...</blockquote>',hr: '<hr>',ul: '<ul><li>Item 1</li><li>Item 2</li></ul>',code: '<pre style="background:var(--bg2);border:1px solid var(--lavender);padding:12px;font-family:monospace;font-size:0.8rem;overflow-x:auto;margin:8px 0;">// código aqui</pre>'};document.execCommand('insertHTML', false, tags[type] || '');}function insertLink() {const url = prompt('URL do link:');if (url) { document.getElementById('post-content-editor').focus(); document.execCommand('createLink', false, url); }}function insertImageEmbed() {const url = prompt('URL da imagem:');if (url) { document.getElementById('post-content-editor').focus(); document.execCommand('insertHTML', false, `<img src="${url}" alt="imagem" style="max-width:100%;border:1px solid var(--lavender);margin:8px 0;">`); }}function insertVideoEmbed() {const url = prompt('URL do vídeo (YouTube, Vimeo ou MP4 direto):');if (!url) return;let html = '';if (url.includes('youtube.com/watch')) {const id = new URL(url).searchParams.get('v');html = `<div style="position:relative;padding-bottom:56.25%;height:0;margin:12px 0;"><iframe src="https://www.youtube.com/embed/${id}" style="position:absolute;inset:0;width:100%;height:100%;border:1px solid var(--lavender);" allowfullscreen></iframe></div>`;} else if (url.includes('youtu.be/')) {const id = url.split('youtu.be/')[1];html = `<div style="position:relative;padding-bottom:56.25%;height:0;margin:12px 0;"><iframe src="https://www.youtube.com/embed/${id}" style="position:absolute;inset:0;width:100%;height:100%;border:1px solid var(--lavender);" allowfullscreen></iframe></div>`;} else if (url.includes('vimeo.com/')) {const id = url.split('vimeo.com/')[1];html = `<div style="position:relative;padding-bottom:56.25%;height:0;margin:12px 0;"><iframe src="https://player.vimeo.com/video/${id}" style="position:absolute;inset:0;width:100%;height:100%;border:1px solid var(--lavender);" allowfullscreen></iframe></div>`;} else {html = `<video controls style="max-width:100%;border:1px solid var(--lavender);margin:8px 0;"><source src="${url}"><a href="${url}">baixar vídeo</a></video>`;}document.getElementById('post-content-editor').focus();document.execCommand('insertHTML', false, html);}function switchEditorTab(tab) {currentEditorTab = tab;document.querySelectorAll('.editor-tab').forEach((el, i) => {el.classList.toggle('on', (i===0&&tab==='write')||(i===1&&tab==='preview')||(i===2&&tab==='fullpreview'));});const editor = document.getElementById('post-content-editor');const preview = document.getElementById('post-content-preview');const toolbar = document.getElementById('editor-toolbar');const fpModal = document.getElementById('full-preview-modal');if (tab === 'write') {editor.classList.remove('is-hidden'); preview.classList.add('is-hidden'); toolbar.classList.remove('is-hidden'); fpModal.style.display='none';} else if (tab === 'preview') {editor.classList.add('is-hidden'); preview.classList.remove('is-hidden'); toolbar.classList.add('is-hidden'); fpModal.style.display='none';preview.innerHTML = editor.innerHTML || '<em style="color:var(--dim)">nada para pré-visualizar</em>';} else if (tab === 'fullpreview') {editor.classList.remove('is-hidden'); preview.classList.add('is-hidden'); toolbar.classList.remove('is-hidden');
/* Show full preview modal */
const title = document.getElementById('post-title').value || '(sem título)';const date = document.getElementById('post-date').value;const tags = postTags;const content = editor.innerHTML;const coverSrc = document.getElementById('post-cover-data').value;document.getElementById('full-preview-content').innerHTML = `<div style="font-family:'VT323',monospace;font-size:0.8rem;color:#b0aac0;letter-spacing:0.15em;margin-bottom:8px;">${date||'sem data'}</div><div style="font-family:'Caveat',cursive;font-size:2.2rem;color:#2e2a3a;line-height:1.2;margin-bottom:12px;">${title}</div>${tags.length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px;">${tags.map(t=>`<span style="font-family:'VT323',monospace;font-size:0.72rem;color:#9b8fbd;border:1px solid #c4b8e0;padding:1px 7px;background:#e8e4f0;">${t}</span>`).join('')}</div>`:''}${coverSrc?`<img src="${coverSrc}" style="width:100%;max-height:280px;object-fit:cover;border:1px solid #c4b8e0;margin-bottom:16px;">`:''}${content}`;fpModal.classList.add('is-visible');fpModal.scrollTop = 0;}}/* ══════════════════════════════════════════════════════TAGS══════════════════════════════════════════════════════ */let projTags = [];function handleTagKey(e, ns) {if (e.key === 'Enter' || e.key === ',') {e.preventDefault();const val = e.target.value.trim().replace(/,/g,'');if (!val) return;if (ns === 'post-tags' && !postTags.includes(val)) { postTags.push(val); renderTagChips('post-tags', postTags); }if (ns === 'proj-tags' && !projTags.includes(val)) { projTags.push(val); renderTagChips('proj-tags', projTags); }e.target.value = '';}}function removeTag(ns, tag) {if (ns === 'post-tags') { postTags = postTags.filter(t => t !== tag); renderTagChips('post-tags', postTags); }if (ns === 'proj-tags') { projTags = projTags.filter(t => t !== tag); renderTagChips('proj-tags', projTags); }}function renderTagChips(ns, tags) {const wrap = document.getElementById(ns + '-wrap');const input = document.getElementById(ns + '-input');wrap.innerHTML = '';tags.forEach(t => {const chip = document.createElement('div');chip.className = 'tag-chip';chip.innerHTML = `${esc(t)}<button class="tag-chip-del" data-action="remove-tag" data-ns="${escAttr(ns)}" data-tag="${escAttr(t)}">×</button>`;wrap.appendChild(chip);});wrap.appendChild(input);}/* ══════════════════════════════════════════════════════FILE UPLOADS══════════════════════════════════════════════════════ */function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag'); }function dropFile(e, target) {e.preventDefault(); e.currentTarget.classList.remove('drag');const files = e.dataTransfer.files;if (target === 'cover') handleCoverFiles(files);else if (target === 'proj-cover') handleProjCoverFiles(files);else handleAttachFiles(files);}function handleCoverUpload(input) { handleCoverFiles(input.files); }function handleCoverFiles(files) {if (!files[0]) return;const file = files[0];if (!file.type.startsWith('image/')) { toast('apenas imagens para capa', true); return; }if (file.size > 5 * 1024 * 1024) { toast('imagem muito grande (max 5MB)', true); return; }const reader = new FileReader();reader.onload = e => {const data = e.target.result;document.getElementById('post-cover-data').value = data;const prev = document.getElementById('cover-preview');prev.src = data; prev.classList.add('is-visible');document.getElementById('cover-upload-text').textContent = `[ ${file.name} ]`;};reader.readAsDataURL(file);}function handleProjCoverUpload(input) { handleProjCoverFiles(input.files); }function handleProjCoverFiles(files) {if (!files[0]) return;const file = files[0];if (!file.type.startsWith('image/')) { toast('apenas imagens para capa', true); return; }const reader = new FileReader();reader.onload = e => {const data = e.target.result;document.getElementById('proj-cover-data').value = data;const prev = document.getElementById('proj-cover-preview');prev.src = data; prev.classList.add('is-visible');document.getElementById('proj-cover-text').textContent = `[ ${file.name} ]`;};reader.readAsDataURL(file);}function handleAttachUpload(input) { handleAttachFiles(input.files); }function handleAttachFiles(files) {Array.from(files).forEach(file => {if (file.size > 20 * 1024 * 1024) { toast(`${file.name} muito grande (max 20MB)`, true); return; }const reader = new FileReader();reader.onload = e => {const type = getFileType(file.type, file.name);postAttachments.push({ name: file.name, url: e.target.result, type, size: formatSize(file.size) });renderAttachList();};reader.readAsDataURL(file);});}function renderAttachList() {const el = document.getElementById('attach-list');el.innerHTML = postAttachments.map((a, i) => `<div class="attachment-item"><span class="attachment-type">${a.type}</span><span class="attachment-name">${esc(a.name)}</span><span class="attachment-size">${a.size}</span><button class="attachment-del" data-action="remove-attach" data-index="${i}">×</button></div>`).join('');}function removeAttach(i) { postAttachments.splice(i, 1); renderAttachList(); }function getFileType(mime, name) {if (mime.startsWith('image/')) return 'img';if (mime.startsWith('video/')) return 'video';if (mime === 'application/pdf') return 'pdf';if (name.endsWith('.zip') || name.endsWith('.rar')) return 'zip';return 'file';}function formatSize(bytes) {if (bytes < 1024) return bytes + 'B';if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';return (bytes/(1024*1024)).toFixed(1) + 'MB';}/* ══════════════════════════════════════════════════════PROJECTS══════════════════════════════════════════════════════ */function renderProjList() {const projs = DATA.projetos || [];const el = document.getElementById('proj-list');if (!projs.length) { el.innerHTML = '<div class="empty-state">// nenhum projeto ainda.</div>'; return; }el.innerHTML = '<div class="item-list">' + projs.map((p,i) => `<div class="item-row" draggable="true" data-id="${p.id}" data-idx="${i}" data-reorder="projs"><span style="color:var(--dim);font-family:var(--vt);font-size:1rem;cursor:grab;padding:0 4px;">⠿</span><div class="item-title">${esc(p.title)}</div><div class="item-date">${esc(p.year||'')}</div><div class="item-status status-${p.status}">${p.status === 'published' ? 'publicado' : 'rascunho'}</div><div class="item-actions"><button class="btn btn-sm" data-action="edit-proj" data-id="${escAttr(p.id)}">editar</button><button class="btn btn-sm btn-danger" data-action="delete-proj" data-id="${escAttr(p.id)}">excluir</button></div></div>`).join('') + '</div>';}function openProjEditor() {projTags = [];document.getElementById('proj-editing-id').value = '';document.getElementById('proj-title').value = '';document.getElementById('proj-year').value = new Date().getFullYear();document.getElementById('proj-desc').value = '';document.getElementById('proj-longdesc').value = '';document.getElementById('proj-status').value = 'published';document.getElementById('proj-link-itch').value = '';document.getElementById('proj-link-github').value = '';document.getElementById('proj-link-demo').value = '';document.getElementById('proj-cover-preview').classList.remove('is-visible');document.getElementById('proj-cover-data').value = '';document.getElementById('proj-cover-text').textContent = '[ clique ou arraste uma imagem ]';document.getElementById('proj-editor-title').textContent = 'Novo Projeto';renderTagChips('proj-tags', projTags);document.getElementById('proj-list').classList.add('is-hidden');document.getElementById('proj-editor').classList.remove('is-hidden');}function editProj(id) {const p = (DATA.projetos || []).find(x => x.id === id);if (!p) return;projTags = [...(p.tags || [])];document.getElementById('proj-editing-id').value = p.id;document.getElementById('proj-title').value = p.title || '';document.getElementById('proj-year').value = p.year || '';document.getElementById('proj-desc').value = p.desc || '';document.getElementById('proj-longdesc').value = p.longDesc || '';document.getElementById('proj-status').value = p.status || 'published';document.getElementById('proj-link-itch').value = (p.links && p.links.itch) || '';document.getElementById('proj-link-github').value = (p.links && p.links.github) || '';document.getElementById('proj-link-demo').value = (p.links && p.links.demo) || '';document.getElementById('proj-editor-title').textContent = 'Editar Projeto';if (p.coverImage) {document.getElementById('proj-cover-preview').src = p.coverImage;document.getElementById('proj-cover-preview').classList.add('is-visible');document.getElementById('proj-cover-data').value = p.coverImage;document.getElementById('proj-cover-text').textContent = '[ imagem selecionada ]';} else {document.getElementById('proj-cover-preview').classList.remove('is-visible');document.getElementById('proj-cover-data').value = '';}renderTagChips('proj-tags', projTags);document.getElementById('proj-list').classList.add('is-hidden');document.getElementById('proj-editor').classList.remove('is-hidden');}function closeProjEditor() {document.getElementById('proj-editor').classList.add('is-hidden');document.getElementById('proj-list').classList.remove('is-hidden');}async function saveProj() {const title = document.getElementById('proj-title').value.trim();if (!title) { toast('nome obrigatório', true); return; }const editingId = document.getElementById('proj-editing-id').value;const proj = {id: editingId || 'proj-' + Date.now(),title, slug: slugify(title),year: document.getElementById('proj-year').value,desc: document.getElementById('proj-desc').value.trim(),longDesc: document.getElementById('proj-longdesc').value.trim(),tags: [...projTags],coverImage: document.getElementById('proj-cover-data').value,links: {itch: document.getElementById('proj-link-itch').value.trim(),github: document.getElementById('proj-link-github').value.trim(),demo: document.getElementById('proj-link-demo').value.trim()},status: document.getElementById('proj-status').value};if (!DATA.projetos) DATA.projetos = [];if (editingId) {const idx = DATA.projetos.findIndex(p => p.id === editingId);if (idx > -1) DATA.projetos[idx] = proj; else DATA.projetos.push(proj);} else {DATA.projetos.push(proj);}await finalizeContentSave(`salvou projeto: "${title}"`, 'projeto salvo');closeProjEditor();renderProjList();renderDashboard();}async function deleteProj(id) {const p = (DATA.projetos || []).find(x => x.id === id);if (!p) return;if (!confirm(`Excluir "${p.title}"?`)) return;DATA.projetos = DATA.projetos.filter(x => x.id !== id);await finalizeContentSave(`excluiu projeto: "${p.title}"`, 'projeto excluído');renderProjList();renderDashboard();}/* ══════════════════════════════════════════════════════SITE EDITOR══════════════════════════════════════════════════════ */async function reloadSiteContent() {
  try {
    const r = await fetch('../data/content.json?' + Date.now());
    if (r.ok) { DATA = await r.json(); populateSiteEditor(); toast('dados carregados do servidor!'); return; }
  } catch(e) {}
  populateSiteEditor(); toast('usando dados locais');
}

function populateSiteEditor() {const m = DATA.meta || {};setVal('s-siteTitle', m.siteTitle || '');setVal('s-siteSub', m.siteSub || '');setVal('s-siteSym', m.siteSym || '');setVal('s-marquee', m.marquee || '');setVal('s-wanderText', m.wanderText || '');setVal('s-typewriterMsg', (m.typewriterMsg || '').replace(/\\n/g,'\n'));setVal('s-badges', (m.badges || []).join(', '));setVal('s-footerSym', m.footerSym || '');setVal('s-footerInfo', m.footerInfo || '');const s = DATA.sobre || {};setVal('s-avatar', s.avatar || '');setVal('s-sobre-paras', (s.paragraphs || []).join('\n'));setVal('s-handnote', s.handnote || '');const f = DATA.filosofia || {};setVal('s-filo-quote', f.quote || '');setVal('s-filo-paras', (f.paragraphs || []).join('\n'));renderNovidades();renderStackEditor();renderContactLinksEditor();}async function saveSiteContent() {if (!DATA.meta) DATA.meta = {};if (!DATA.sobre) DATA.sobre = {};if (!DATA.filosofia) DATA.filosofia = {};if (!DATA.contato) DATA.contato = {};DATA.meta.siteTitle = getVal('s-siteTitle');DATA.meta.siteSub = getVal('s-siteSub');DATA.meta.siteSym = getVal('s-siteSym');DATA.meta.marquee = getVal('s-marquee');DATA.meta.wanderText = getVal('s-wanderText');DATA.meta.typewriterMsg = getVal('s-typewriterMsg');DATA.meta.badges = getVal('s-badges').split(',').map(s => s.trim()).filter(Boolean);DATA.meta.footerSym = getVal('s-footerSym');DATA.meta.footerInfo = getVal('s-footerInfo');DATA.sobre.avatar = getVal('s-avatar');DATA.sobre.paragraphs = getVal('s-sobre-paras').split('\n').map(s => s.trim()).filter(Boolean);DATA.sobre.handnote = getVal('s-handnote');DATA.filosofia.quote = getVal('s-filo-quote');DATA.filosofia.paragraphs = getVal('s-filo-paras').split('\n').map(s => s.trim()).filter(Boolean);DATA.contato.note = getVal('s-contato-note');
/* Novidades */
DATA.novidades = [];document.querySelectorAll('.nov-item').forEach(item => {const title = item.querySelector('.nov-title').value.trim();const lines = item.querySelector('.nov-lines').value.split('\n').map(s => s.trim()).filter(Boolean);if (title) DATA.novidades.push({ title, lines });});
/* Stack */
DATA.stack = [];document.querySelectorAll('.stack-edit-row').forEach(row => {const name = row.querySelector('.se-name').value.trim();const pct = parseInt(row.querySelector('.se-pct').value) || 0;const level = row.querySelector('.se-level').value.trim();if (name) DATA.stack.push({ name, pct, level });});
/* Contact links */
DATA.contato.links = [];document.querySelectorAll('.contact-link-row').forEach(row => {const key = row.querySelector('.cl-key').value.trim();const val = row.querySelector('.cl-val').value.trim();const href = row.querySelector('.cl-href').value.trim();if (key && val) DATA.contato.links.push({ key, val, href });});await finalizeContentSave('atualizou conteúdo do site', 'conteúdo salvo');}/* Novidades editor */function renderNovidades() {const nov = DATA.novidades || [];const wrap = document.getElementById('s-novidades-wrap');wrap.innerHTML = nov.map((n, i) => `<div class="nov-item"><div class="nov-item-head"><span class="label-inline">// caixa ${i+1}</span><button class="btn btn-sm btn-danger" data-action="remove-nov-item">remover</button></div><div class="form-group"><label class="form-label">título</label><input class="form-input nov-title" type="text" value="${esc(n.title)}"></div><div class="form-group"><label class="form-label">linhas (uma por linha)</label><textarea class="form-textarea nov-lines" rows="2">${esc((n.lines||[]).join('\n'))}</textarea></div></div>`).join('') +`<button class="btn btn-sm" data-action="add-novidade">+ adicionar caixa</button>`;setVal('s-contato-note', (DATA.contato || {}).note || '');}function addNovidade() {const wrap = document.getElementById('s-novidades-wrap');const btn = wrap.querySelector('button:last-child');const div = document.createElement('div');div.className = 'nov-item';div.style.cssText = 'margin-bottom:16px;border:1px solid var(--lavender);padding:16px;';div.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span class="label-inline">// nova caixa</span><button class="btn btn-sm btn-danger" data-action="remove-nov-item">remover</button></div><div class="form-group"><label class="form-label">título</label><input class="form-input nov-title" type="text" placeholder="// título"></div><div class="form-group"><label class="form-label">linhas</label><textarea class="form-textarea nov-lines" rows="2" placeholder="linha 1&#10;linha 2"></textarea></div>`;wrap.insertBefore(div, btn);}/* Stack editor */function renderStackEditor() {const stack = DATA.stack || [];document.getElementById('s-stack-rows').innerHTML = stack.map(s => `<div class="stack-edit-row"><input class="form-input se-name" type="text" value="${esc(s.name)}" placeholder="ferramenta"><input type="range" class="se-pct" min="0" max="100" value="${s.pct}" data-action="stack-pct"><span class="se-pct-val">${s.pct}%</span><input class="form-input se-level" type="text" value="${esc(s.level)}" placeholder="nível"><button class="btn btn-sm btn-danger" data-action="remove-stack-row">×</button></div>`).join('');}function addStackRow() {const wrap = document.getElementById('s-stack-rows');const div = document.createElement('div');div.className = 'stack-edit-row';div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';div.innerHTML = `<input class="form-input se-name" type="text" placeholder="ferramenta" style="flex:2;"><input type="range" class="se-pct" min="0" max="100" value="50" data-action="stack-pct" style="flex:1;"><span style="font-family:var(--vt);font-size:0.78rem;color:var(--dim);width:38px;">50%</span><input class="form-input se-level" type="text" placeholder="nível" style="flex:1;"><button class="btn btn-sm btn-danger" data-action="remove-stack-row">×</button>`;wrap.appendChild(div);}/* Contact links editor */function renderContactLinksEditor() {const links = (DATA.contato || {}).links || [];document.getElementById('s-contato-links-wrap').innerHTML = links.map(l => `<div class="contact-link-row"><input class="form-input cl-key" type="text" value="${esc(l.key)}" placeholder="chave"><input class="form-input cl-val" type="text" value="${esc(l.val)}" placeholder="texto exibido"><input class="form-input cl-href" type="url" value="${esc(l.href)}" placeholder="https://..."><button class="btn btn-sm btn-danger" data-action="remove-contact-row">×</button></div>`).join('');}function addContactLink() {const wrap = document.getElementById('s-contato-links-wrap');const div = document.createElement('div');div.className = 'contact-link-row';div.style.cssText = 'display:grid;grid-template-columns:80px 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center;';div.innerHTML = `<input class="form-input cl-key" type="text" placeholder="chave"><input class="form-input cl-val" type="text" placeholder="texto exibido"><input class="form-input cl-href" type="url" placeholder="https://..."><button class="btn btn-sm btn-danger" data-action="remove-contact-row">×</button>`;wrap.appendChild(div);}/* ══════════════════════════════════════════════════════SETTINGS══════════════════════════════════════════════════════ */async function changePassword() {const oldPass = document.getElementById('cfg-pass-old').value;const newPass = document.getElementById('cfg-pass-new').value;const confirmPass = document.getElementById('cfg-pass-confirm').value;if (!oldPass || !newPass || !confirmPass) { toast('preencha todos os campos', true); return; }if (newPass !== confirmPass) { toast('senhas não coincidem', true); return; }if (newPass.length < 6) { toast('senha muito curta (min 6)', true); return; }if (!(await verifyPassword(oldPass))) { toast('senha atual incorreta', true); return; }const newHash = await hashPassword(newPass);localStorage.setItem('bydan_pass_hash', newHash);document.getElementById('cfg-pass-old').value = '';document.getElementById('cfg-pass-new').value = '';document.getElementById('cfg-pass-confirm').value = '';logActivity('alterou senha de administrador');toast('senha alterada com sucesso!');}function exportJSON() {const json = JSON.stringify(DATA, null, 2);const blob = new Blob([json], { type: 'application/json' });const url = URL.createObjectURL(blob);const a = document.createElement('a');a.href = url; a.download = 'content.json'; a.click();URL.revokeObjectURL(url);toast('content.json exportado!');}function importJSON() { document.getElementById('import-file').click(); }function handleImport(input) {const file = input.files[0];if (!file) return;const reader = new FileReader();reader.onload = e => {try {DATA = JSON.parse(e.target.result);saveData();initAdmin();toast('dados importados com sucesso!');} catch(err) { toast('JSON inválido', true); }};reader.readAsText(file);}function clearLocalData() {if (!confirm('Isso vai apagar todos os dados locais. Tem certeza?')) return;localStorage.removeItem('bydan_content');localStorage.removeItem('bydan_activity');activity = [];logActivity('limpou dados locais');toast('dados locais limpos. recarregando...');setTimeout(() => location.reload(), 1200);}/* ══════════════════════════════════════════════════════GITHUB CONFIG══════════════════════════════════════════════════════ */function loadGithubConfig() {return {user: localStorage.getItem('bydan_gh_user') || '',repo: localStorage.getItem('bydan_gh_repo') || '',branch: localStorage.getItem('bydan_gh_branch') || 'main',path: localStorage.getItem('bydan_gh_path') || 'data/content.json',token: localStorage.getItem('bydan_gh_token') || ''};}function populateGithubConfig() {const c = loadGithubConfig();setVal('cfg-gh-user', c.user);setVal('cfg-gh-repo', c.repo);setVal('cfg-gh-branch', c.branch || 'main');setVal('cfg-gh-path', c.path || 'data/content.json');
/* Show masked token if saved */
const tokenInput = document.getElementById('cfg-gh-token');if (tokenInput && c.token) {tokenInput.placeholder = '••••••••••••••• (salvo)';tokenInput.dataset.saved = '1';}updateGhSavedIndicator(c);}function updateGhSavedIndicator(c) {const ind = document.getElementById('gh-saved-indicator');if (ind) ind.classList.toggle('is-visible', !!(c.user && c.repo && c.token));}function saveGithubConfig() {const user = getVal('cfg-gh-user').trim();const repo = getVal('cfg-gh-repo').trim();const branch = getVal('cfg-gh-branch').trim() || 'main';const path = getVal('cfg-gh-path').trim() || 'data/content.json';const tokenEl = document.getElementById('cfg-gh-token');const token = tokenEl.value.trim();if (!user || !repo) { toast('usuário e repositório obrigatórios', true); return; }localStorage.setItem('bydan_gh_user', user);localStorage.setItem('bydan_gh_repo', repo);localStorage.setItem('bydan_gh_branch', branch);localStorage.setItem('bydan_gh_path', path);if (token) {localStorage.setItem('bydan_gh_token', token);localStorage.setItem('bydan_gh_token_saved_at', Date.now().toString());tokenEl.value = '';tokenEl.placeholder = '••••••••••••••• (salvo)';tokenEl.dataset.saved = '1';}logActivity('atualizou configuração do GitHub');updateGhSavedIndicator(loadGithubConfig());toast('configuração do GitHub salva!');}function toggleTokenVisibility() {const inp = document.getElementById('cfg-gh-token');const btn = document.getElementById('token-vis-btn');if (inp.type === 'password') {inp.type = 'text';btn.textContent = '[ ocultar ]';} else {inp.type = 'password';btn.textContent = '[ mostrar ]';}}async function testGithubConnection() {const c = loadGithubConfig();const bar = document.getElementById('gh-status-bar');bar.classList.add('is-visible');bar.style.borderColor = 'var(--lavender)';bar.style.color = 'var(--dim)';bar.textContent = '/* testando conexão... */';if (!c.user || !c.repo || !c.token) {bar.style.borderColor = 'var(--red)'; bar.style.color = 'var(--red)';bar.textContent = '✕ preencha usuário, repositório e token antes de testar.';return;}try {const r = await fetch(`https://api.github.com/repos/${c.user}/${c.repo}`, {headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github.v3+json' }});if (r.ok) {const data = await r.json();bar.style.borderColor = 'var(--green)'; bar.style.color = 'var(--green)';bar.textContent = `✓ conectado · ${data.full_name} · branch padrão: ${data.default_branch}`;logActivity('testou conexão com GitHub — sucesso');} else if (r.status === 401) {bar.style.borderColor = 'var(--red)'; bar.style.color = 'var(--red)';bar.textContent = '✕ token inválido ou expirado. gere um novo em github.com/settings/tokens';} else if (r.status === 404) {bar.style.borderColor = 'var(--red)'; bar.style.color = 'var(--red)';bar.textContent = '✕ repositório não encontrado. verifique usuário e nome do repo.';} else {bar.style.borderColor = 'var(--red)'; bar.style.color = 'var(--red)';bar.textContent = `✕ erro ${r.status}. verifique os dados.`;}} catch(e) {bar.style.borderColor = 'var(--red)'; bar.style.color = 'var(--red)';bar.textContent = '✕ erro de rede. verifique sua conexão.';}}/* ══════════════════════════════════════════════════════PUBLISH══════════════════════════════════════════════════════ */function openPublish() {const json = JSON.stringify(DATA, null, 2);const blob = new Blob([json], { type: 'application/json' });const url = URL.createObjectURL(blob);const c = loadGithubConfig();const hasToken = !!(c.user && c.repo && c.token);
/* Reset modal state */
document.getElementById('pub-progress').classList.remove('is-visible');document.getElementById('pub-result').classList.remove('is-visible');document.getElementById('pub-manual-fallback').classList.add('is-hidden');document.getElementById('pub-auto-btn').disabled = false;document.getElementById('pub-auto-btn').textContent = '[ subir para o github ]';setPubProgress(0, '');if (hasToken) {document.getElementById('pub-with-token').classList.remove('is-hidden');document.getElementById('pub-no-token').classList.add('is-hidden');document.getElementById('pub-repo-display').textContent = `${c.user}/${c.repo}`;document.getElementById('pub-branch-display').textContent = c.branch;
/* Prepare fallback textarea too */
const ta2 = document.getElementById('publish-json-2');if (ta2) ta2.value = json;const dl2 = document.getElementById('publish-download-2');if (dl2) dl2.href = url;} else {document.getElementById('pub-with-token').classList.add('is-hidden');document.getElementById('pub-no-token').classList.remove('is-hidden');document.getElementById('publish-json').value = json;document.getElementById('publish-download').href = url;}document.getElementById('publish-modal').classList.add('open');}function closePublish() {document.getElementById('publish-modal').classList.remove('open');}function showManualFallback() {const json = JSON.stringify(DATA, null, 2);const blob = new Blob([json], { type: 'application/json' });document.getElementById('publish-json-2').value = json;document.getElementById('publish-download-2').href = URL.createObjectURL(blob);document.getElementById('pub-with-token').classList.add('is-hidden');document.getElementById('pub-manual-fallback').classList.remove('is-hidden');}function copyPublishJSON() {const ta = document.getElementById('publish-json') || document.getElementById('publish-json-2');navigator.clipboard.writeText(ta.value).then(() => toast('JSON copiado!')).catch(() => toast('erro ao copiar', true));}function setPubProgress(pct, msg) {const bar = document.getElementById('pub-progress-bar');const text = document.getElementById('pub-progress-text');if (bar) bar.style.width = pct + '%';if (text) text.textContent = msg;}function showPubResult(success, msg) {const el = document.getElementById('pub-result');el.classList.add('is-visible');el.style.borderColor = success ? 'var(--green)' : 'var(--red)';el.style.color = success ? 'var(--green)' : 'var(--red)';el.textContent = (success ? '✓ ' : '✕ ') + msg;}async function publishToGitHub() {
  const c = loadGithubConfig();
  if (!c.user || !c.repo || !c.token) { toast('configure o GitHub em Config primeiro', true); return; }
  const btn = document.getElementById('pub-auto-btn');
  btn.disabled = true;
  btn.textContent = '/* publicando... */';
  document.getElementById('pub-progress').classList.add('is-visible');
  document.getElementById('pub-result').classList.remove('is-visible');
  saveData();
  const now = new Date().toLocaleString('pt-BR');
  const result = await uploadContentToGitHub(`conteúdo: atualização via admin · ${now}`, setPubProgress);
  if (result.ok) {
    showPubResult(true, `publicado · commit ${result.sha} · deploy em andamento (~1 min)`);
    logActivity(`publicou no GitHub · commit ${result.sha}`);
    btn.textContent = '✓ publicado';
    setTimeout(() => closePublish(), 3000);
  } else {
    setPubProgress(0, '');
    document.getElementById('pub-progress').classList.remove('is-visible');
    showPubResult(false, result.message || 'erro desconhecido');
    btn.disabled = false;
    btn.textContent = '[ tentar novamente ]';
    logActivity(`erro ao publicar: ${result.message || 'erro'}`);
  }
}/* ══════════════════════════════════════════════════════UTILS══════════════════════════════════════════════════════ */function toast(msg, err) {const el = document.getElementById('toast');el.textContent = msg;el.className = 'show' + (err ? ' err' : '');setTimeout(() => el.className = '', 2500);}function esc(str) {if (!str) return '';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(str) {if (!str) return '';return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');}function slugify(str) {return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
/* Close modal on backdrop click */
document.getElementById('publish-modal').addEventListener('click', e => {if (e.target === document.getElementById('publish-modal')) closePublish();});

/* ══ AVATAR MODE ══ */
function setAvatarMode(mode) {
  document.getElementById('s-avatar-mode').value = mode;
  document.getElementById('av-mode-emoji').classList.toggle('is-hidden', mode!=='emoji');
  document.getElementById('av-mode-sigla').classList.toggle('is-hidden', mode!=='sigla');
  document.getElementById('av-mode-img').classList.toggle('is-hidden', mode!=='img');
  ['emoji','sigla','img'].forEach(m => {
    const btn = document.getElementById('av-tab-'+m);
    if(btn) btn.style.background = m===mode ? 'var(--lavender)' : '';
    if(btn) btn.style.color = m===mode ? 'var(--text)' : '';
  });
}
function handleAvatarUpload(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  if (file.size > 2*1024*1024) { toast('imagem muito grande (max 2MB)', true); return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('s-avatar-url').value = e.target.result;
    const prev = document.getElementById('av-img-preview');
    prev.src = e.target.result; prev.classList.add('is-visible');
  };
  reader.readAsDataURL(file);
}
/* Patch populateSiteEditor to set avatar mode */
const _origPopulate = populateSiteEditor;
populateSiteEditor = function() {
  _origPopulate();

  const s = DATA.sobre || {};
  const av = s.avatar || '';

  if (av.startsWith('http') || av.startsWith('data:')) {
    setAvatarMode('img');
    document.getElementById('s-avatar-url').value = av;

    const preview = document.getElementById('av-img-preview');
    preview.src = av;
    preview.classList.add('is-visible');

  } else if (av.length > 2 && !/[^a-zA-Z0-9\.·]/.test(av)) {
    setAvatarMode('sigla');
    document.getElementById('s-avatar-sigla').value = av;

  } else {
    setAvatarMode('emoji');
    document.getElementById('s-avatar').value = av;
  }
};

/* Patch saveSiteContent to handle avatar modes */
const _origSave = saveSiteContent;
saveSiteContent = async function() {
  const mode = document.getElementById('s-avatar-mode').value;
  let avatarVal = '';

  if (mode === 'emoji') avatarVal = getVal('s-avatar');
  else if (mode === 'sigla') avatarVal = getVal('s-avatar-sigla');
  else if (mode === 'img') avatarVal = getVal('s-avatar-url');

  document.getElementById('s-avatar').value = avatarVal;

  await _origSave();
};

/* ══ MUSIC MODE ══ */
let _musicPreviewCtx = null;
function setMusicMode(mode) {
  document.getElementById('cfg-music-mode').value = mode;
  document.getElementById('mus-mode-preset').classList.toggle('is-hidden', mode!=='preset');
  document.getElementById('mus-mode-url').classList.toggle('is-hidden', mode!=='url');
  document.getElementById('mus-mode-file').classList.toggle('is-hidden', mode!=='file');
  ['preset','url','file'].forEach(m => {
    const btn = document.getElementById('mus-tab-'+m);
    if(btn) btn.style.background = m===mode ? 'var(--lavender)' : '';
    if(btn) btn.style.color = m===mode ? 'var(--text)' : '';
  });
}
function previewMusicPreset() {
  stopMusicPreview();
  const preset = document.getElementById('cfg-music-preset').value;
  const vol = parseInt(document.getElementById('cfg-music-vol').value) / 100;
  _musicPreviewCtx = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = _musicPreviewCtx;
  const gain = ctx.createGain(); gain.gain.value = vol * 0.5; gain.connect(ctx.destination);
  if (preset === 'noise') {
    const buf = ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const d = buf.getChannelData(0); let last=0;
    for(let i=0;i<d.length;i++){let w=Math.random()*2-1;d[i]=(last+0.02*w)/1.02;last=d[i];d[i]*=3.5;}
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const flt = ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=350;
    src.connect(flt); flt.connect(gain); src.start();
  } else if (preset === 'rain') {
    const buf = ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*0.3*(Math.random()<0.003?5:1);
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const flt = ctx.createBiquadFilter(); flt.type='bandpass'; flt.frequency.value=1200; flt.Q.value=0.5;
    src.connect(flt); flt.connect(gain); src.start();
  } else if (preset === 'drone') {
    const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value=80;
    const osc2 = ctx.createOscillator(); osc2.type='sine'; osc2.frequency.value=80.5;
    osc.connect(gain); osc2.connect(gain); osc.start(); osc2.start();
  } else if (preset === 'glitch') {
    const buf = ctx.createBuffer(1,ctx.sampleRate*0.5,ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()<0.05?(Math.random()*2-1):0;
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const flt = ctx.createBiquadFilter(); flt.type='highpass'; flt.frequency.value=200;
    src.connect(flt); flt.connect(gain); src.start();
  } else if (preset === 'cassette') {
    const buf = ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const d = buf.getChannelData(0); let last=0;
    for(let i=0;i<d.length;i++){let w=Math.random()*2-1;d[i]=(last+0.05*w)/1.05;last=d[i];}
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const flt = ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=800;
    const flt2 = ctx.createBiquadFilter(); flt2.type='highpass'; flt2.frequency.value=120;
    src.connect(flt); flt.connect(flt2); flt2.connect(gain); src.start();
  }
  toast('▶ tocando preset');
}
function stopMusicPreview() {
  if (_musicPreviewCtx) { try { _musicPreviewCtx.close(); } catch(e){} _musicPreviewCtx=null; }
}
function handleMusicUpload(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  if (file.size > 3*1024*1024) { toast('arquivo muito grande (max 3MB)', true); return; }
  const reader = new FileReader();
  reader.onload = e => {
    if (!DATA.meta) DATA.meta = {};
    DATA.meta.musicFile = e.target.result;
    DATA.meta.musicMode = 'file';
    document.getElementById('music-upload-text').textContent = '[ ' + file.name + ' ]';
    toast('arquivo carregado!');
  };
  reader.readAsDataURL(file);
}
async function saveMusicSettings() {
  if (!DATA.meta) DATA.meta = {};
  const mode = document.getElementById('cfg-music-mode').value;
  DATA.meta.musicMode = mode;
  DATA.meta.musicVol = parseInt(document.getElementById('cfg-music-vol').value) / 100;
  if (mode === 'preset') DATA.meta.musicPreset = document.getElementById('cfg-music-preset').value;
  if (mode === 'url') DATA.meta.musicUrl = document.getElementById('cfg-music-url').value;
  await finalizeContentSave('atualizou configurações de música', 'som configurado');
}

/* Init music tabs on load */
function initAdminHandlers() {
  document.body.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    switch (action) {
      case 'login': doLogin(); break;
      case 'logout': doLogout(); break;
      case 'toggle-dark': toggleDark(); break;
      case 'show-panel': showPanel(btn.dataset.panel); break;
      case 'new-post': showPanel('blog'); openPostEditor(); break;
      case 'new-proj': showPanel('projetos'); openProjEditor(); break;
      case 'open-publish': openPublish(); break;
      case 'close-publish': closePublish(); break;
      case 'publish-manual': showManualFallback(); break;
      case 'publish-github': publishToGitHub(); break;
      case 'copy-publish-json': copyPublishJSON(); break;
      case 'publish-settings': showPanel('settings'); closePublish(); break;
      case 'publish-back-token':
        document.getElementById('pub-manual-fallback').classList.add('is-hidden');
        document.getElementById('pub-with-token').classList.remove('is-hidden');
        break;
      case 'open-post-editor': openPostEditor(); break;
      case 'close-post-editor': closePostEditor(); break;
      case 'save-post': await savePost(btn.dataset.status); break;
      case 'remove-cover': removeCover(); break;
      case 'open-proj-editor': openProjEditor(); break;
      case 'close-proj-editor': closeProjEditor(); break;
      case 'save-proj': await saveProj(); break;
      case 'reload-site': await reloadSiteContent(); break;
      case 'save-site': await saveSiteContent(); break;
      case 'connect-content-file': await connectContentJsonFile(); break;
      case 'change-password': changePassword(); break;
      case 'export-json': exportJSON(); break;
      case 'import-json': importJSON(); break;
      case 'clear-data': clearLocalData(); break;
      case 'save-github': saveGithubConfig(); break;
      case 'toggle-token-visibility': toggleTokenVisibility(); break;
      case 'test-github': testGithubConnection(); break;
      case 'add-novidade': addNovidade(); break;
      case 'add-stack-row': addStackRow(); break;
      case 'add-contact-link': addContactLink(); break;
      case 'save-music': await saveMusicSettings(); break;
      case 'preview-music': previewMusicPreset(); break;
      case 'stop-music': stopMusicPreview(); break;
      case 'set-avatar-mode': setAvatarMode(btn.dataset.mode); break;
      case 'set-music-mode': setMusicMode(btn.dataset.mode); break;
      case 'editor-tab': switchEditorTab(btn.dataset.tab); break;
      case 'ed-cmd': edCmd(btn.dataset.cmd); break;
      case 'ed-insert': edInsert(btn.dataset.type); break;
      case 'insert-link': insertLink(); break;
      case 'insert-image': insertImageEmbed(); break;
      case 'insert-video': insertVideoEmbed(); break;
      case 'close-full-preview': closeFullPreview(); break;
      case 'edit-post': editPost(btn.dataset.id); break;
      case 'duplicate-post': await duplicatePost(btn.dataset.id); break;
      case 'delete-post': await deletePost(btn.dataset.id); break;
      case 'edit-proj': editProj(btn.dataset.id); break;
      case 'delete-proj': await deleteProj(btn.dataset.id); break;
      case 'remove-tag': removeTag(btn.dataset.ns, btn.dataset.tag); break;
      case 'remove-attach': removeAttach(parseInt(btn.dataset.index, 10)); break;
      case 'remove-nov-item': btn.closest('.nov-item')?.remove(); break;
      case 'remove-stack-row': btn.closest('.stack-edit-row')?.remove(); break;
      case 'remove-contact-row': btn.closest('.contact-link-row')?.remove(); break;
    }
  });

  document.body.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.action === 'update-post-slug') updatePostSlug(el.value);
    if (el.dataset.action === 'music-vol') {
      const disp = document.getElementById('music-vol-disp');
      if (disp) disp.textContent = el.value + '%';
    }
    if (el.dataset.action === 'stack-pct') {
      const val = el.closest('.stack-edit-row')?.querySelector('.se-pct-val');
      if (val) val.textContent = el.value + '%';
    }
  });

  document.body.addEventListener('keydown', e => {
    const ns = e.target.dataset?.tagNs;
    if (ns) handleTagKey(e, ns);
  });

  document.body.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset.file) return;
    switch (el.dataset.file) {
      case 'cover': handleCoverUpload(el); break;
      case 'attach': handleAttachUpload(el); break;
      case 'proj-cover': handleProjCoverUpload(el); break;
      case 'avatar': handleAvatarUpload(el); break;
      case 'music': handleMusicUpload(el); break;
      case 'import': handleImport(el); break;
    }
  });

  document.body.addEventListener('click', e => {
    if (e.target.closest('input[type="file"], button, a, [data-action]')) return;
    const trigger = e.target.closest('[data-upload-trigger]');
    if (!trigger) return;
    const id = trigger.dataset.uploadTrigger;
    if (id) document.getElementById(id)?.click();
  }, true);

  document.body.addEventListener('dragover', e => {
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.add('drag');
  });

  document.body.addEventListener('dragleave', e => {
    const zone = e.target.closest('[data-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag');
  });

  document.body.addEventListener('drop', e => {
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('drag');
    dropFile({ preventDefault() {}, dataTransfer: e.dataTransfer, currentTarget: zone }, zone.dataset.drop);
  });

  document.body.addEventListener('dragstart', e => {
    const row = e.target.closest('.item-row[data-reorder]');
    if (!row) return;
    dragSrcId = row.dataset.id;
    row.style.opacity = '0.5';
  });

  document.body.addEventListener('dragend', () => resetDragStyles());

  document.body.addEventListener('dragover', e => {
    if (e.target.closest('.item-row[data-reorder]')) dragOver2(e);
  });

  document.body.addEventListener('drop', e => {
    const row = e.target.closest('.item-row[data-reorder]');
    if (!row?.dataset.reorder) return;
    e.preventDefault();
    void dropReorder({ preventDefault() {}, currentTarget: row }, row.dataset.reorder);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminHandlers();
  setAvatarMode('emoji');
  setMusicMode('preset');
});
