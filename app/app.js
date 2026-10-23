(() => {
  'use strict';

  const API = 'https://wolhop-catalog-api.fancyaphid32.chatgpt.site';
  const INSTALLER_PARTS = Array.from({length:9},(_,index) => `${API}/v1/installer/part${String(index+1).padStart(2,'0')}`);
  const INSTALLER_SHA256 = '39e002ad421874543b340a3d773f6fec30184a479b2db67c72ebb04af922a02a';
  const CATEGORIES = ['전체', '생존', '미니게임', '경제', '건축', '모드', '기타'];
  const THEMES = [
    ['forest','포레스트','#c8f36c'],['portal','포털','#85ddd2'],['mineral','미네랄','#e8b46b'],['ender','엔더','#b794ff'],['deepsea','심해','#71d7e8'],
    ['ice','빙하','#9ed4ff'],['blossom','블라썸','#f0a8ca'],['nether','네더','#ff8054'],['dawn','새벽','#e5ca73'],['redstone','레드스톤','#f0787d']
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const safeRead = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
  let servers = [];
  let selectedCategory = '전체';
  let sortNewest = true;
  let activeView = 'discover';
  let pendingServer = null;
  let loadInProgress = false;

  function setTheme(theme) {
    const selected = THEMES.some(([id]) => id === theme) ? theme : 'forest';
    document.documentElement.dataset.theme = selected;
    localStorage.setItem('wolhop:web:theme', JSON.stringify(selected));
    $$('.theme-option').forEach((button) => button.classList.toggle('active', button.dataset.themeOption === selected));
  }

  function showView(view) {
    if (!['discover','favorites','settings'].includes(view)) return;
    activeView = view;
    const title = {discover:'서버 탐색',favorites:'내 서버',settings:'설정'}[view];
    $$('.view').forEach((section) => {
      const active = section.id === `view-${view}`;
      section.classList.toggle('active', active);
      section.hidden = !active;
    });
    $$('.nav-item[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    $('#current-section').textContent = title;
    if (view === 'favorites') renderFavorites();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function setCatalogStatus(message, healthy = true) {
    $('#catalog-status').textContent = message;
    const dot = $('.catalog-live .live-dot');
    if (dot) { dot.style.background = healthy ? 'var(--accent)' : 'var(--danger)'; dot.style.boxShadow = healthy ? '0 0 10px var(--accent)' : 'none'; }
  }

  async function loadServers({quiet = false} = {}) {
    if (loadInProgress) return;
    loadInProgress = true;
    if (!quiet) {
      $('#catalog-error').hidden = true;
      setCatalogStatus('목록을 연결하고 있어요');
    }
    try {
      const response = await fetch(`${API}/v1/servers`, {cache:'no-store',headers:{accept:'application/json'}});
      if (!response.ok) throw new Error(`http_${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.servers)) throw new Error('invalid_response');
      servers = data.servers;
      setCatalogStatus('실시간 공개 목록');
      $('#catalog-error').hidden = true;
      renderServers();
      if (activeView === 'favorites') renderFavorites();
    } catch {
      setCatalogStatus('목록 연결 오류', false);
      if (!quiet && servers.length === 0) {
        $('#catalog-error-text').textContent = '공개 서버 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
        $('#catalog-error').hidden = false;
      }
      renderServers();
      if (!quiet && servers.length === 0) $('#catalog-empty').hidden = true;
    } finally {
      loadInProgress = false;
    }
  }

  function favorites() { const saved=safeRead('wolhop:web:favorites', []); return Array.isArray(saved) ? saved : []; }
  function isFavorite(server) { return favorites().includes(server.address); }
  function toggleFavorite(server) {
    const saved = favorites();
    const next = saved.includes(server.address) ? saved.filter((address) => address !== server.address) : [...saved,server.address];
    localStorage.setItem('wolhop:web:favorites', JSON.stringify(next));
    renderServers();
    renderFavorites();
    $('#favorite-count').textContent = String(next.length);
    toast(saved.includes(server.address) ? '내 서버에서 삭제했어요.' : '내 서버에 저장했어요.');
  }

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderCategories() {
    const holder = $('#category-list');
    holder.replaceChildren();
    CATEGORIES.forEach((category) => {
      const button = create('button','category-chip',category);
      button.type = 'button';
      button.classList.toggle('active', selectedCategory === category);
      button.setAttribute('aria-pressed',String(selectedCategory === category));
      button.addEventListener('click',() => { selectedCategory = category; renderCategories(); renderServers(); });
      holder.append(button);
    });
  }

  function filteredServers(list = servers) {
    const query = $('#server-search').value.trim().toLocaleLowerCase();
    const visible = list.filter((server) => {
      const categoryMatch = selectedCategory === '전체' || server.category === selectedCategory;
      const haystack = `${server.name} ${server.address} ${server.description || ''} ${server.category || ''}`.toLocaleLowerCase();
      return categoryMatch && (!query || haystack.includes(query));
    });
    return visible.sort((a,b) => sortNewest ? String(b.approvedAt || b.createdAt || '').localeCompare(String(a.approvedAt || a.createdAt || '')) : a.name.localeCompare(b.name,'ko'));
  }

  function safeImage(source) {
    return typeof source === 'string' && (/^data:image\/(?:png|jpeg|webp);base64,/.test(source) || /^https:\/\//.test(source));
  }

  function makeCard(server) {
    const card = create('article','public-server-card');
    card.tabIndex = 0;
    card.setAttribute('aria-label',`${server.name} 서버 상세 보기`);
    card.title = '클릭하여 서버 상세 보기';
    const thumbnail = create('div','server-thumbnail public-thumbnail');
    if (safeImage(server.imageDataUrl)) {
      const image = create('img','server-thumbnail-image');
      image.src = server.imageDataUrl;
      image.alt = `${server.name} 대표 이미지`;
      image.loading = 'lazy';
      thumbnail.append(image);
    } else thumbnail.classList.add('server-thumbnail-placeholder');

    const info = create('div','public-server-info');
    const header = create('div','public-server-header');
    const copy = create('div','public-server-copy');
    const title = create('h3','draft-title',server.name);
    const address = create('div','server-address address-copy',server.address);
    copy.append(title,address);
    header.append(copy);
    const badges = create('div','draft-badges');
    [server.category,server.version ? `Java ${server.version}` : 'Java Edition',server.language].filter(Boolean).forEach((label) => badges.append(create('span','',label)));
    const description = create('p','draft-description',server.description || '서버 소개가 아직 등록되지 않았어요.');
    info.append(header,badges,description);

    const actions = create('div','public-server-actions');
    const actionRow = create('div','web-card-actions');
    const play = create('button','action-button connect','플레이');
    play.type = 'button';
    play.setAttribute('aria-label',`${server.name} 플레이`);
    play.addEventListener('click',(event) => { event.stopPropagation(); openInstall(server); });
    const saved = isFavorite(server);
    const favorite = create('button',`favorite-toggle${saved ? ' saved' : ''}`,saved ? '♥' : '♡');
    favorite.type = 'button';
    favorite.setAttribute('aria-label',saved ? '내 서버에서 삭제' : '내 서버에 저장');
    favorite.setAttribute('aria-pressed',String(saved));
    favorite.addEventListener('click',(event) => { event.stopPropagation(); toggleFavorite(server); });
    actionRow.append(play,favorite);
    actions.append(actionRow);

    card.append(thumbnail,info,actions);
    card.addEventListener('click',() => openShowcase(server));
    card.addEventListener('keydown',(event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === card) { event.preventDefault(); openShowcase(server); }
    });
    return card;
  }

  function renderGrid(target, list, empty) {
    target.replaceChildren();
    empty.hidden = list.length > 0;
    list.forEach((server) => target.append(makeCard(server)));
  }

  function renderServers() {
    const visible = filteredServers();
    renderGrid($('#public-servers'),visible,$('#catalog-empty'));
    $('#result-count').textContent = `${visible.length}개 서버`;
    $('#directory-title').textContent = selectedCategory === '전체' ? '지금 둘러볼 서버' : `${selectedCategory} 서버`;
    $('#favorite-count').textContent = String(favorites().length);
  }

  function renderFavorites() {
    const saved = new Set(favorites());
    const list = servers.filter((server) => saved.has(server.address));
    renderGrid($('#favorite-servers'),list,$('#favorites-empty'));
  }

  function openShowcase(server) {
    const host = $('#showcase-content');
    host.replaceChildren();
    const hero = create('section','showcase-hero');
    if (safeImage(server.imageDataUrl)) {
      const image = create('img','showcase-hero-image');
      image.src = server.imageDataUrl;
      image.alt = `${server.name} 대표 이미지`;
      hero.append(image);
    }
    hero.append(create('div','showcase-hero-shade'));
    const copy = create('div','showcase-hero-copy');
    copy.append(create('p','eyebrow','WORLD SHOWCASE'));
    const title = create('h2','',server.name);
    title.id = 'showcase-title';
    copy.append(title);
    const badges = create('div','showcase-badges');
    [server.category,server.version ? `Java ${server.version}` : 'Java Edition',server.language].filter(Boolean).forEach((label) => badges.append(create('span','',label)));
    const play = create('button','button button-primary showcase-play','플레이');
    play.type = 'button';
    play.addEventListener('click',() => openInstall(server));
    copy.append(badges,play);
    hero.append(copy);

    const body = create('div','showcase-body');
    const addressSection = create('section','showcase-address');
    addressSection.append(create('span','', '서버 주소'));
    const address = create('button','showcase-address-button',server.address);
    address.type = 'button';
    address.title = '클릭하여 주소 복사';
    address.addEventListener('click',async () => {
      try { await navigator.clipboard.writeText(server.address); toast('서버 주소를 복사했어요.'); }
      catch { toast('주소 복사에 실패했어요.'); }
    });
    addressSection.append(address);
    const intro = create('section','showcase-section');
    intro.append(create('h3','', '서버 소개'),create('p','',server.description || '서버 소개가 아직 등록되지 않았어요.'));
    body.append(addressSection,intro);
    const galleryImages = Array.isArray(server.galleryImages) ? server.galleryImages.filter(safeImage) : [];
    if (galleryImages.length) {
      const gallery = create('section','showcase-section showcase-gallery-section');
      gallery.append(create('h3','', '월드 둘러보기'));
      const images = create('div','showcase-gallery');
      galleryImages.forEach((src,index) => { const image = create('img'); image.src=src; image.alt=`${server.name} 스크린샷 ${index+1}`; image.loading='lazy'; images.append(image); });
      gallery.append(images); body.append(gallery);
    }
    if (typeof server.videoUrl === 'string' && /^https:\/\/.+\.(?:mp4|webm|ogg)(?:[?#].*)?$/i.test(server.videoUrl)) {
      const section = create('section','showcase-section showcase-video-section');
      section.append(create('h3','', '소개 영상'));
      const video = create('video','showcase-video'); video.src=server.videoUrl; video.controls=true; video.preload='metadata'; section.append(video); body.append(section);
    }
    if (server.website) {
      try { const website = new URL(server.website); if (website.protocol === 'https:') { const section=create('section','showcase-section'); section.append(create('h3','', '서버 웹사이트')); const link=create('a','button button-secondary','웹사이트 열기 ↗'); link.href=website.href; link.target='_blank'; link.rel='noreferrer'; section.append(link); body.append(section); } } catch {}
    }
    host.append(hero,body);
    $('#showcase-dialog').showModal();
  }

  function openInstall(server) {
    pendingServer = server || null;
    $('#install-copy').textContent = server ? `${server.name} 서버를 선택했어요. Wolhop 런처 설치 후 이 버튼으로 Minecraft Java 접속을 이어갈 수 있어요.` : '마음에 드는 서버에서 플레이를 누르면 Wolhop 런처를 통해 접속을 이어갈 수 있어요.';
    $('#open-launcher').hidden = !server;
    $('#install-dialog').showModal();
  }

  function launchSelected() {
    if (!pendingServer) return;
    const params = new URLSearchParams({server:pendingServer.address,name:pendingServer.name,version:pendingServer.version || ''});
    window.location.href = `wolhop://join?${params.toString()}`;
    toast('Wolhop 실행 요청을 보냈어요. 브라우저에서 열기 확인이 표시되면 허용해 주세요.');
  }

  async function downloadInstaller(button) {
    if (button.disabled) return;
    const originalLabel=button.textContent;
    const status=$('#download-status');
    button.disabled=true;
    if (status) status.textContent='설치 파일을 준비하고 있어요…';
    try {
      const parts=[];
      let total=0;
      for (let index=0;index<INSTALLER_PARTS.length;index+=1) {
        const response=await fetch(INSTALLER_PARTS[index],{cache:'force-cache'});
        if (!response.ok) throw new Error(`설치 파일 조각 ${index+1}개를 불러오지 못했어요.`);
        const blob=await response.blob();
        total+=blob.size;
        parts.push(blob);
        if (status) status.textContent=`설치 파일 준비 중… ${index+1}/${INSTALLER_PARTS.length}`;
        button.textContent=`파일 준비 중 ${index+1}/${INSTALLER_PARTS.length}`;
      }
      const file=new Blob(parts,{type:'application/vnd.microsoft.portable-executable'});
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      const hash=[...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
      if (hash!==INSTALLER_SHA256) throw new Error('설치 파일 확인에 실패했어요. 다운로드를 다시 시도해 주세요.');
      const url=URL.createObjectURL(file);
      const link=create('a'); link.href=url; link.download='Wolhop Setup 0.2.0.exe'; document.body.append(link); link.click(); link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
      if (status) status.textContent=`설치 파일 다운로드를 시작했어요. (${Math.round(total/1_000_000)} MB)`;
      toast('Wolhop 설치 파일 다운로드를 시작했어요.');
    } catch (error) {
      if (status) status.textContent=error?.message || '설치 파일 다운로드에 실패했어요.';
      toast(error?.message || '설치 파일 다운로드에 실패했어요.');
    } finally {
      button.disabled=false;
      button.textContent=originalLabel;
    }
  }

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(node.timer);
    node.timer = setTimeout(() => node.classList.remove('visible'),2600);
  }

  function renderThemes() {
    const host = $('#theme-options');
    host.replaceChildren();
    THEMES.forEach(([id,name,color]) => {
      const button = create('button','theme-option');
      button.type='button'; button.dataset.themeOption=id;
      const swatch=create('span','theme-swatch'); swatch.style.background=color;
      button.append(swatch,create('span','',name));
      button.addEventListener('click',() => { setTheme(id); $('#theme-status').textContent=`${name} 테마를 적용했어요.`; });
      host.append(button);
    });
    setTheme(safeRead('wolhop:web:theme','forest'));
  }

  function makeEditToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  }

  async function compressImage(file) {
    if (!file || file.size === 0) return '';
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('PNG, JPG, WebP 이미지를 선택해 주세요.');
    const bitmap = await createImageBitmap(file);
    try {
      let scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      for (let attempt=0;attempt<7;attempt+=1) {
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const context=canvas.getContext('2d',{alpha:false});
        if (!context) throw new Error('이미지를 처리하지 못했어요.');
        context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const blob=await new Promise((resolve) => canvas.toBlob(resolve,'image/webp',0.82));
        if (blob && blob.size <= 450*1024) return await new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=() => resolve(reader.result); reader.onerror=() => reject(new Error('이미지를 읽지 못했어요.')); reader.readAsDataURL(blob); });
        scale*=.76;
      }
      throw new Error('이미지 용량을 줄이지 못했어요. 다른 이미지를 선택해 주세요.');
    } finally { bitmap.close(); }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    const form=$('#register-form');
    const status=$('#register-status');
    const submit=$('button[type=submit]',form);
    status.textContent='서버 등록 요청을 보내고 있어요…'; status.dataset.kind=''; submit.disabled=true;
    try {
      const data=new FormData(form);
      const imageDataUrl=await compressImage(data.get('image'));
      const editToken=makeEditToken();
      const payload={name:String(data.get('name')||'').trim(),address:String(data.get('address')||'').trim(),version:String(data.get('version')||'').trim(),category:String(data.get('category')||''),language:String(data.get('language')||'한국어'),description:String(data.get('description')||'').trim(),website:String(data.get('website')||'').trim(),imageDataUrl,galleryImages:[],videoUrl:'',editToken};
      const response=await fetch(`${API}/v1/submissions`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || '등록 요청을 처리하지 못했어요.');
      const submissions=safeRead('wolhop:web:submissions',[]);
      submissions.push({id:result.submission.id,name:payload.name,address:payload.address,editToken,status:'pending',createdAt:result.submission.createdAt});
      localStorage.setItem('wolhop:web:submissions',JSON.stringify(submissions));
      status.textContent='검토 요청을 보냈어요. 운영자 검토 후 공개 목록에 표시됩니다.'; status.dataset.kind='success'; form.reset();
      setTimeout(() => $('#register-dialog').close(),1600);
    } catch (error) {
      status.textContent=error?.message || '등록 요청 중 오류가 발생했어요.'; status.dataset.kind='error';
    } finally { submit.disabled=false; }
  }

  document.addEventListener('click',(event) => {
    const viewButton=event.target.closest('[data-view]');
    if (viewButton) showView(viewButton.dataset.view);
    const downloadButton=event.target.closest('[data-install-download]');
    if (downloadButton) {
      event.preventDefault();
      if (downloadButton.id==='install-download') void downloadInstaller(downloadButton);
      else { openInstall(null); void downloadInstaller($('#install-download')); }
    }
    if (event.target.closest('[data-open-install]')) openInstall(null);
    if (event.target.closest('[data-open-register]')) $('#register-dialog').showModal();
    if (event.target.closest('[data-scroll-catalog]')) $('#catalog').scrollIntoView({behavior:'smooth'});
    if (event.target.closest('[data-close-dialog]')) event.target.closest('dialog')?.close();
  });
  $('#server-search').addEventListener('input',renderServers);
  $('#sort-button').addEventListener('click',() => { sortNewest=!sortNewest; $('#sort-button').textContent=sortNewest?'최신순':'이름순'; renderServers(); });
  $('#retry-catalog').addEventListener('click',() => loadServers());
  $('#open-launcher').addEventListener('click',launchSelected);
  $('#register-form').addEventListener('submit',submitRegistration);
  ['showcase-dialog','install-dialog','register-dialog'].forEach((id) => {
    const dialog=$(`#${id}`);
    dialog.addEventListener('click',(event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close',() => dialog.querySelectorAll('video').forEach((video) => { video.pause(); video.currentTime=0; }));
  });
  document.addEventListener('keydown',(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k') { event.preventDefault(); showView('discover'); $('#server-search').focus(); }
    if (event.key==='/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#server-search').focus(); }
  });

  renderCategories();
  renderThemes();
  $('#favorite-count').textContent=String(favorites().length);
  loadServers();
  window.setInterval(() => loadServers({quiet:true}),15000);
})();

