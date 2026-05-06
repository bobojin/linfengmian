const payload = window.LIN_FENGMIAN_WORKS_DATA || { works: [], summary: { decades: [] } };
const works = Array.isArray(payload.works) ? payload.works : [];

const state = {
  query: '',
  decade: '全部',
  selectedId: '',
};

const refs = {
  summaryStrip: document.getElementById('summary-strip'),
  heroCollage: document.getElementById('hero-collage'),
  searchInput: document.getElementById('search-input'),
  decadeTabs: document.getElementById('decade-tabs'),
  galleryMeta: document.getElementById('gallery-meta'),
  gallerySections: document.getElementById('gallery-sections'),
  workDialog: document.getElementById('work-dialog'),
  dialogClose: document.getElementById('dialog-close'),
  dialogImage: document.getElementById('dialog-image'),
  dialogId: document.getElementById('dialog-id'),
  dialogTitleCn: document.getElementById('dialog-title-cn'),
  dialogTitleEn: document.getElementById('dialog-title-en'),
  dialogFacts: document.getElementById('dialog-facts'),
  dialogNote: document.getElementById('dialog-note'),
};

function escHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function groupByDecade(items) {
  const order = ['1940年代', '1950年代', '1960年代', '1970年代'];
  return order.map(label => ({
    label,
    items: items.filter(item => item.decade === label),
  })).filter(group => group.items.length);
}

function getFilteredWorks() {
  const query = state.query.trim().toLowerCase();
  return works.filter(work => {
    if (state.decade !== '全部' && work.decade !== state.decade) return false;
    if (!query) return true;
    const haystack = [
      work.id,
      work.page,
      work.cnTitle,
      work.enTitle,
      work.year,
      work.medium,
      work.size,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function ensureSelection(filtered) {
  if (state.selectedId && filtered.some(item => item.id === state.selectedId)) return;
  state.selectedId = '';
  closeDialog();
}

function renderSummary() {
  const chips = [
    { label: 'Works', value: payload.summary.totalWorks + ' 幅' },
    { label: 'Plates', value: payload.summary.firstPage + '–' + payload.summary.lastPage + ' 页' },
    ...payload.summary.decades.map(item => ({ label: item.label, value: item.count + ' 幅' })),
  ];
  refs.summaryStrip.innerHTML = chips.map(item => `
    <div class="summary-chip">
      <strong>${escHtml(item.label)}</strong>
      <span>${escHtml(item.value)}</span>
    </div>
  `).join('');
}

function renderHero() {
  const picks = [works[1], works[14], works[31], works[60], works[84], works[116]].filter(Boolean);
  const layouts = [
    { left: '6%', top: '9%', width: '26%', height: '44%', rotate: '-4deg' },
    { left: '36%', top: '8%', width: '22%', height: '30%', rotate: '3deg' },
    { left: '63%', top: '8%', width: '28%', height: '42%', rotate: '-2deg' },
    { left: '12%', top: '56%', width: '18%', height: '22%', rotate: '2deg' },
    { left: '39%', top: '43%', width: '31%', height: '43%', rotate: '-3deg' },
    { left: '76%', top: '58%', width: '13%', height: '20%', rotate: '4deg' },
  ];

  refs.heroCollage.innerHTML = picks.map((work, index) => {
    const layout = layouts[index];
    return `
      <figure class="hero-piece" style="left:${layout.left};top:${layout.top};width:${layout.width};height:${layout.height};transform:rotate(${layout.rotate});">
        <img src="${escHtml(work.images[0] || '')}" alt="${escHtml(work.cnTitle)}">
      </figure>
    `;
  }).join('');
}

function renderTabs() {
  const tabs = ['全部', ...payload.summary.decades.map(item => item.label)];
  refs.decadeTabs.innerHTML = tabs.map(label => {
    const count = label === '全部'
      ? payload.summary.totalWorks
      : payload.summary.decades.find(item => item.label === label)?.count || 0;
    return `
      <button class="decade-tab${state.decade === label ? ' is-active' : ''}" type="button" data-decade="${escHtml(label)}">
        ${escHtml(label)} · ${count}
      </button>
    `;
  }).join('');
}

function openDialog(work) {
  if (!work) return;
  refs.workDialog.hidden = false;
  document.body.classList.add('modal-open');
  refs.dialogImage.src = work.images[0] || '';
  refs.dialogImage.alt = work.cnTitle || '';
  refs.dialogId.textContent = 'Plate ' + work.id;
  refs.dialogTitleCn.textContent = work.cnTitle || '';
  refs.dialogTitleEn.textContent = work.enTitle || '';
  refs.dialogFacts.innerHTML = [
    ['页码', String(work.page)],
    ['年代', work.year],
    ['材质', work.medium],
    ['尺寸', work.size],
  ].map(([label, value]) => `<div><dt>${escHtml(label)}</dt><dd>${escHtml(value || '')}</dd></div>`).join('');
  refs.dialogNote.textContent = work.note || '';
  refs.dialogNote.style.display = work.note ? 'block' : 'none';
  refs.dialogClose.focus();
}

function closeDialog() {
  refs.workDialog.hidden = true;
  document.body.classList.remove('modal-open');
}

function renderWorkCard(work) {
  const image = work.images[0] || '';
  const ratio = work.width && work.height ? (work.width / work.height).toFixed(4) : '1';
  return `
    <article class="work-card${state.selectedId === work.id ? ' is-selected' : ''}" data-id="${escHtml(work.id)}" tabindex="0">
      <div class="work-media" style="--ratio:${ratio};">
        <img src="${escHtml(image)}" alt="${escHtml(work.cnTitle)}" loading="lazy">
        <span class="work-badge">${escHtml(work.id)}</span>
      </div>
      <div class="work-copy">
        <h3 class="work-title-cn">${escHtml(work.cnTitle)}</h3>
        <p class="work-title-en">${escHtml(work.enTitle)}</p>
        <div class="work-facts">
          <span>${escHtml(work.year)}</span>
          <span>${escHtml(work.medium)}</span>
          <span>p.${escHtml(String(work.page))}</span>
          <span>${escHtml(work.size)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderGallery() {
  const filtered = getFilteredWorks();
  ensureSelection(filtered);
  refs.galleryMeta.textContent = filtered.length
    ? '当前显示 ' + filtered.length + ' 幅作品。点击图版查看大图。'
    : '没有匹配当前筛选条件的作品。';

  if (!filtered.length) {
    refs.gallerySections.innerHTML = '<div class="empty-state">可尝试清空检索词，或切换到其他年代。</div>';
    return;
  }

  refs.gallerySections.innerHTML = groupByDecade(filtered).map(group => `
    <section class="decade-section">
      <header class="decade-heading">
        <h2>${escHtml(group.label)}</h2>
        <p>${group.items.length} Works</p>
      </header>
      <div class="works-grid">
        ${group.items.map(renderWorkCard).join('')}
      </div>
    </section>
  `).join('');
}

function bindEvents() {
  refs.searchInput.addEventListener('input', event => {
    state.query = event.target.value || '';
    renderGallery();
  });

  refs.decadeTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-decade]');
    if (!button) return;
    state.decade = button.getAttribute('data-decade') || '全部';
    renderTabs();
    renderGallery();
  });

  refs.gallerySections.addEventListener('click', event => {
    const card = event.target.closest('[data-id]');
    if (!card) return;
    state.selectedId = card.getAttribute('data-id') || '';
    const work = works.find(item => item.id === state.selectedId);
    openDialog(work);
  });

  refs.gallerySections.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-id]');
    if (!card) return;
    event.preventDefault();
    state.selectedId = card.getAttribute('data-id') || '';
    const work = works.find(item => item.id === state.selectedId);
    openDialog(work);
  });

  refs.workDialog.addEventListener('click', event => {
    if (event.target.closest('[data-close-dialog]')) closeDialog();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !refs.workDialog.hidden) closeDialog();
  });
}

renderSummary();
renderHero();
renderTabs();
renderGallery();
bindEvents();