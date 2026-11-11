'use strict';

/* =========================================================
   살림재고 — 생활용품 재고 관리 (개인용 PWA)
   데이터는 이 기기의 localStorage에만 저장됩니다.
   ========================================================= */

const KEY = 'salim-jaego.v1';
const BACKUP_KEY = KEY + '.lastBackup';
const DAY = 86400000;

const CATEGORIES = [
  { id: 'bath', name: '세면도구', icon: '🧴' },
  { id: 'living', name: '생활용품', icon: '🧻' },
  { id: 'kitchen', name: '주방용품', icon: '🍽️' },
  { id: 'food', name: '식재료', icon: '🥬' },
  { id: 'pet', name: '고양이', icon: '🐱' },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// 빠른 추가용 기본 품목 [이름, 단위, 추천 최소량, 배수]
//   배수: 'p' = 사람 수만큼, 'c' = 고양이 수만큼, 없으면 집 전체 기준
const PRESETS = {
  bath: [
    ['칫솔', '개', 1, 'p'], ['치약', '개', 1], ['샴푸', '통', 1], ['린스', '통', 1], ['트리트먼트', '통', 1],
    ['바디워시', '통', 1], ['비누', '개', 1], ['핸드워시', '통', 1], ['폼클렌징', '개', 1, 'p'],
    ['클렌징오일', '통', 1], ['스킨/로션', '개', 1, 'p'], ['선크림', '개', 1, 'p'], ['가글', '통', 1],
    ['면도날', '개', 2], ['면도크림', '개', 1], ['치실', '개', 1], ['면봉', '통', 1], ['화장솜', '팩', 1],
    ['생리대', '팩', 1],
  ],
  living: [
    ['두루마리 휴지', '롤', 3, 'p'], ['각티슈', '개', 2], ['물티슈', '팩', 2], ['세탁세제', '통', 1],
    ['섬유유연제', '통', 1], ['락스', '통', 1], ['욕실세정제', '통', 1], ['변기세정제', '개', 1],
    ['섬유탈취제', '통', 1], ['방향제', '개', 1], ['제습제', '개', 2], ['물걸레 청소포', '팩', 1],
    ['종량제 봉투', '장', 5], ['음식물 봉투', '장', 5], ['건전지', '개', 4], ['전구', '개', 1],
    ['마스크', '개', 5, 'p'],
  ],
  kitchen: [
    ['주방세제', '통', 1], ['식기세척기 세제', '통', 1], ['수세미', '개', 2], ['키친타올', '롤', 2],
    ['랩', '개', 1], ['지퍼백', '팩', 1], ['쿠킹호일', '개', 1], ['비닐봉투(롤백)', '롤', 1],
    ['고무장갑', '켤레', 1], ['위생장갑', '팩', 1], ['행주', '장', 2], ['베이킹소다', '통', 1],
    ['구연산', '통', 1], ['종이컵', '줄', 1], ['일회용 수저', '팩', 1], ['커피필터', '팩', 1],
    ['정수기 필터', '개', 1],
  ],
  food: [
    ['쌀', 'kg', 2], ['계란', '개', 4, 'p'], ['우유', '팩', 1], ['두부', '모', 1], ['양파', '개', 2],
    ['대파', '단', 1], ['마늘', '봉', 1], ['감자', '개', 2], ['김치', '통', 1], ['라면', '개', 2, 'p'],
    ['생수', '병', 6, 'p'], ['간장', '병', 1], ['고추장', '통', 1], ['된장', '통', 1], ['식용유', '병', 1],
    ['참기름', '병', 1], ['설탕', '봉', 1], ['소금', '봉', 1], ['밀가루', '봉', 1], ['커피', '봉', 1],
  ],
  pet: [
    ['건사료', '봉', 1], ['습식 캔/파우치', '개', 7, 'c'], ['츄르', '개', 10, 'c'], ['간식', '봉', 1],
    ['고양이 모래', '포대', 2], ['모래 탈취제', '통', 1], ['배변봉투', '장', 20], ['영양제', '통', 1],
    ['헤어볼 영양제', '개', 1], ['구충제', '개', 1, 'c'], ['반려동물 물티슈', '팩', 1], ['스크래쳐', '개', 1],
  ],
};
const UNITS = ['개', '롤', '통', '팩', '장', '켤레', '병', '봉', '박스', 'kg', '단', '모', '캔', '포대', '줄'];
const DEFAULT_HOUSEHOLD = { people: 2, cats: 2 };
// 구매처: type 'offline'(매장) | 'online'(배송). leadDays = 온라인 배송 기간(일)
const defaultStores = () => [
  { id: 's-kmart', name: '케이마트', type: 'offline', leadDays: 0 },
  { id: 's-mega', name: '메가마트', type: 'offline', leadDays: 0 },
  { id: 's-shopee', name: '쇼피', type: 'online', leadDays: 3 },
];
const storeIcon = s => (s && s.type === 'online' ? '📦' : '🛒');
const STATUS_LABEL = { out: '없음', low: '부족', soon: '곧 소진', ok: '' };
const STATUS_ORDER = { out: 0, low: 1, soon: 2, ok: 3 };

let state = load();
const ui = { tab: 'stock', cat: 'all', q: '', shopStore: 'all' };
let undo = null;
let toastTimer = null;

/* ---------------- 저장 ---------------- */

function emptyState() {
  return { version: 1, household: { ...DEFAULT_HOUSEHOLD }, stores: defaultStores(), items: [], purchases: [], logs: [] };
}

function normalize(d) {
  if (!d || !Array.isArray(d.items)) throw new Error('재고 데이터 형식이 아니에요');
  return {
    version: 1,
    household: { ...DEFAULT_HOUSEHOLD, ...(d.household || {}) },
    stores: Array.isArray(d.stores) ? d.stores : defaultStores(),
    items: d.items,
    purchases: Array.isArray(d.purchases) ? d.purchases : [],
    logs: Array.isArray(d.logs) ? d.logs : [],
  };
}

// 가족 구성에 맞춘 추천 최소 보유량
function suggestMin(p) {
  const h = state.household;
  const mult = p[3] === 'p' ? h.people : p[3] === 'c' ? h.cats : 1;
  return Math.max(0, Math.round(p[2] * mult));
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return emptyState();
}

function save() {
  if (state.logs.length > 5000) state.logs = state.logs.slice(-5000);
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert('저장에 실패했어요: ' + e.message); }
}

/* ---------------- 유틸 ---------------- */

const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const find = id => state.items.find(i => i.id === id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayStr = () => ymd(new Date());
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / DAY); }
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const num = n => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
const toNum = (v, def = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };

/* ---------------- 계산 ---------------- */

function stats(item) {
  const ps = state.purchases
    .filter(p => p.itemId === item.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = ps[ps.length - 1] || null;

  let best = null;
  for (const p of ps) {
    if (p.price > 0 && p.qty > 0) {
      const unit = p.price / p.qty;
      if (!best || unit < best.unit) best = { unit, store: p.store, date: p.date };
    }
  }
  const lastPriced = [...ps].reverse().find(p => p.price > 0 && p.qty > 0);
  const lastUnit = lastPriced ? lastPriced.price / lastPriced.qty : null;
  const interval = ps.length >= 2 ? daysBetween(ps[0].date, last.date) / (ps.length - 1) : null;

  // 하루 소비량: 1) −버튼 사용 기록(7일 이상 쌓였을 때) 2) 구매 이력
  let rate = null;
  const uses = state.logs.filter(l => l.itemId === item.id && l.delta < 0);
  if (uses.length) {
    const span = (Date.now() - uses[0].at) / DAY;
    if (span >= 7) rate = uses.reduce((s, l) => s - l.delta, 0) / span;
  }
  if (rate == null && ps.length >= 2) {
    const span = daysBetween(ps[0].date, last.date);
    if (span > 0) rate = ps.slice(0, -1).reduce((s, p) => s + p.qty, 0) / span;
  }
  const daysLeft = rate > 0 ? Math.floor(item.qty / rate) : null;

  return { ps, last, best, lastUnit, interval, rate, daysLeft };
}

function statusOf(item, st) {
  if (item.qty <= 0) return 'out';
  if (item.qty < item.minQty) return 'low';
  if (st.daysLeft != null && st.daysLeft <= 7) return 'soon';
  return 'ok';
}

const storeById = id => state.stores.find(s => s.id === id);

// 품목을 어디서 살지: 1) 지정한 주 구매처 2) 마지막 구매처 3) 미정
function storeFor(item, st) {
  const s = item.storeId && storeById(item.storeId);
  if (s) return { key: s.id, name: s.name, store: s, guessed: false };
  const lastName = st.last && st.last.store;
  if (lastName) {
    const m = state.stores.find(x => x.name === lastName);
    return m
      ? { key: m.id, name: m.name, store: m, guessed: true }
      : { key: 'n:' + lastName, name: lastName, store: null, guessed: true };
  }
  return { key: 'none', name: '구매처 미정', store: null, guessed: false };
}

function shoppingItems() {
  const need = [], soon = [];
  for (const item of state.items) {
    const st = stats(item);
    const s = statusOf(item, st);
    const where = storeFor(item, st);
    // 온라인 구매처는 배송 기간만큼 미리 장보기에 올림
    const lead = where.store && where.store.type === 'online' ? where.store.leadDays || 0 : 0;
    const early = (s === 'ok' || s === 'soon') && lead > 0 && st.daysLeft != null && st.daysLeft <= lead;
    const r = { item, st, s, where, early, lead };
    if (s === 'out' || s === 'low' || item.onList || early) need.push(r);
    else if (s === 'soon') soon.push(r);
  }
  return { need, soon };
}

/* ---------------- 렌더: 공통 ---------------- */

function render() {
  document.querySelectorAll('.tabbar button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === ui.tab));
  $('#title').textContent = { stock: '재고', shop: '장보기', settings: '설정' }[ui.tab];
  $('.fab').hidden = ui.tab === 'settings';

  $('#main').innerHTML =
    ui.tab === 'stock' ? renderStock() :
    ui.tab === 'shop' ? renderShop() : renderSettings();

  const n = shoppingItems().need.length;
  const badge = $('#shop-badge');
  badge.hidden = !n;
  badge.textContent = n;
}

function tagHtml(s) {
  return s === 'ok' ? '' : `<span class="tag ${s}">${STATUS_LABEL[s]}</span>`;
}

function sheetHead(title, sub = '') {
  return `<div class="sheet-head">
    <div>${sub ? `<small>${sub}</small>` : ''}<h2>${title}</h2></div>
    <button type="button" class="icon" data-action="close" aria-label="닫기" autofocus>✕</button>
  </div>`;
}

/* ---------------- 렌더: 재고 ---------------- */

function renderStock() {
  if (!state.items.length) {
    return `<div class="empty-big">
      <p class="big">📦</p>
      <p><b>아직 등록된 품목이 없어요</b></p>
      <p class="muted">집에 있는 물건을 먼저 등록해 보세요.</p>
      <button class="btn primary" data-action="bulk">기본 품목에서 골라 추가</button>
      <button class="btn" data-action="new-item">직접 추가</button>
    </div>`;
  }

  let out = 0, soon = 0;
  for (const i of state.items) {
    const s = statusOf(i, stats(i));
    if (s === 'out' || s === 'low') out++;
    else if (s === 'soon') soon++;
  }

  const chips = [{ id: 'all', name: '전체', icon: '' }, ...CATEGORIES].map(c =>
    `<button class="chip ${ui.cat === c.id ? 'on' : ''}" data-action="cat" data-id="${c.id}">${c.icon} ${c.name}</button>`
  ).join('');

  return `
    <div class="summary">
      <button class="sum ${out ? 'red' : ''}" data-tab="shop"><b>${out}</b><span>부족</span></button>
      <button class="sum ${soon ? 'orange' : ''}" data-tab="shop"><b>${soon}</b><span>곧 소진</span></button>
      <div class="sum"><b>${state.items.length}</b><span>전체 품목</span></div>
    </div>
    <div class="chips">${chips}</div>
    <input class="search" type="search" placeholder="품목 검색" value="${esc(ui.q)}" data-input="search">
    <div id="stock-list">${stockListHtml()}</div>`;
}

function stockListHtml() {
  const q = ui.q.trim().toLowerCase();
  const cats = ui.cat === 'all' ? CATEGORIES : [CAT[ui.cat]];
  let html = '';
  for (const c of cats) {
    const rows = state.items
      .filter(i => i.category === c.id && (!q || i.name.toLowerCase().includes(q)))
      .map(item => { const st = stats(item); return { item, st, s: statusOf(item, st) }; })
      .sort((a, b) => STATUS_ORDER[a.s] - STATUS_ORDER[b.s] || a.item.name.localeCompare(b.item.name, 'ko'));
    if (!rows.length) continue;
    html += `<section>
      <h2 class="sec">${c.icon} ${c.name} <small>${rows.length}</small></h2>
      <ul class="list">${rows.map(stockRow).join('')}</ul>
    </section>`;
  }
  return html || `<p class="empty">${q ? '검색 결과가 없어요' : '이 분류에 품목이 없어요'}</p>`;
}

function stockRow({ item, st, s }) {
  const sub = [];
  if (s !== 'ok') sub.push(tagHtml(s));
  if (st.daysLeft != null) sub.push(`약 ${st.daysLeft}일분`);
  else sub.push(`최소 ${num(item.minQty)}${esc(item.unit)}`);
  if (item.onList) sub.push('🛒');
  return `<li class="row ${s}">
    <button class="row-main" data-action="detail" data-id="${item.id}">
      <span class="name">${esc(item.name)}</span>
      <span class="sub">${sub.join(' · ')}</span>
    </button>
    <div class="stepper">
      <button data-action="dec" data-id="${item.id}" aria-label="${esc(item.name)} 하나 사용">−</button>
      <span class="qty"><b>${num(item.qty)}</b><small>${esc(item.unit)}</small></span>
      <button data-action="inc" data-id="${item.id}" aria-label="${esc(item.name)} 하나 추가">+</button>
    </div>
  </li>`;
}

/* ---------------- 렌더: 장보기 ---------------- */

function renderShop() {
  const { need, soon } = shoppingItems();
  if (!need.length && !soon.length) {
    return `<div class="empty-big">
      <p class="big">🎉</p>
      <p><b>지금 살 게 없어요</b></p>
      <p class="muted">재고가 최소 보유량보다 적어지거나<br>품목 상세에서 ‘장보기에 추가’하면 여기에 나타나요.</p>
    </div>`;
  }

  // 구매처 목록 (등록 순서 → 이름만 있는 곳 → 미정)
  const info = new Map();
  for (const r of [...need, ...soon]) {
    const w = r.where;
    if (!info.has(w.key)) info.set(w.key, { ...w, need: 0 });
    if (need.includes(r)) info.get(w.key).need++;
  }
  const rank = k => {
    const i = state.stores.findIndex(s => s.id === k);
    return i >= 0 ? i : k === 'none' ? 1e6 : 1e5;
  };
  const keys = [...info.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ko'));
  if (ui.shopStore !== 'all' && !info.has(ui.shopStore)) ui.shopStore = 'all';
  const pick = r => ui.shopStore === 'all' || r.where.key === ui.shopStore;

  const tabs = [`<button class="chip ${ui.shopStore === 'all' ? 'on' : ''}" data-action="shop-store" data-id="all">전체<span class="cnt">${need.length || ''}</span></button>`]
    .concat(keys.map(k => {
      const g = info.get(k);
      const icon = k === 'none' ? '❔' : storeIcon(g.store);
      return `<button class="chip ${ui.shopStore === k ? 'on' : ''}" data-action="shop-store" data-id="${esc(k)}">${icon} ${esc(g.name)}<span class="cnt">${g.need || ''}</span></button>`;
    })).join('');

  const needF = need.filter(pick);
  const soonF = soon.filter(pick);
  let html = `<div class="chips shop-tabs">${tabs}</div>`;

  if (needF.length) {
    html += `<p class="hint">사야 할 것 <b>${needF.length}</b>개</p>`;
    for (const k of keys) {
      const rows = needF.filter(r => r.where.key === k)
        .sort((a, b) => STATUS_ORDER[a.s] - STATUS_ORDER[b.s] || a.item.name.localeCompare(b.item.name, 'ko'));
      if (!rows.length) continue;
      const g = info.get(k);
      const meta = g.store
        ? (g.store.type === 'online' ? `온라인 · 배송 ${g.store.leadDays || 0}일` : '매장')
        : (k === 'none' ? '품목 수정에서 구매처를 정해 주세요' : '최근 구매처');
      html += `<section><h2 class="sec">${k === 'none' ? '❔' : storeIcon(g.store)} ${esc(g.name)} <small>${rows.length} · ${meta}</small></h2>
        <ul class="list">${rows.map(shopRow).join('')}</ul></section>`;
    }
  } else {
    html += `<p class="empty">${ui.shopStore === 'all' ? '지금 꼭 사야 할 건 없어요' : '이 구매처에서 지금 살 건 없어요'}</p>`;
  }
  if (soonF.length) {
    html += `<section><h2 class="sec">⏳ 미리 사둘까요? <small>${soonF.length}</small></h2>
      <p class="hint">일주일 안에 떨어질 것 같은 품목이에요</p>
      <ul class="list">${soonF.map(shopRow).join('')}</ul></section>`;
  }
  return html;
}

function shopRow({ item, st, s, where, early, lead }) {
  const u = esc(item.unit);
  const info = [`남은 ${num(item.qty)}${u}`];
  if (early) info.unshift(`<span class="tag soon">배송 ${lead}일 고려</span> 약 ${st.daysLeft}일분`);
  if (ui.shopStore === 'all' && s === 'soon' && !early) info.push(`${storeIcon(where.store)} ${esc(where.name)}`);
  if (st.lastUnit) info.push(`최근 ${won(st.lastUnit)}/${u}`);
  if (st.best && st.lastUnit && st.best.unit < st.lastUnit) {
    info.push(`최저 ${won(st.best.unit)}${st.best.store ? ` (${esc(st.best.store)})` : ''}`);
  }
  return `<li class="row ${s}">
    <button class="row-main" data-action="detail" data-id="${item.id}">
      <span class="name">${esc(item.name)} ${early ? '' : tagHtml(s)}${item.onList && s !== 'out' && s !== 'low' ? '<span class="tag">직접 추가</span>' : ''}</span>
      <span class="sub">${info.join(' · ')}</span>
    </button>
    <button class="btn small primary" data-action="buy" data-id="${item.id}">샀어요</button>
  </li>`;
}

/* ---------------- 렌더: 설정 ---------------- */

function renderSettings() {
  const last = localStorage.getItem(BACKUP_KEY);
  const h = state.household;
  return `
    <section class="card">
      <h2>우리집</h2>
      <p class="muted">기본 품목을 추가할 때 추천 최소 보유량을 계산하는 데 쓰여요. (예: 칫솔은 사람 수만큼, 츄르는 고양이 수만큼)</p>
      <form id="hh-form" class="grid2">
        <label>👤 사람<input type="number" inputmode="numeric" min="0" max="20" step="1" data-hh="people" value="${h.people}"></label>
        <label>🐱 고양이<input type="number" inputmode="numeric" min="0" max="20" step="1" data-hh="cats" value="${h.cats}"></label>
      </form>
    </section>
    <section class="card">
      <h2>구매처</h2>
      <p class="muted">품목마다 주 구매처를 정하면 장보기 목록이 구매처별로 나뉘어요. 온라인은 배송 기간만큼 미리 장보기에 올려 줘요.</p>
      <ul class="store-list">
        ${state.stores.map(s => {
          const n = state.items.filter(i => i.storeId === s.id).length;
          return `<li>
            <span class="store-ico">${storeIcon(s)}</span>
            <span class="store-name"><b>${esc(s.name)}</b><small>${s.type === 'online' ? `온라인 · 배송 ${s.leadDays || 0}일` : '매장'} · 품목 ${n}개</small></span>
            <button class="btn small" data-action="edit-store" data-id="${s.id}">수정</button>
          </li>`;
        }).join('') || '<li class="muted">등록된 구매처가 없어요</li>'}
      </ul>
      <button class="btn" data-action="new-store">+ 구매처 추가</button>
    </section>
    <section class="card">
      <h2>품목</h2>
      <p class="muted">품목 ${state.items.length}개 · 구매 기록 ${state.purchases.length}건</p>
      <button class="btn" data-action="bulk">기본 품목에서 골라 추가</button>
    </section>
    <section class="card">
      <h2>백업</h2>
      <p class="muted">데이터는 이 폰의 브라우저 안에만 저장돼요. 앱 데이터를 지우거나 폰을 바꾸면 사라지니 가끔 백업 파일을 받아두세요.</p>
      <p class="muted">마지막 백업: <b>${last ? esc(last) : '없음'}</b></p>
      <div class="actions">
        <button class="btn primary" data-action="export">백업 파일 받기</button>
        <button class="btn" data-action="import">백업 불러오기</button>
      </div>
    </section>
    <section class="card">
      <h2>초기화</h2>
      <button class="btn danger" data-action="reset">모든 데이터 삭제</button>
    </section>
    <p class="muted center">살림재고 v0.3</p>`;
}

/* ---------------- 시트(바텀시트) ---------------- */

const sheet = $('#sheet');

// 안드로이드 뒤로가기로 시트를 닫기 위해 히스토리 항목을 하나 쌓아 둔다.
// history.back()은 비동기라, 그 사이에 새 시트가 열리면 popstate가 새 시트를 닫지 않도록 조정한다.
let backPending = false;   // 우리가 부른 history.back()이 아직 처리 중
let pushAfterBack = false; // 그 사이에 열린 시트용 pushState를 미뤄 둠

function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  if (!sheet.open) {
    sheet.showModal();
    if (backPending) pushAfterBack = true;
    else if (!(history.state && history.state.sheet)) history.pushState({ sheet: true }, '');
  }
  sheet.scrollTop = 0;
}
function leaveSheetHistory() {
  pushAfterBack = false;
  if (!backPending && history.state && history.state.sheet) {
    backPending = true;
    history.back();
  }
}
function closeSheet() {
  if (!sheet.open) return;
  sheet.close();
  leaveSheetHistory();
}

// ESC 등 브라우저가 직접 닫은 경우. close 이벤트는 비동기라 그 사이 다시 열렸으면 무시
sheet.addEventListener('close', () => { if (!sheet.open) leaveSheetHistory(); });
window.addEventListener('popstate', () => {
  if (backPending) {
    backPending = false;
    if (pushAfterBack && sheet.open) history.pushState({ sheet: true }, '');
    pushAfterBack = false;
    return;
  }
  if (sheet.open) sheet.close();
});
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

function openDetail(id) {
  const item = find(id);
  if (!item) return closeSheet();
  const st = stats(item);
  const s = statusOf(item, st);
  const c = CAT[item.category] || { icon: '', name: '' };
  const u = esc(item.unit);

  const histHtml = st.ps.length
    ? `<ul class="history">${[...st.ps].reverse().map(p => `<li>
        <span>${esc(p.date)}</span>
        <span>${num(p.qty)}${u}</span>
        <span>${p.price ? won(p.price) : '-'}</span>
        <span class="muted">${esc(p.store || '')}</span>
        <button class="icon small" data-action="del-purchase" data-id="${p.id}" aria-label="기록 삭제">✕</button>
      </li>`).join('')}</ul>`
    : '<p class="muted">아직 구매 기록이 없어요. ‘구매 기록’을 남기면 소비 주기와 가격을 계산해 드려요.</p>';

  openSheet(`
    ${sheetHead(esc(item.name), `${c.icon} ${c.name}`)}
    <div class="big-qty ${s}">
      <div><b>${num(item.qty)}</b> ${u} ${tagHtml(s)}</div>
      <div class="muted">최소 ${num(item.minQty)}${u} 유지</div>
    </div>
    ${(() => {
      const w = storeFor(item, st);
      if (w.key === 'none') return `<p class="where muted">❔ 주 구매처 미정 · ‘수정’에서 정할 수 있어요</p>`;
      const meta = w.store && w.store.type === 'online' ? ` · 온라인, 배송 ${w.store.leadDays || 0}일` : w.store ? ' · 매장' : '';
      return `<p class="where">${storeIcon(w.store)} ${w.guessed ? '최근 구매처' : '주 구매처'} <b>${esc(w.name)}</b><span class="muted">${meta}</span></p>`;
    })()}
    <dl class="stats">
      <div><dt>예상 소진</dt><dd>${st.daysLeft != null ? `약 ${st.daysLeft}일 후` : '<span class="muted">기록이 더 필요해요</span>'}</dd></div>
      <div><dt>평균 구매 주기</dt><dd>${st.interval != null ? `${Math.round(st.interval)}일` : '-'}</dd></div>
      <div><dt>최근 단가</dt><dd>${st.lastUnit ? won(st.lastUnit) : '-'}</dd></div>
      <div><dt>최저 단가</dt><dd>${st.best ? `${won(st.best.unit)}${st.best.store ? `<small>${esc(st.best.store)}</small>` : ''}` : '-'}</dd></div>
    </dl>
    ${item.memo ? `<p class="memo">📝 ${esc(item.memo)}</p>` : ''}
    <div class="actions">
      <button class="btn primary" data-action="buy" data-id="${item.id}">구매 기록</button>
      <button class="btn" data-action="toggle-list" data-id="${item.id}">${item.onList ? '장보기에서 빼기' : '장보기에 추가'}</button>
      <button class="btn" data-action="edit" data-id="${item.id}">수정</button>
    </div>
    <h3>구매 이력</h3>
    ${histHtml}
    <button class="btn danger ghost wide" data-action="del-item" data-id="${item.id}">품목 삭제</button>
  `);
}

function presetChips(cat) {
  const existing = new Set(state.items.map(i => i.name));
  return PRESETS[cat]
    .filter(([n]) => !existing.has(n))
    .map(p => `<button type="button" class="chip" data-action="preset" data-name="${esc(p[0])}" data-unit="${esc(p[1])}" data-min="${suggestMin(p)}">${esc(p[0])}</button>`)
    .join('');
}

function openItemForm(id) {
  const item = id ? find(id) : null;
  const cat = item?.category || (ui.cat !== 'all' ? ui.cat : 'bath');
  openSheet(`
    <form id="item-form" data-id="${item?.id || ''}">
      ${sheetHead(item ? '품목 수정' : '새 품목')}
      <fieldset class="seg">
        <legend>분류</legend>
        ${CATEGORIES.map(c => `<label><input type="radio" name="category" value="${c.id}" ${c.id === cat ? 'checked' : ''}><span>${c.icon} ${c.name}</span></label>`).join('')}
      </fieldset>
      ${item ? '' : `<div class="presets chips wrap" id="presets">${presetChips(cat)}</div>`}
      <label>이름<input name="name" required maxlength="40" value="${esc(item?.name || '')}" placeholder="예: 샴푸"></label>
      <div class="grid2">
        <label>현재 수량<input name="qty" type="number" inputmode="decimal" min="0" step="any" required value="${item ? num(item.qty) : 1}"></label>
        <label>단위<input name="unit" list="units" maxlength="6" required value="${esc(item?.unit || '개')}"></label>
      </div>
      <label>최소 보유량
        <small>이 수량보다 적어지면 장보기 목록에 올라가요</small>
        <input name="minQty" type="number" inputmode="decimal" min="0" step="any" required value="${item ? num(item.minQty) : 0}">
      </label>
      <label>주 구매처
        <small>장보기 목록에서 이 구매처로 묶여요. 구매처 추가는 설정에서 할 수 있어요.</small>
        <select name="storeId">
          <option value="">정하지 않음 (최근 구매처 따라감)</option>
          ${state.stores.map(s => `<option value="${s.id}" ${item && item.storeId === s.id ? 'selected' : ''}>${storeIcon(s)} ${esc(s.name)}</option>`).join('')}
        </select>
      </label>
      <label>메모<input name="memo" maxlength="100" value="${esc(item?.memo || '')}" placeholder="예: 브랜드, 용량, 향"></label>
      <datalist id="units">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist>
      <div class="actions end">
        <button type="button" class="btn" data-action="close">취소</button>
        <button class="btn primary">저장</button>
      </div>
    </form>`);
}

function openBuyForm(id) {
  const item = find(id);
  if (!item) return;
  const st = stats(item);
  const u = esc(item.unit);
  const stores = [...new Set([...state.stores.map(s => s.name), ...state.purchases.map(p => p.store)].filter(Boolean))];
  const pref = item.storeId && storeById(item.storeId);
  const defStore = pref ? pref.name : (st.last?.store || '');
  openSheet(`
    <form id="buy-form" data-id="${item.id}">
      ${sheetHead('구매 기록', esc(item.name))}
      <div class="grid2">
        <label>구매일<input type="date" name="date" required value="${todayStr()}" max="${todayStr()}"></label>
        <label>수량 (${u})<input name="qty" type="number" inputmode="decimal" min="0.01" step="any" required value="${st.last ? num(st.last.qty) : 1}"></label>
      </div>
      <div class="grid2">
        <label>총 가격 (원)<input name="price" type="number" inputmode="numeric" min="0" step="1" placeholder="선택"></label>
        <label>구매처<input name="store" list="stores" maxlength="20" value="${esc(defStore)}" placeholder="예: 메가마트"></label>
      </div>
      <datalist id="stores">${stores.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <p class="muted">저장하면 재고가 그만큼 늘어나고, 장보기 목록에서 빠져요.</p>
      <div class="actions end">
        <button type="button" class="btn" data-action="close">취소</button>
        <button class="btn primary">저장</button>
      </div>
    </form>`);
}

function openBulkAdd() {
  const existing = new Set(state.items.map(i => i.name));
  const groups = CATEGORIES
    .map(c => ({ c, opts: PRESETS[c.id].filter(p => !existing.has(p[0])) }))
    .filter(g => g.opts.length);
  if (!groups.length) {
    return openSheet(`${sheetHead('기본 품목 추가')}<p class="muted">기본 품목은 이미 모두 등록했어요.</p>`);
  }
  const first = groups.some(g => g.c.id === ui.cat) ? ui.cat : groups[0].c.id;
  const h = state.household;

  const tabs = groups.map(g =>
    `<button type="button" class="chip ${g.c.id === first ? 'on' : ''}" data-action="bulk-cat" data-id="${g.c.id}">${g.c.icon} ${g.c.name}<span class="cnt" data-cnt="${g.c.id}"></span></button>`
  ).join('');

  const lists = groups.map(g => `
    <ul class="bulk-list" data-cat="${g.c.id}" ${g.c.id === first ? '' : 'hidden'}>
      ${g.opts.map(p => {
        const key = esc(`${g.c.id}|${p[0]}`);
        const min = suggestMin(p);
        return `<li>
          <label class="bulk-check"><input type="checkbox" name="pick" value="${key}" data-min="${min}"><span>${esc(p[0])}</span></label>
          <small class="muted">최소 ${min}</small>
          <input type="number" name="qty:${key}" inputmode="decimal" min="0" step="any" placeholder="현재" aria-label="${esc(p[0])} 현재 수량">
          <span class="u">${esc(p[1])}</span>
        </li>`;
      }).join('')}
    </ul>`).join('');

  openSheet(`
    <form id="bulk-form">
      ${sheetHead('기본 품목 추가')}
      <p class="muted">집에 있는 걸 체크하고 지금 몇 개 있는지 적어 주세요. 최소 보유량은 우리집(사람 ${h.people}, 고양이 ${h.cats})에 맞춘 추천값이에요. 나중에 품목에서 바꿀 수 있어요.</p>
      <div class="chips bulk-tabs">${tabs}</div>
      ${lists}
      <div class="actions end sticky-actions">
        <span class="muted" id="bulk-count">0개 선택</span>
        <button type="button" class="btn" data-action="close">취소</button>
        <button class="btn primary">추가</button>
      </div>
    </form>`);
}

function openStoreForm(id) {
  const s = id ? storeById(id) : null;
  const type = s ? s.type : 'offline';
  openSheet(`
    <form id="store-form" data-id="${s ? s.id : ''}">
      ${sheetHead(s ? '구매처 수정' : '구매처 추가')}
      <label>이름<input name="name" required maxlength="20" value="${esc(s ? s.name : '')}" placeholder="예: 메가마트"></label>
      <fieldset class="seg">
        <legend>종류</legend>
        <label><input type="radio" name="stype" value="offline" ${type === 'offline' ? 'checked' : ''}><span>🛒 매장</span></label>
        <label><input type="radio" name="stype" value="online" ${type === 'online' ? 'checked' : ''}><span>📦 온라인</span></label>
      </fieldset>
      <label id="lead-row" ${type === 'online' ? '' : 'hidden'}>배송 기간 (일)
        <small>남은 양이 이 일수만큼이 되면 미리 장보기에 올라가요</small>
        <input name="leadDays" type="number" inputmode="numeric" min="0" max="60" step="1" value="${s ? s.leadDays || 0 : 3}">
      </label>
      <div class="actions end">
        ${s ? `<button type="button" class="btn danger ghost" data-action="del-store" data-id="${s.id}" style="margin-right:auto">삭제</button>` : ''}
        <button type="button" class="btn" data-action="close">취소</button>
        <button class="btn primary">저장</button>
      </div>
    </form>`);
}

function deleteStore(id) {
  const s = storeById(id);
  if (!s) return;
  const n = state.items.filter(i => i.storeId === id).length;
  if (!confirm(`‘${s.name}’ 구매처를 삭제할까요?${n ? `\n이 구매처로 정해 둔 품목 ${n}개는 ‘미정’이 돼요.` : ''}`)) return;
  state.stores = state.stores.filter(x => x.id !== id);
  state.items.forEach(i => { if (i.storeId === id) i.storeId = ''; });
  save(); closeSheet(); render();
  toast('구매처를 삭제했어요');
}

function updateBulkCounts() {
  const f = $('#bulk-form');
  if (!f) return;
  const counts = {};
  let total = 0;
  f.querySelectorAll('input[name=pick]:checked').forEach(cb => {
    const c = cb.value.split('|')[0];
    counts[c] = (counts[c] || 0) + 1;
    total++;
  });
  f.querySelectorAll('[data-cnt]').forEach(el => { el.textContent = counts[el.dataset.cnt] || ''; });
  $('#bulk-count').textContent = `${total}개 선택`;
}

/* ---------------- 동작 ---------------- */

function adjust(id, delta) {
  const item = find(id);
  if (!item) return;
  if (delta < 0 && item.qty <= 0) return toast(`${item.name} 재고가 이미 0이에요`);
  const prev = item.qty;
  item.qty = Math.max(0, +(item.qty + delta).toFixed(2));
  const log = { id: uid(), itemId: id, at: Date.now(), delta: +(item.qty - prev).toFixed(2) };
  state.logs.push(log);
  save();
  render();
  undo = { itemId: id, prev, logId: log.id };
  toast(`${item.name} ${delta < 0 ? '사용' : '추가'} → ${num(item.qty)}${item.unit}`, true);
}

function doUndo() {
  if (!undo) return;
  const item = find(undo.itemId);
  if (item) item.qty = undo.prev;
  state.logs = state.logs.filter(l => l.id !== undo.logId);
  undo = null;
  save();
  render();
  $('#toast').hidden = true;
}

function toggleList(id) {
  const item = find(id);
  if (!item) return;
  item.onList = !item.onList;
  save();
  render();
  openDetail(id);
  toast(item.onList ? '장보기 목록에 추가했어요' : '장보기 목록에서 뺐어요');
}

function deleteItem(id) {
  const item = find(id);
  if (!item || !confirm(`‘${item.name}’과(와) 구매 기록을 모두 삭제할까요?`)) return;
  state.items = state.items.filter(i => i.id !== id);
  state.purchases = state.purchases.filter(p => p.itemId !== id);
  state.logs = state.logs.filter(l => l.itemId !== id);
  save();
  closeSheet();
  render();
  toast('삭제했어요');
}

function deletePurchase(pid) {
  const p = state.purchases.find(x => x.id === pid);
  if (!p || !confirm('이 구매 기록을 삭제할까요?\n(현재 재고 수량은 바뀌지 않아요)')) return;
  state.purchases = state.purchases.filter(x => x.id !== pid);
  save();
  render();
  openDetail(p.itemId);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `살림재고-백업-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  try { localStorage.setItem(BACKUP_KEY, todayStr()); } catch (e) { /* 무시 */ }
  render();
}

async function importData(file) {
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!confirm(`백업에서 품목 ${data.items.length}개, 구매 기록 ${data.purchases.length}건을 불러올까요?\n지금 데이터는 덮어써져요.`)) return;
    state = data;
    save();
    render();
    toast('백업을 불러왔어요');
  } catch (e) {
    alert('불러오기 실패: ' + e.message);
  }
}

function resetAll() {
  if (!confirm('모든 품목과 구매 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
  if (!confirm('정말 삭제할까요? 백업을 먼저 받아두는 걸 추천해요.')) return;
  state = emptyState();
  save();
  render();
  toast('모든 데이터를 삭제했어요');
}

function toast(msg, withUndo = false) {
  const el = $('#toast');
  if (!withUndo) undo = null;
  el.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-action="undo">되돌리기</button>' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; undo = null; }, 4000);
}

/* ---------------- 이벤트 ---------------- */

document.addEventListener('click', e => {
  const t = e.target.closest('[data-action],[data-tab]');
  if (!t) return;
  if (t.dataset.tab) {
    ui.tab = t.dataset.tab;
    render();
    window.scrollTo(0, 0);
    return;
  }
  const id = t.dataset.id;
  switch (t.dataset.action) {
    case 'cat': ui.cat = id; render(); break;
    case 'detail': openDetail(id); break;
    case 'dec': adjust(id, -1); break;
    case 'inc': adjust(id, +1); break;
    case 'new-item': openItemForm(null); break;
    case 'edit': openItemForm(id); break;
    case 'buy': openBuyForm(id); break;
    case 'toggle-list': toggleList(id); break;
    case 'del-item': deleteItem(id); break;
    case 'del-purchase': deletePurchase(id); break;
    case 'close': closeSheet(); break;
    case 'bulk': openBulkAdd(); break;
    case 'shop-store': ui.shopStore = id; render(); break;
    case 'new-store': openStoreForm(null); break;
    case 'edit-store': openStoreForm(id); break;
    case 'del-store': deleteStore(id); break;
    case 'bulk-cat': {
      const f = $('#bulk-form');
      f.querySelectorAll('.bulk-tabs .chip').forEach(c => c.classList.toggle('on', c === t));
      f.querySelectorAll('.bulk-list').forEach(l => { l.hidden = l.dataset.cat !== id; });
      t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      break;
    }
    case 'export': exportData(); break;
    case 'import': $('#import-file').click(); break;
    case 'reset': resetAll(); break;
    case 'undo': doUndo(); break;
    case 'preset': {
      const f = $('#item-form');
      f.elements['name'].value = t.dataset.name;
      f.elements['unit'].value = t.dataset.unit;
      f.elements['minQty'].value = t.dataset.min;
      f.elements['qty'].focus();
      f.elements['qty'].select();
      break;
    }
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.input === 'search') {
    ui.q = t.value;
    $('#stock-list').innerHTML = stockListHtml();
  }
  // 기본 품목 추가: 수량을 적으면 자동 체크
  if (t.form && t.form.id === 'bulk-form' && t.name.startsWith('qty:')) {
    const cb = t.closest('li').querySelector('input[name=pick]');
    cb.checked = t.value !== '';
    updateBulkCounts();
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  // 기본 품목 추가: 체크하면 현재 수량 칸에 추천값을 채워 둠
  if (t.form && t.form.id === 'bulk-form' && t.name === 'pick') {
    const qty = t.closest('li').querySelector('input[type=number]');
    if (t.checked && qty.value === '') qty.value = t.dataset.min;
    if (!t.checked) qty.value = '';
    updateBulkCounts();
  }
  if (t.name === 'stype') $('#lead-row').hidden = t.value !== 'online';
  if (t.dataset.hh) {
    state.household[t.dataset.hh] = Math.max(0, Math.round(toNum(t.value)));
    t.value = state.household[t.dataset.hh];
    save();
    toast('우리집 정보를 저장했어요');
  }
  if (t.id === 'import-file' && t.files[0]) { importData(t.files[0]); t.value = ''; }
  if (t.name === 'category' && $('#presets')) $('#presets').innerHTML = presetChips(t.value);
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const fd = new FormData(f);

  if (f.id === 'item-form') {
    const name = fd.get('name').trim();
    if (!name) return;
    const data = {
      name,
      category: fd.get('category'),
      unit: fd.get('unit').trim() || '개',
      qty: Math.max(0, toNum(fd.get('qty'))),
      minQty: Math.max(0, toNum(fd.get('minQty'))),
      memo: fd.get('memo').trim(),
      storeId: fd.get('storeId') || '',
    };
    const editing = f.dataset.id ? find(f.dataset.id) : null;
    const dup = state.items.find(i => i.name === name && i !== editing);
    if (dup && !confirm(`‘${name}’ 품목이 이미 있어요. 그래도 저장할까요?`)) return;
    if (editing) {
      Object.assign(editing, data);
      save(); render(); openDetail(editing.id);
    } else {
      state.items.push({ id: uid(), createdAt: Date.now(), onList: false, ...data });
      save(); closeSheet(); render();
      toast(`‘${name}’을(를) 추가했어요`);
    }
  }

  if (f.id === 'store-form') {
    const name = fd.get('name').trim();
    if (!name) return;
    const editing = f.dataset.id ? storeById(f.dataset.id) : null;
    if (state.stores.some(s => s.name === name && s !== editing)) return alert(`‘${name}’ 구매처가 이미 있어요`);
    const type = fd.get('stype') === 'online' ? 'online' : 'offline';
    const data = { name, type, leadDays: type === 'online' ? Math.max(0, Math.round(toNum(fd.get('leadDays')))) : 0 };
    if (editing) Object.assign(editing, data);
    else state.stores.push({ id: 's-' + uid(), ...data });
    save(); closeSheet(); render();
    toast(editing ? '구매처를 수정했어요' : `‘${name}’ 구매처를 추가했어요`);
  }

  if (f.id === 'buy-form') {
    const item = find(f.dataset.id);
    if (!item) return;
    const qty = toNum(fd.get('qty'));
    if (qty <= 0) return;
    const price = toNum(fd.get('price'), 0);
    state.purchases.push({
      id: uid(), itemId: item.id,
      date: fd.get('date') || todayStr(),
      qty, price: price > 0 ? price : 0,
      store: fd.get('store').trim(),
    });
    item.qty = +(item.qty + qty).toFixed(2);
    item.onList = false;
    save(); closeSheet(); render();
    toast(`${item.name} ${num(qty)}${item.unit} 들어왔어요 → ${num(item.qty)}${item.unit}`);
  }

  if (f.id === 'bulk-form') {
    const picks = fd.getAll('pick');
    if (!picks.length) return toast('추가할 품목을 체크해 주세요');
    for (const key of picks) {
      const [category, name] = key.split('|');
      const p = PRESETS[category].find(x => x[0] === name);
      if (!p) continue;
      const minQty = suggestMin(p);
      const qty = Math.max(0, toNum(fd.get('qty:' + key), minQty));
      state.items.push({ id: uid(), createdAt: Date.now(), onList: false, name, category, unit: p[1], qty, minQty, memo: '' });
    }
    save(); closeSheet(); ui.tab = 'stock'; render();
    toast(`${picks.length}개 품목을 추가했어요`);
  }
});

/* ---------------- 시작 ---------------- */

if (history.state && history.state.sheet) history.replaceState(null, ''); // 새로고침 시 남은 시트 항목 정리
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
