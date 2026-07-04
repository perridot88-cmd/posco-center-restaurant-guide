/* ===== 포스코센터 근처 식당 가이드 — Vanilla JS ===== */
(function () {
  'use strict';

  const CONFIRM = '확인 필요';
  const FAV_KEY = 'posco_restaurant_favs';

  // 필터 정의 (라벨 → 매칭 로직). 값은 restaurants.json과 일치해야 함.
  const FILTERS = {
    meal: {
      label: '식사 시간',
      options: [
        { v: 'lunch', t: '점심' },
        { v: 'dinner', t: '저녁' },
        { v: 'both', t: '점심·저녁 모두' },
      ],
      match: (r, sel) => sel.every(v => {
        if (v === 'lunch') return r.mealTime.includes('lunch');
        if (v === 'dinner') return r.mealTime.includes('dinner');
        if (v === 'both') return r.mealTime.includes('lunch') && r.mealTime.includes('dinner');
      }),
    },
    category: {
      label: '음식 종류',
      options: ['한식', '중식', '일식', '양식', '고기/구이', '해산물', '분식/가벼운 식사', '카페/디저트', '기타'].map(v => ({ v, t: v })),
      match: (r, sel) => sel.includes(r.category), // OR
      or: true,
    },
    purpose: {
      label: '이용 목적',
      options: ['팀 점심', '임원 동석', '외부 손님 접대', '회식', '조용한 대화', '빠른 식사', '가성비', '분위기 좋은 곳'].map(v => ({ v, t: v })),
      match: (r, sel) => sel.every(v => {
        if (v === '분위기 좋은 곳') return r.atmosphere.some(a => a.includes('분위기 좋음'));
        return r.recommendedFor.includes(v);
      }),
    },
    distance: {
      label: '거리',
      options: [
        { v: '5', t: '도보 5분 이내' },
        { v: '10', t: '도보 10분 이내' },
        { v: '15', t: '도보 15분 이내' },
        { v: 'car', t: '차량 이동 필요' },
      ],
      match: (r, sel) => sel.some(v => { // OR (여러 거리 선택 시 합집합)
        if (v === 'car') return r.distanceMinutes > 15;
        return r.distanceMinutes <= Number(v);
      }),
      or: true,
    },
    room: {
      label: '룸 유무',
      options: [{ v: '있음', t: '룸 있음' }, { v: '없음', t: '룸 없음' }, { v: CONFIRM, t: '확인 필요' }],
      match: (r, sel) => sel.includes(r.room.status),
      or: true,
    },
    reservation: {
      label: '예약 가능 여부',
      options: [
        { v: '예약 가능', t: '예약 가능' }, { v: '예약 권장', t: '예약 권장' },
        { v: '예약 불가', t: '예약 불가' }, { v: CONFIRM, t: '확인 필요' },
      ],
      match: (r, sel) => sel.includes(r.reservation.status),
      or: true,
    },
    price: {
      label: '가격대',
      options: ['1만원대', '2만원대', '3만원대', '5만원 이상', CONFIRM].map(v => ({ v, t: v })),
      match: (r, sel) => sel.some(v => r.lunchPriceRange === v || r.dinnerPriceRange === v),
      or: true,
    },
  };

  // 상황별 추천 버튼 → 필터 프리셋
  const SITUATIONS = [
    { t: '🍚 오늘 팀 점심', set: { meal: ['lunch'], purpose: ['팀 점심'] } },
    { t: '🤝 외부 손님과 식사', set: { purpose: ['외부 손님 접대'] } },
    { t: '👔 임원 동석', set: { purpose: ['임원 동석'] } },
    { t: '🤫 조용히 이야기할 곳', set: { purpose: ['조용한 대화'] } },
    { t: '🍶 예약 가능한 회식', set: { purpose: ['회식'], reservation: ['예약 가능', '예약 권장'] } },
    { t: '⚡ 가볍게 빠른 식사', set: { purpose: ['빠른 식사'] } },
    { t: '🚪 룸 있는 곳만', set: { room: ['있음'] } },
    { t: '📍 도보 5분 이내', set: { distance: ['5'] } },
  ];

  // 상태
  let DATA = [];
  const state = { filters: {}, search: '', sort: 'recommend', view: 'card', favOnly: false, expanded: new Set() };
  Object.keys(FILTERS).forEach(k => (state.filters[k] = []));
  let favs = loadFavs();

  // DOM
  const $ = id => document.getElementById(id);
  const els = {
    summary: $('summary'), situations: $('situations'), filters: $('filters'),
    cards: $('cards'), tableView: $('tableView'), tableBody: $('tableBody'),
    resultCount: $('resultCount'), empty: $('emptyState'), error: $('errorState'),
    search: $('search'), sort: $('sort'), toast: $('toast'), randomPick: $('randomPick'),
  };

  /* ---------- 데이터 로드 ---------- */
  fetch('restaurants.json')
    .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(data => { DATA = data; init(); })
    .catch(err => {
      console.error('데이터 로드 실패:', err);
      els.error.classList.remove('hidden');
      els.cards.classList.add('hidden');
    });

  function init() {
    buildSituations();
    buildFilters();
    buildSummary();
    bindControls();
    render();
  }

  /* ---------- 요약 카드 ---------- */
  function buildSummary() {
    const total = DATA.length;
    const room = DATA.filter(r => r.room.status === '있음').length;
    const resv = DATA.filter(r => ['예약 가능', '예약 권장'].includes(r.reservation.status)).length;
    const lunch = DATA.filter(r => r.mealTime.includes('lunch') && r.recommendedFor.some(x => ['팀 점심', '빠른 식사', '가성비'].includes(x))).length;
    const dinner = DATA.filter(r => r.mealTime.includes('dinner') && r.recommendedFor.some(x => ['회식', '임원 동석', '외부 손님 접대'].includes(x))).length;
    const cards = [
      { num: total, lbl: '전체 식당' },
      { num: room, lbl: '룸 보유(확인됨)' },
      { num: resv, lbl: '예약 가능·권장' },
      { num: lunch, lbl: '점심 추천' },
      { num: dinner, lbl: '저녁·회식 추천' },
    ];
    els.summary.innerHTML = cards.map(c =>
      `<div class="stat"><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('');
  }

  /* ---------- 상황별 버튼 ---------- */
  function buildSituations() {
    els.situations.innerHTML = '';
    SITUATIONS.forEach(s => {
      const b = document.createElement('button');
      b.className = 'sit-btn'; b.textContent = s.t; b.type = 'button';
      b.addEventListener('click', () => applySituation(s.set));
      els.situations.appendChild(b);
    });
  }
  function applySituation(set) {
    Object.keys(state.filters).forEach(k => (state.filters[k] = []));
    state.search = ''; els.search.value = '';
    state.favOnly = false; $('favOnly').setAttribute('aria-pressed', 'false');
    Object.entries(set).forEach(([k, vals]) => (state.filters[k] = vals.slice()));
    syncChips();
    render();
    toast('상황별 추천을 적용했습니다.');
    document.querySelector('.result-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 필터 칩 ---------- */
  function buildFilters() {
    els.filters.innerHTML = '';
    Object.entries(FILTERS).forEach(([key, cfg]) => {
      const g = document.createElement('div');
      g.className = 'filter-group';
      g.innerHTML = `<div class="fg-label">${cfg.label}</div>`;
      const chips = document.createElement('div');
      chips.className = 'chips';
      cfg.options.forEach(opt => {
        const c = document.createElement('button');
        c.className = 'chip'; c.type = 'button';
        c.textContent = opt.t; c.dataset.key = key; c.dataset.val = opt.v;
        c.setAttribute('aria-pressed', 'false');
        c.addEventListener('click', () => toggleChip(key, opt.v, c));
        chips.appendChild(c);
      });
      g.appendChild(chips);
      els.filters.appendChild(g);
    });
  }
  function toggleChip(key, val, el) {
    const arr = state.filters[key];
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    el.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
    render();
  }
  function syncChips() {
    document.querySelectorAll('.chip').forEach(c => {
      const on = state.filters[c.dataset.key].includes(c.dataset.val);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ---------- 컨트롤 바인딩 ---------- */
  function bindControls() {
    els.search.addEventListener('input', e => { state.search = e.target.value.trim(); render(); });
    els.sort.addEventListener('change', e => { state.sort = e.target.value; render(); });
    $('view-card').addEventListener('click', () => setView('card'));
    $('view-table').addEventListener('click', () => setView('table'));
    $('resetBtn').addEventListener('click', resetAll);
    $('resetBtn2').addEventListener('click', resetAll);
    $('favOnly').addEventListener('click', e => {
      state.favOnly = !state.favOnly;
      e.currentTarget.setAttribute('aria-pressed', String(state.favOnly));
      render();
    });
    $('exportCsv').addEventListener('click', exportCsv);
    $('printBtn').addEventListener('click', () => window.print());
    $('randomLunch').addEventListener('click', () => randomPick('lunch'));
    $('randomDinner').addEventListener('click', () => randomPick('dinner'));

    // 표 헤더 정렬
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => { state.sort = th.dataset.sort; els.sort.value = th.dataset.sort; render(); });
    });
  }
  function setView(v) {
    state.view = v;
    $('view-card').setAttribute('aria-pressed', String(v === 'card'));
    $('view-table').setAttribute('aria-pressed', String(v === 'table'));
    render();
  }
  function resetAll() {
    Object.keys(state.filters).forEach(k => (state.filters[k] = []));
    state.search = ''; els.search.value = '';
    state.sort = 'recommend'; els.sort.value = 'recommend';
    state.favOnly = false; $('favOnly').setAttribute('aria-pressed', 'false');
    els.randomPick.classList.add('hidden');
    syncChips(); render();
    toast('필터를 초기화했습니다.');
  }

  /* ---------- 필터/정렬 적용 ---------- */
  function priceRank(r) {
    const map = { '1만원대': 1, '2만원대': 2, '3만원대': 3, '5만원 이상': 5 };
    const l = map[r.lunchPriceRange], d = map[r.dinnerPriceRange];
    const vals = [l, d].filter(Boolean);
    return vals.length ? Math.min(...vals) : 99; // 확인 필요는 뒤로
  }
  function getFiltered() {
    let out = DATA.filter(r => {
      for (const [key, cfg] of Object.entries(FILTERS)) {
        const sel = state.filters[key];
        if (sel.length && !cfg.match(r, sel)) return false;
      }
      if (state.favOnly && !favs.includes(r.id)) return false;
      if (state.search) {
        const q = state.search.toLowerCase();
        const hay = [r.name, r.category, r.subType, r.comment, r.cautions,
          ...r.representativeMenus, ...r.recommendedFor, ...r.atmosphere, ...r.tags]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const s = state.sort;
    out.sort((a, b) => {
      if (s === 'distance') return a.distanceMinutes - b.distanceMinutes || a.priority - b.priority;
      if (s === 'price') return priceRank(a) - priceRank(b) || a.priority - b.priority;
      if (s === 'room') return roomRank(a) - roomRank(b) || a.priority - b.priority;
      if (s === 'reservation') return resvRank(a) - resvRank(b) || a.priority - b.priority;
      if (s === 'verified') return b.lastVerified.localeCompare(a.lastVerified) || a.priority - b.priority;
      if (s === 'name') return a.name.localeCompare(b.name, 'ko');
      if (s === 'category') return a.category.localeCompare(b.category, 'ko') || a.priority - b.priority;
      // recommend
      return a.priority - b.priority || a.distanceMinutes - b.distanceMinutes;
    });
    return out;
  }
  const roomRank = r => (r.room.status === '있음' ? 0 : r.room.status === CONFIRM ? 1 : 2);
  const resvRank = r => ({ '예약 가능': 0, '예약 권장': 1, [CONFIRM]: 2, '예약 불가': 3 }[r.reservation.status] ?? 2);

  /* ---------- 렌더 ---------- */
  function render() {
    const list = getFiltered();
    els.resultCount.textContent = list.length;

    const showEmpty = list.length === 0;
    els.empty.classList.toggle('hidden', !showEmpty);
    els.cards.classList.toggle('hidden', showEmpty || state.view !== 'card');
    els.tableView.classList.toggle('hidden', showEmpty || state.view !== 'table');

    if (state.view === 'card') renderCards(list); else renderTable(list);
  }

  function mealLabel(r) {
    const l = r.mealTime.includes('lunch'), d = r.mealTime.includes('dinner');
    return l && d ? '점심·저녁' : l ? '점심' : d ? '저녁' : '-';
  }
  function badge(status) {
    if (status === '있음' || status === '예약 가능' || status === '가능') return `<span class="badge b-ok">${status}</span>`;
    if (status === CONFIRM || status === '예약 권장') return `<span class="badge b-warn">${status}</span>`;
    return `<span class="badge b-muted">${status}</span>`;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderCards(list) {
    els.cards.innerHTML = list.map(r => {
      const fav = favs.includes(r.id);
      const tags = r.tags.map(t => {
        let cls = 'tag';
        if (/룸/.test(t)) cls += ' room';
        if (/차량|확인/.test(t)) cls += ' warn';
        return `<span class="${cls}">${esc(t)}</span>`;
      }).join('');
      const open = state.expanded.has(r.id);
      return `
      <article class="rcard" data-id="${r.id}">
        <div class="rcard-head">
          <div class="rcard-titlerow">
            <div>
              <h3>${esc(r.name)}</h3>
              <div class="cat">${esc(r.category)}${r.subType ? ' · ' + esc(r.subType) : ''}</div>
            </div>
            <button class="fav-btn" aria-pressed="${fav}" aria-label="${esc(r.name)} 즐겨찾기" data-fav="${r.id}">${fav ? '★' : '☆'}</button>
          </div>
          <p class="menus"><b>대표</b> ${esc(r.representativeMenus.join(', '))}</p>
        </div>
        <div class="keyfacts">
          <span class="kf">🕒 <b>${mealLabel(r)}</b></span>
          <span class="kf">🚶 <b>${esc(r.distanceLabel)}</b></span>
          <span class="kf">💳 ${esc(r.lunchPriceRange !== CONFIRM ? r.lunchPriceRange : r.dinnerPriceRange)}</span>
          <span class="kf">🚪 룸 ${badge(r.room.status)}</span>
          <span class="kf">📅 ${badge(r.reservation.status)}</span>
        </div>
        <div class="tags">${tags}</div>
        <p class="comment">${esc(r.comment)}</p>
        <div class="detail ${open ? 'open' : ''}" id="detail-${r.id}">${detailHtml(r)}</div>
        <div class="rcard-foot">
          <button data-toggle="${r.id}" aria-expanded="${open}" aria-controls="detail-${r.id}">${open ? '▲ 접기' : '▼ 상세'}</button>
          <button data-copy="${r.id}">📋 복사</button>
          <a class="maplink" href="${r.mapLinks.naver}" target="_blank" rel="noopener">네이버</a>
          <a class="maplink" href="${r.mapLinks.kakao}" target="_blank" rel="noopener">카카오</a>
          <a class="maplink" href="${r.mapLinks.google}" target="_blank" rel="noopener">구글</a>
        </div>
      </article>`;
    }).join('');

    // 이벤트 위임
    els.cards.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => toggleFav(b.dataset.fav)));
    els.cards.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => toggleDetail(b.dataset.toggle)));
    els.cards.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyInfo(b.dataset.copy)));
  }

  function detailHtml(r) {
    const row = (dt, dd) => `<dt>${dt}</dt><dd>${esc(dd) || '-'}</dd>`;
    const src = r.sourceLinks.length
      ? `<div class="srclinks">${r.sourceLinks.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">참고 링크</a>`).join('')}</div>` : '';
    return `<dl>
      ${row('주소', r.address)}
      ${row('전화', r.phone)}
      ${row('영업시간', r.businessHours)}
      ${row('브레이크', r.breakTime)}
      ${row('휴무일', r.closedDays)}
      ${row('점심 메뉴', r.lunchMenu)}
      ${row('저녁 메뉴', r.dinnerMenu)}
      ${row('룸', `${r.room.status} / 수용 ${r.room.capacity}${r.room.note ? ' · ' + r.room.note : ''}`)}
      ${row('예약', `${r.reservation.status} / ${r.reservation.method}${r.reservation.note ? ' · ' + r.reservation.note : ''}`)}
      ${row('주차', `${r.parking.status}${r.parking.note ? ' · ' + r.parking.note : ''}`)}
      ${row('분위기', r.atmosphere.join(', '))}
      ${row('추천 대상', r.recommendedFor.join(', '))}
      ${row('주의사항', r.cautions)}
    </dl>
    ${src}
    <div class="verified">마지막 확인일: ${esc(r.lastVerified)}</div>`;
  }

  function toggleDetail(id) {
    if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
    const d = $('detail-' + id);
    const btn = els.cards.querySelector(`[data-toggle="${id}"]`);
    const open = state.expanded.has(id);
    if (d) d.classList.toggle('open', open);
    if (btn) { btn.textContent = open ? '▲ 접기' : '▼ 상세'; btn.setAttribute('aria-expanded', String(open)); }
  }

  /* ---------- 표 ---------- */
  function renderTable(list) {
    els.tableBody.innerHTML = list.map(r => `
      <tr>
        <td class="name">${esc(r.name)}</td>
        <td>${esc(r.category)}</td>
        <td>${mealLabel(r)}</td>
        <td>${esc(r.representativeMenus.join(', '))}</td>
        <td>${esc(r.distanceLabel)}</td>
        <td>${esc(r.lunchPriceRange !== CONFIRM ? r.lunchPriceRange : r.dinnerPriceRange)}</td>
        <td>${r.room.status}</td>
        <td>${r.reservation.status}</td>
        <td><span class="mini-tag">${esc(r.recommendedFor.join(', '))}</span></td>
        <td>${esc(r.lastVerified)}</td>
      </tr>`).join('');
  }

  /* ---------- 즐겨찾기 ---------- */
  function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }
  function saveFavs() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {} }
  function toggleFav(id) {
    const i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    saveFavs();
    const r = DATA.find(x => x.id === id);
    toast(i >= 0 ? '즐겨찾기 해제' : `즐겨찾기 추가: ${r ? r.name : ''}`);
    render();
  }

  /* ---------- 복사 ---------- */
  function copyInfo(id) {
    const r = DATA.find(x => x.id === id); if (!r) return;
    const text = [
      `[${r.name}] ${r.category}${r.subType ? '·' + r.subType : ''}`,
      `주소: ${r.address}`,
      `전화: ${r.phone}`,
      `대표메뉴: ${r.representativeMenus.join(', ')}`,
      `도보: ${r.distanceLabel} / 룸: ${r.room.status} / 예약: ${r.reservation.status} (${r.reservation.method})`,
      `예약메모: ${r.reservation.note || '-'}`,
      `주의: ${r.cautions}`,
    ].join('\n');
    const done = () => toast('식당 정보를 복사했습니다.');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); cb(); } catch (e) { toast('복사 실패'); }
    document.body.removeChild(ta);
  }

  /* ---------- 랜덤 뽑기 ---------- */
  function randomPick(meal) {
    const pool = DATA.filter(r => {
      if (meal === 'lunch') return r.mealTime.includes('lunch') && r.recommendedFor.some(x => ['팀 점심', '빠른 식사', '가성비'].includes(x));
      return r.mealTime.includes('dinner') && r.recommendedFor.some(x => ['회식', '임원 동석', '외부 손님 접대'].includes(x));
    });
    if (!pool.length) return;
    const r = pool[Math.floor(Math.random() * pool.length)];
    els.randomPick.className = 'stat';
    els.randomPick.style.margin = '0 0 12px';
    els.randomPick.innerHTML =
      `<div class="lbl">${meal === 'lunch' ? '🎲 오늘 점심 추천' : '🎲 저녁·회식 추천'}</div>
       <div class="num" style="font-size:20px">${esc(r.name)}</div>
       <div class="lbl">${esc(r.category)} · ${esc(r.distanceLabel)} · ${esc(r.representativeMenus.join(', '))}</div>`;
    els.randomPick.classList.remove('hidden');
    els.randomPick.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- CSV ---------- */
  function exportCsv() {
    const list = getFiltered();
    const cols = ['식당명', '분류', '대표메뉴', '점심/저녁', '도보', '가격대(점심)', '가격대(저녁)', '룸', '예약', '추천상황', '주소', '전화', '확인일'];
    const rows = list.map(r => [
      r.name, r.category, r.representativeMenus.join(' '), mealLabel(r), r.distanceLabel,
      r.lunchPriceRange, r.dinnerPriceRange, r.room.status, r.reservation.status,
      r.recommendedFor.join(' '), r.address, r.phone, r.lastVerified,
    ]);
    const csv = [cols, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `포스코센터_식당_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`${list.length}곳을 CSV로 내보냈습니다.`);
  }

  /* ---------- 토스트 ---------- */
  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2000);
  }
})();
