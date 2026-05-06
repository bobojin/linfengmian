const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const WORKBOOK_PATH = path.join(ROOT, 'data/docs/pdf-center/ART/林风眠作品集 (上海中国画院)-作品数据.xlsx');
const OUTPUT_DIR = path.join(ROOT, 'data/docs/pdf-center/ART/林风眠作品集 (上海中国画院)-展览网页');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');
const ASSETS_DIR = path.join(OUTPUT_DIR, 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');

const FONT_SOURCES = [
  { source: path.join(ROOT, 'fonts/zh/方正启体简体.ttf'), target: path.join(FONTS_DIR, 'title-zh.ttf') },
  { source: path.join(ROOT, 'fonts/zh/索尼明体.ttf'), target: path.join(FONTS_DIR, 'body-zh.ttf') },
  { source: path.join(ROOT, 'fonts/en/Bookerly.ttf'), target: path.join(FONTS_DIR, 'body-en.ttf') },
  { source: path.join(ROOT, 'fonts/en/AlegreyaSans.ttf'), target: path.join(FONTS_DIR, 'ui-en.ttf') },
];

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeFile(target, content) {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function copyFile(source, target) {
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function normalizeSpace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readRows() {
  const workbook = XLSX.readFile(WORKBOOK_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

function parseImagePaths(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function decadeLabel(year = '') {
  const text = String(year || '');
  if (text.includes('40') || text === '1947年') return '1940年代';
  if (text.includes('50')) return '1950年代';
  if (text.includes('60') || /^196\d年$/.test(text)) return '1960年代';
  if (text.includes('70') || /^197\d年$/.test(text)) return '1970年代';
  return text || '未标注';
}

function copyFonts() {
  for (const item of FONT_SOURCES) {
    if (!fs.existsSync(item.source)) continue;
    copyFile(item.source, item.target);
  }
}

function buildWorks(rows) {
  const works = [];
  const missingImages = [];
  for (const row of rows) {
    const id = String(row['编号'] || '').trim();
    const imageSources = parseImagePaths(row['图片文件路径']);
    const copiedImages = [];

    imageSources.forEach((relativePath, index) => {
      const sourcePath = path.join(ROOT, relativePath);
      const ext = path.extname(sourcePath) || '.jpg';
      const filename = `${id}-${String(index + 1).padStart(2, '0')}${ext.toLowerCase()}`;
      const targetPath = path.join(IMAGES_DIR, filename);
      if (fs.existsSync(sourcePath)) {
        copyFile(sourcePath, targetPath);
        copiedImages.push(`images/${filename}`);
      } else {
        missingImages.push(relativePath);
      }
    });

    works.push({
      id,
      page: Number(row['页码'] || 0),
      cnTitle: normalizeSpace(row['中文标题']),
      enTitle: normalizeSpace(row['英文标题']),
      year: normalizeSpace(row['年代']),
      decade: decadeLabel(row['年代']),
      medium: normalizeSpace(row['材质']),
      size: normalizeSpace(row['尺寸标准化']),
      width: Number(row['宽'] || 0),
      height: Number(row['高'] || 0),
      unit: normalizeSpace(row['单位']),
      note: String(row['英文补充信息'] || '').trim(),
      images: copiedImages,
    });
  }

  return { works, missingImages };
}

function buildSummary(works) {
  const decadeOrder = ['1940年代', '1950年代', '1960年代', '1970年代'];
  const counts = Object.fromEntries(decadeOrder.map(label => [label, 0]));
  for (const work of works) counts[work.decade] = (counts[work.decade] || 0) + 1;
  return {
    totalWorks: works.length,
    firstPage: Math.min(...works.map(work => work.page)),
    lastPage: Math.max(...works.map(work => work.page)),
    decades: decadeOrder.map(label => ({ label, count: counts[label] || 0 })),
  };
}

function renderIndexHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>林风眠作品集 | 图录展页</title>
  <meta name="description" content="基于《林风眠作品集（上海中国画院）》整理的离线图录展页。">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="page-grain" aria-hidden="true"></div>
  <main class="site-shell">
    <header class="masthead">
      <div class="masthead-copy">
        <p class="eyebrow">Shanghai Chinese Painting Academy Collection</p>
        <h1>林风眠作品图录</h1>
        <p class="subtitle">基于图版顺序重建的离线陈列页。每幅作品保留页码、年代、材质与尺寸。</p>
        <div class="summary-strip" id="summary-strip"></div>
      </div>
      <div class="hero-collage" id="hero-collage" aria-label="作品拼贴"></div>
    </header>

    <section class="control-bar" aria-label="筛选作品">
      <label class="search-field">
        <span>检索</span>
        <input id="search-input" type="search" placeholder="标题 / 年代 / 页码">
      </label>
      <div class="decade-tabs" id="decade-tabs"></div>
    </section>

    <section class="gallery-meta" id="gallery-meta"></section>
    <section class="gallery-sections" id="gallery-sections"></section>
  </main>

  <section class="work-dialog" id="work-dialog" hidden aria-modal="true" role="dialog" aria-labelledby="dialog-title-cn">
    <div class="work-dialog-backdrop" data-close-dialog></div>
    <div class="work-dialog-panel" role="document">
      <button class="work-dialog-close" id="dialog-close" type="button" data-close-dialog aria-label="关闭">×</button>
      <div class="work-dialog-media">
        <img id="dialog-image" alt="">
      </div>
      <div class="work-dialog-copy">
        <div class="work-dialog-id" id="dialog-id"></div>
        <h2 id="dialog-title-cn"></h2>
        <p class="work-dialog-title-en" id="dialog-title-en"></p>
        <dl class="work-dialog-facts" id="dialog-facts"></dl>
        <p class="work-dialog-note" id="dialog-note"></p>
      </div>
    </div>
  </section>

  <script src="assets/data.js"></script>
  <script src="assets/app.js"></script>
</body>
</html>`;
}

function renderStylesCss() {
  return `@font-face {
  font-family: 'LFMTitleZh';
  src: url('assets/fonts/title-zh.ttf') format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'LFMBodyZh';
  src: url('assets/fonts/body-zh.ttf') format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'LFMBodyEn';
  src: url('assets/fonts/body-en.ttf') format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'LFMUiEn';
  src: url('assets/fonts/ui-en.ttf') format('truetype');
  font-display: swap;
}

:root {
  color-scheme: light;
  --paper: oklch(0.965 0.015 82);
  --paper-deep: oklch(0.92 0.02 80);
  --ink: oklch(0.28 0.03 48);
  --ink-soft: oklch(0.46 0.03 48);
  --line: oklch(0.78 0.02 72 / 0.75);
  --seal: oklch(0.58 0.18 28);
  --seal-soft: oklch(0.7 0.08 42);
  --gold-dust: oklch(0.8 0.06 76);
  --shadow: 0 24px 70px oklch(0.36 0.02 50 / 0.12);
  --site-max: 1540px;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, oklch(0.92 0.03 80 / 0.8), transparent 32%),
    radial-gradient(circle at 85% 10%, oklch(0.9 0.05 62 / 0.32), transparent 26%),
    linear-gradient(180deg, oklch(0.98 0.01 90), var(--paper));
  color: var(--ink);
  font-family: 'LFMBodyZh', 'Source Han Serif SC', serif;
}

.page-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  background:
    repeating-linear-gradient(90deg, transparent 0 2px, oklch(0.78 0.01 80 / 0.05) 2px 3px),
    repeating-linear-gradient(180deg, transparent 0 3px, oklch(0.7 0.01 80 / 0.03) 3px 4px);
  mix-blend-mode: multiply;
}

.site-shell {
  position: relative;
  z-index: 1;
  width: min(calc(100% - clamp(1.2rem, 3vw, 3.6rem)), var(--site-max));
  margin: 0 auto;
  padding: clamp(1.25rem, 2vw, 2rem) 0 clamp(3rem, 4vw, 5rem);
}

.masthead {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
  gap: clamp(1.5rem, 3vw, 3rem);
  align-items: stretch;
  padding: clamp(1.25rem, 2vw, 2rem) 0 clamp(1.5rem, 2vw, 2.5rem);
}

.masthead-copy {
  display: grid;
  gap: 1.1rem;
  align-content: center;
}

.eyebrow {
  margin: 0;
  color: var(--seal);
  font: 600 0.82rem/1.2 'LFMUiEn', sans-serif;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.masthead h1 {
  margin: 0;
  font-family: 'LFMTitleZh', 'LFMBodyZh', serif;
  font-size: clamp(3.2rem, 7vw, 6.8rem);
  line-height: 0.95;
  letter-spacing: 0.02em;
  color: color-mix(in oklch, var(--ink) 88%, var(--seal) 12%);
}

.subtitle {
  margin: 0;
  max-width: 36rem;
  color: var(--ink-soft);
  font-size: clamp(1rem, 1vw + 0.82rem, 1.2rem);
  line-height: 1.85;
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.4rem;
}

.summary-chip {
  padding: 0.78rem 1rem;
  border: 1px solid color-mix(in oklch, var(--line) 76%, var(--seal) 24%);
  background: color-mix(in oklch, var(--paper) 84%, white 16%);
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.4);
  min-width: 10rem;
}

.summary-chip strong {
  display: block;
  font-family: 'LFMUiEn', sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--seal);
}

.summary-chip span {
  display: block;
  margin-top: 0.32rem;
  font-size: 1.05rem;
}

.hero-collage {
  position: relative;
  min-height: clamp(22rem, 48vw, 41rem);
  border: 1px solid color-mix(in oklch, var(--line) 72%, var(--seal-soft) 28%);
  background:
    linear-gradient(160deg, oklch(0.93 0.02 84 / 0.88), oklch(0.98 0.008 84 / 0.9)),
    radial-gradient(circle at top right, oklch(0.84 0.06 63 / 0.3), transparent 28%);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.hero-collage::before,
.hero-collage::after {
  content: '';
  position: absolute;
  inset: 1.15rem;
  border: 1px solid color-mix(in oklch, var(--line) 82%, transparent 18%);
  pointer-events: none;
}

.hero-collage::after {
  inset: auto 1.15rem 1.15rem auto;
  width: 6.2rem;
  height: 6.2rem;
  border: none;
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--seal) 20%, transparent 80%), transparent),
    linear-gradient(90deg, var(--seal), color-mix(in oklch, var(--seal) 55%, var(--gold-dust) 45%));
  mix-blend-mode: multiply;
  opacity: 0.35;
}

.hero-piece {
  position: absolute;
  overflow: hidden;
  background: color-mix(in oklch, white 45%, var(--paper) 55%);
  box-shadow: 0 14px 40px oklch(0.28 0.03 48 / 0.14);
}

.hero-piece img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.control-bar {
  display: grid;
  grid-template-columns: minmax(16rem, 22rem) 1fr;
  gap: 1rem;
  align-items: end;
  margin-bottom: 1.2rem;
  padding: 1rem 0 1.15rem;
  border-bottom: 1px solid var(--line);
}

.search-field {
  display: grid;
  gap: 0.45rem;
}

.search-field span {
  font: 700 0.8rem/1.1 'LFMUiEn', sans-serif;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.search-field input {
  width: 100%;
  border: none;
  border-bottom: 1px solid color-mix(in oklch, var(--line) 70%, var(--seal) 30%);
  padding: 0.7rem 0 0.55rem;
  background: transparent;
  color: var(--ink);
  font: 400 1rem/1.4 'LFMBodyZh', serif;
  outline: none;
}

.search-field input:focus {
  border-bottom-color: var(--seal);
}

.decade-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.decade-tab {
  border: 1px solid color-mix(in oklch, var(--line) 74%, var(--seal-soft) 26%);
  background: color-mix(in oklch, var(--paper) 72%, white 28%);
  color: var(--ink-soft);
  padding: 0.72rem 1rem;
  font: 600 0.88rem/1 'LFMUiEn', sans-serif;
  letter-spacing: 0.05em;
  cursor: pointer;
}

.decade-tab.is-active {
  background: color-mix(in oklch, var(--seal) 16%, white 84%);
  color: color-mix(in oklch, var(--ink) 80%, var(--seal) 20%);
  border-color: color-mix(in oklch, var(--seal) 45%, var(--line) 55%);
}

body.modal-open {
  overflow: hidden;
}

.work-dialog {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: clamp(1rem, 2vw, 2rem);
}

.work-dialog[hidden] {
  display: none;
}

.work-dialog-backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, oklch(0.22 0.02 40 / 0.62), oklch(0.16 0.015 40 / 0.72));
  backdrop-filter: blur(10px);
}

.work-dialog-panel {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(20rem, 0.82fr);
  width: min(82rem, calc(100vw - 3rem));
  max-height: calc(100vh - 3rem);
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--line) 70%, var(--seal-soft) 30%);
  background:
    linear-gradient(180deg, oklch(0.985 0.008 90 / 0.98), oklch(0.94 0.018 82 / 0.98));
  box-shadow: 0 40px 120px oklch(0.18 0.02 44 / 0.28);
}

.work-dialog-media {
  display: grid;
  place-items: center;
  min-height: 28rem;
  padding: clamp(1rem, 2vw, 1.6rem);
  background:
    radial-gradient(circle at top right, oklch(0.88 0.04 68 / 0.22), transparent 24%),
    color-mix(in oklch, white 38%, var(--paper) 62%);
}

.work-dialog-media img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: calc(100vh - 8rem);
  object-fit: contain;
}

.work-dialog-copy {
  display: grid;
  align-content: start;
  gap: 0.7rem;
  overflow: auto;
  padding: clamp(1.2rem, 2vw, 1.8rem);
  border-left: 1px solid var(--line);
  background:
    linear-gradient(180deg, oklch(0.985 0.008 90 / 0.92), oklch(0.955 0.014 82 / 0.95));
}

.work-dialog-close {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  z-index: 2;
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid color-mix(in oklch, var(--line) 74%, var(--seal-soft) 26%);
  background: color-mix(in oklch, var(--paper) 65%, white 35%);
  color: var(--ink);
  font: 400 1.5rem/1 'LFMBodyEn', 'LFMBodyZh', serif;
  cursor: pointer;
}

.work-dialog-id {
  display: inline-flex;
  width: fit-content;
  padding: 0.35rem 0.55rem;
  background: color-mix(in oklch, var(--seal) 18%, white 82%);
  color: var(--seal);
  font: 700 0.75rem/1 'LFMUiEn', sans-serif;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.work-dialog-copy h2 {
  margin: 0;
  font-size: clamp(2rem, 2vw, 2.8rem);
  line-height: 1.06;
}

.work-dialog-title-en {
  margin: 0;
  color: var(--ink-soft);
  font: 400 1rem/1.5 'LFMBodyEn', 'LFMBodyZh', serif;
  letter-spacing: 0.05em;
}

.work-dialog-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem 1rem;
  margin: 0;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

.work-dialog-facts div {
  display: grid;
  gap: 0.3rem;
}

.work-dialog-facts dt {
  margin: 0;
  font: 700 0.72rem/1 'LFMUiEn', sans-serif;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.work-dialog-facts dd {
  margin: 0;
  line-height: 1.7;
}

.work-dialog-note {
  margin: 0;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font: 400 0.96rem/1.75 'LFMBodyEn', 'LFMBodyZh', serif;
  white-space: pre-line;
}

.gallery-meta {
  margin-bottom: 1rem;
  color: var(--ink-soft);
  font-size: 0.96rem;
}

.gallery-sections {
  display: grid;
  gap: 2rem;
}

.decade-section {
  display: grid;
  gap: 0.9rem;
}

.decade-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--line);
}

.decade-heading h2 {
  margin: 0;
  font: 400 clamp(1.5rem, 2vw, 2.3rem)/1.1 'LFMBodyEn', 'LFMBodyZh', serif;
  letter-spacing: 0.03em;
}

.decade-heading p {
  margin: 0;
  color: var(--ink-soft);
  font: 600 0.78rem/1 'LFMUiEn', sans-serif;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.works-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(0.9rem, 1.2vw, 1.25rem);
}

.work-card {
  position: relative;
  display: grid;
  gap: 0.7rem;
  padding: 0.75rem;
  border: 1px solid color-mix(in oklch, var(--line) 78%, transparent 22%);
  background:
    linear-gradient(180deg, oklch(0.99 0.006 90 / 0.92), oklch(0.95 0.014 82 / 0.92));
  box-shadow: 0 10px 28px oklch(0.29 0.02 52 / 0.08);
  cursor: pointer;
}

.work-card::after {
  content: '';
  position: absolute;
  inset: 0.6rem;
  border: 1px solid color-mix(in oklch, var(--line) 74%, transparent 26%);
  pointer-events: none;
}

.work-media {
  position: relative;
  overflow: hidden;
  background: color-mix(in oklch, white 34%, var(--paper) 66%);
  aspect-ratio: var(--ratio, 1);
}

.work-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.work-badge {
  position: absolute;
  left: 0.75rem;
  top: 0.75rem;
  padding: 0.34rem 0.48rem;
  background: color-mix(in oklch, var(--seal) 18%, white 82%);
  color: var(--seal);
  font: 700 0.74rem/1 'LFMUiEn', sans-serif;
  letter-spacing: 0.16em;
}

.work-copy {
  display: grid;
  gap: 0.38rem;
}

.work-title-cn {
  margin: 0;
  font-size: 1.28rem;
}

.work-title-en {
  margin: 0;
  color: var(--ink-soft);
  font: 400 0.95rem/1.45 'LFMBodyEn', 'LFMBodyZh', serif;
  letter-spacing: 0.04em;
}

.work-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.8rem;
  color: var(--ink-soft);
  font-size: 0.92rem;
}

.empty-state {
  padding: 2rem 0;
  color: var(--ink-soft);
  line-height: 1.8;
}

@media (max-width: 1100px) {
  .masthead,
  .work-dialog-panel {
    grid-template-columns: 1fr;
  }

  .work-dialog-copy {
    border-left: none;
    border-top: 1px solid var(--line);
  }

  .work-dialog-media {
    min-height: 20rem;
    max-height: 48vh;
  }

  .works-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 840px) {
  .control-bar {
    grid-template-columns: 1fr;
  }

  .works-grid,
  .work-dialog-facts {
    grid-template-columns: 1fr;
  }

  .work-dialog {
    padding: 0.85rem;
  }

  .work-dialog-panel {
    width: 100%;
    max-height: calc(100vh - 1.7rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}`;
}

function renderAppJs() {
  return `const payload = window.LIN_FENGMIAN_WORKS_DATA || { works: [], summary: { decades: [] } };
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
  refs.summaryStrip.innerHTML = chips.map(item => \`
    <div class="summary-chip">
      <strong>\${escHtml(item.label)}</strong>
      <span>\${escHtml(item.value)}</span>
    </div>
  \`).join('');
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
    return \`
      <figure class="hero-piece" style="left:\${layout.left};top:\${layout.top};width:\${layout.width};height:\${layout.height};transform:rotate(\${layout.rotate});">
        <img src="\${escHtml(work.images[0] || '')}" alt="\${escHtml(work.cnTitle)}">
      </figure>
    \`;
  }).join('');
}

function renderTabs() {
  const tabs = ['全部', ...payload.summary.decades.map(item => item.label)];
  refs.decadeTabs.innerHTML = tabs.map(label => {
    const count = label === '全部'
      ? payload.summary.totalWorks
      : payload.summary.decades.find(item => item.label === label)?.count || 0;
    return \`
      <button class="decade-tab\${state.decade === label ? ' is-active' : ''}" type="button" data-decade="\${escHtml(label)}">
        \${escHtml(label)} · \${count}
      </button>
    \`;
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
  ].map(([label, value]) => \`<div><dt>\${escHtml(label)}</dt><dd>\${escHtml(value || '')}</dd></div>\`).join('');
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
  return \`
    <article class="work-card\${state.selectedId === work.id ? ' is-selected' : ''}" data-id="\${escHtml(work.id)}" tabindex="0">
      <div class="work-media" style="--ratio:\${ratio};">
        <img src="\${escHtml(image)}" alt="\${escHtml(work.cnTitle)}" loading="lazy">
        <span class="work-badge">\${escHtml(work.id)}</span>
      </div>
      <div class="work-copy">
        <h3 class="work-title-cn">\${escHtml(work.cnTitle)}</h3>
        <p class="work-title-en">\${escHtml(work.enTitle)}</p>
        <div class="work-facts">
          <span>\${escHtml(work.year)}</span>
          <span>\${escHtml(work.medium)}</span>
          <span>p.\${escHtml(String(work.page))}</span>
          <span>\${escHtml(work.size)}</span>
        </div>
      </div>
    </article>
  \`;
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

  refs.gallerySections.innerHTML = groupByDecade(filtered).map(group => \`
    <section class="decade-section">
      <header class="decade-heading">
        <h2>\${escHtml(group.label)}</h2>
        <p>\${group.items.length} Works</p>
      </header>
      <div class="works-grid">
        \${group.items.map(renderWorkCard).join('')}
      </div>
    </section>
  \`).join('');
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
bindEvents();`;
}

function buildDataPayload(works) {
  return {
    generatedAt: new Date().toISOString(),
    summary: buildSummary(works),
    works,
  };
}

function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(IMAGES_DIR);
  ensureDir(FONTS_DIR);

  copyFonts();
  const rows = readRows();
  const { works, missingImages } = buildWorks(rows);
  const payload = buildDataPayload(works);

  writeFile(path.join(OUTPUT_DIR, 'index.html'), renderIndexHtml());
  writeFile(path.join(OUTPUT_DIR, 'styles.css'), renderStylesCss());
  writeFile(path.join(ASSETS_DIR, 'app.js'), renderAppJs());
  writeFile(path.join(ASSETS_DIR, 'data.js'), `window.LIN_FENGMIAN_WORKS_DATA = ${JSON.stringify(payload, null, 2)};`);

  process.stdout.write(JSON.stringify({
    outputDir: OUTPUT_DIR,
    works: works.length,
    copiedImages: works.reduce((sum, work) => sum + work.images.length, 0),
    missingImages,
  }, null, 2));
}

main();
