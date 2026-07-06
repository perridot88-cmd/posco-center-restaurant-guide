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
      options: [
        { v: '작성자 최애', t: '❤️ 작성자 최애' },
        ...['팀 점심', '임원 동석', '외부 손님 접대', '회식', '조용한 대화', '빠른 식사', '가성비', '분위기 좋은 곳'].map(v => ({ v, t: v })),
      ],
      match: (r, sel) => sel.every(v => {
        if (v === '작성자 최애') return !!r.authorPick;
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
    grill: {
      label: '구이 서비스 (고기집)',
      options: [{ v: '구워줌', t: '🔥 구워줌' }, { v: '셀프', t: '셀프' }, { v: CONFIRM, t: '확인 필요' }],
      match: (r, sel) => !!r.grillService && sel.includes(r.grillService.status),
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
    { t: '❤️ 작성자 최애', set: { purpose: ['작성자 최애'] } },
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
  const state = { filters: {}, search: '', sort: 'recommend', view: 'card', favOnly: false, kpi: null, expanded: new Set() };
  Object.keys(FILTERS).forEach(k => (state.filters[k] = []));
  let favs = loadFavs();

  // DOM
  const $ = id => document.getElementById(id);
  const els = {
    summary: $('summary'), situations: $('situations'), filters: $('filters'),
    cards: $('cards'), tableView: $('tableView'), tableBody: $('tableBody'),
    resultCount: $('resultCount'), empty: $('emptyState'), error: $('errorState'),
    search: $('search'), sort: $('sort'), toast: $('toast'), randomPick: $('randomPick'),
    ladderView: $('ladderView'), ladderStage: $('ladderStage'), ladderResults: $('ladderResults'),
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

  /* ---------- 요약 카드 (클릭 시 해당 카테고리 필터) ---------- */
  const KPI = {
    total:  { lbl: '전체 식당', ico: '🍽️', pred: () => true },
    picks:  { lbl: '작성자 최애', ico: '❤️', pred: r => !!r.authorPick },
    room:   { lbl: '룸 보유(확인됨)', ico: '🚪', pred: r => r.room.status === '있음' },
    resv:   { lbl: '예약 가능·권장', ico: '📅', pred: r => ['예약 가능', '예약 권장'].includes(r.reservation.status) },
    lunch:  { lbl: '점심 추천', ico: '☀️', pred: r => r.mealTime.includes('lunch') && r.recommendedFor.some(x => ['팀 점심', '빠른 식사', '가성비'].includes(x)) },
    dinner: { lbl: '저녁·회식 추천', ico: '🌙', pred: r => r.mealTime.includes('dinner') && r.recommendedFor.some(x => ['회식', '임원 동석', '외부 손님 접대'].includes(x)) },
  };
  function buildSummary() {
    els.summary.innerHTML = Object.entries(KPI).map(([key, k]) =>
      `<button class="stat" data-kpi="${key}" aria-pressed="false" title="클릭하면 ${k.lbl} 기준으로 목록이 필터링됩니다">
        <div class="ico" aria-hidden="true">${k.ico}</div>
        <div class="num">${DATA.filter(k.pred).length}</div>
        <div class="lbl">${k.lbl}</div>
      </button>`).join('');
    els.summary.querySelectorAll('[data-kpi]').forEach(b => b.addEventListener('click', () => applyKpi(b.dataset.kpi)));
  }
  function applyKpi(key) {
    // 다른 필터 초기화 후 KPI 기준만 적용 (재클릭·전체 클릭 시 해제)
    const turnOff = state.kpi === key || key === 'total';
    Object.keys(state.filters).forEach(k => (state.filters[k] = []));
    state.search = ''; els.search.value = '';
    state.favOnly = false; $('favOnly').setAttribute('aria-pressed', 'false');
    state.kpi = turnOff ? null : key;
    syncChips(); syncKpi(); render();
    toast(state.kpi ? `'${KPI[key].lbl}' 기준으로 정렬·필터링했습니다.` : '전체 목록을 표시합니다.');
    document.querySelector('.result-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function syncKpi() {
    els.summary.querySelectorAll('[data-kpi]').forEach(b => {
      const on = state.kpi === b.dataset.kpi;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
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
    state.kpi = null; syncKpi();
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
    $('view-ladder').addEventListener('click', () => setView('ladder'));
    bindLadder();

    // 맨 위로 버튼
    const topBtn = document.createElement('button');
    topBtn.className = 'back-top'; topBtn.setAttribute('aria-label', '맨 위로'); topBtn.textContent = '↑';
    document.body.appendChild(topBtn);
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => topBtn.classList.toggle('show', window.scrollY > 400), { passive: true });

    // 표 헤더 정렬
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => { state.sort = th.dataset.sort; els.sort.value = th.dataset.sort; render(); });
    });
  }
  function setView(v) {
    state.view = v;
    $('view-card').setAttribute('aria-pressed', String(v === 'card'));
    $('view-table').setAttribute('aria-pressed', String(v === 'table'));
    $('view-ladder').setAttribute('aria-pressed', String(v === 'ladder'));
    render();
  }
  function resetAll() {
    Object.keys(state.filters).forEach(k => (state.filters[k] = []));
    state.search = ''; els.search.value = '';
    state.sort = 'recommend'; els.sort.value = 'recommend';
    state.favOnly = false; $('favOnly').setAttribute('aria-pressed', 'false');
    state.kpi = null; syncKpi();
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
      if (state.kpi && !KPI[state.kpi].pred(r)) return false;
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
      // recommend — 작성자 최애 우선
      return (b.authorPick ? 1 : 0) - (a.authorPick ? 1 : 0) || a.priority - b.priority || a.distanceMinutes - b.distanceMinutes;
    });
    return out;
  }
  const roomRank = r => (r.room.status === '있음' ? 0 : r.room.status === CONFIRM ? 1 : 2);
  const resvRank = r => ({ '예약 가능': 0, '예약 권장': 1, [CONFIRM]: 2, '예약 불가': 3 }[r.reservation.status] ?? 2);

  /* ---------- 렌더 ---------- */
  function render() {
    const list = getFiltered();
    els.resultCount.textContent = list.length;

    const isLadder = state.view === 'ladder';
    const showEmpty = list.length === 0 && !isLadder;
    els.empty.classList.toggle('hidden', !showEmpty);
    els.cards.classList.toggle('hidden', showEmpty || state.view !== 'card');
    els.tableView.classList.toggle('hidden', showEmpty || state.view !== 'table');
    els.ladderView.classList.toggle('hidden', !isLadder);

    const animate = state.view !== state._lastView;
    state._lastView = state.view;
    if (state.view === 'card') renderCards(list, animate);
    else if (state.view === 'table') renderTable(list);
  }

  function mealLabel(r) {
    const l = r.mealTime.includes('lunch'), d = r.mealTime.includes('dinner');
    return l && d ? '점심·저녁' : l ? '점심' : d ? '저녁' : '-';
  }
  function badge(status) {
    if (status === '있음' || status === '예약 가능' || status === '가능' || status === '구워줌') return `<span class="badge b-ok">${status}</span>`;
    if (status === CONFIRM || status === '예약 권장') return `<span class="badge b-warn">${status}</span>`;
    return `<span class="badge b-muted">${status}</span>`;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 카테고리별 색상·아이콘 (컬러 코딩)
  const CAT_META = {
    '한식': ['#c2410c', '🍚'], '중식': ['#b91c1c', '🥟'], '일식': ['#1d4ed8', '🍣'],
    '양식': ['#7c3aed', '🍝'], '고기/구이': ['#9f1239', '🥩'], '해산물': ['#0e7490', '🦐'],
    '분식/가벼운 식사': ['#a16207', '🍜'], '카페/디저트': ['#be185d', '☕'], '기타': ['#475569', '🍽️'],
  };
  const catMeta = c => CAT_META[c] || CAT_META['기타'];

  function renderCards(list, animate) {
    els.cards.classList.toggle('anim', !!animate);
    els.cards.innerHTML = list.map((r, i) => {
      const fav = favs.includes(r.id);
      const [catCol, catIco] = catMeta(r.category);
      const tags = r.tags.map(t => {
        let cls = 'tag';
        if (/룸/.test(t)) cls += ' room';
        if (/차량|확인/.test(t)) cls += ' warn';
        if (/최애|숨은 맛집/.test(t)) cls += ' pick';
        return `<span class="${cls}">${esc(t)}</span>`;
      }).join('');
      const open = state.expanded.has(r.id);
      const pickBadge = r.authorPick
        ? `<div class="pick-ribbon" title="${esc(r.authorPick.note)}">❤️ ${esc(r.authorPick.note)}</div>` : '';
      const price = r.lunchPriceRange !== CONFIRM ? r.lunchPriceRange : r.dinnerPriceRange;
      return `
      <article class="rcard ${r.authorPick ? 'is-pick' : ''}" data-id="${r.id}" data-cat="${esc(r.category)}" style="--i:${i};--cat:${catCol}">
        ${pickBadge}
        <div class="rcard-head">
          <div class="rcard-titlerow">
            <div class="rtitle">
              <span class="cat-badge">${catIco}<span>${esc(r.category)}</span></span>
              <h3>${esc(r.name)}</h3>
              ${r.subType ? `<div class="cat">${esc(r.subType)}</div>` : ''}
            </div>
            <button class="fav-btn" aria-pressed="${fav}" aria-label="${esc(r.name)} 즐겨찾기" data-fav="${r.id}">${fav ? '★' : '☆'}</button>
          </div>
          <p class="menus"><b>대표</b> ${esc(r.representativeMenus.join(', '))}</p>
        </div>
        <div class="keyfacts">
          <span class="kf kf-strong">🚶 <b>${esc(r.distanceLabel)}</b></span>
          <span class="kf kf-strong">💳 <b>${esc(price)}</b></span>
          <span class="kf">🕒 ${mealLabel(r)}</span>
        </div>
        <div class="facts2">
          <span class="kf">🚪 룸 ${badge(r.room.status)}</span>
          <span class="kf">📅 예약 ${badge(r.reservation.status)}</span>
          ${r.grillService ? `<span class="kf">🔥 구이 ${badge(r.grillService.status)}</span>` : ''}
        </div>
        <div class="tags">${tags}</div>
        <p class="comment">${esc(r.comment)}</p>
        <div class="detail ${open ? 'open' : ''}" id="detail-${r.id}">${detailHtml(r)}</div>
        <div class="rcard-foot">
          <button data-toggle="${r.id}" aria-expanded="${open}" aria-controls="detail-${r.id}">${open ? '▲ 접기' : '▼ 상세'}</button>
          <button data-copy="${r.id}">📋 복사</button>
          <a class="maplink naver" href="${r.mapLinks.naver}" target="_blank" rel="noopener" aria-label="${esc(r.name)} 네이버지도">네이버</a>
          <a class="maplink kakao" href="${r.mapLinks.kakao}" target="_blank" rel="noopener" aria-label="${esc(r.name)} 카카오맵">카카오</a>
          <a class="maplink google" href="${r.mapLinks.google}" target="_blank" rel="noopener" aria-label="${esc(r.name)} 구글맵">구글</a>
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
      ${r.grillService ? row('구이 서비스', `${r.grillService.status}${r.grillService.note ? ' · ' + r.grillService.note : ''}`) : ''}
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
      <tr class="${r.authorPick ? 'is-pick' : ''}">
        <td class="name">${r.authorPick ? '❤️ ' : ''}${esc(r.name)}</td>
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

  /* ---------- 사다리타기 게임 ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const LAD = {
    meal: 'lunch', n: 4,
    palette: ['#1560b0', '#1a7f47', '#b42318', '#9a6b00', '#6b3fa0', '#0f766e', '#be185d', '#3f6212'],
    data: null,
  };
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function bindLadder() {
    $('lad-lunch').addEventListener('click', () => setLadMeal('lunch'));
    $('lad-dinner').addEventListener('click', () => setLadMeal('dinner'));
    $('lad-minus').addEventListener('click', () => { LAD.n = Math.max(2, LAD.n - 1); $('lad-count').textContent = LAD.n; });
    $('lad-plus').addEventListener('click', () => { LAD.n = Math.min(8, LAD.n + 1); $('lad-count').textContent = LAD.n; });
    $('lad-start').addEventListener('click', buildLadder);
    $('lad-reveal').addEventListener('click', revealAll);
    $('lad-names').addEventListener('keydown', e => { if (e.key === 'Enter') buildLadder(); });
  }
  function setLadMeal(m) {
    LAD.meal = m;
    $('lad-lunch').setAttribute('aria-pressed', String(m === 'lunch'));
    $('lad-dinner').setAttribute('aria-pressed', String(m === 'dinner'));
  }

  function buildLadder() {
    const N = LAD.n;
    const pool = getFiltered().filter(r => r.mealTime.includes(LAD.meal));
    els.ladderResults.innerHTML = '';
    if (pool.length < N) {
      els.ladderStage.innerHTML = `<div class="lad-msg">현재 필터에서 <b>${LAD.meal === 'lunch' ? '점심' : '저녁'}</b> 가능 식당이 ${pool.length}곳뿐이라 ${N}명 사다리를 만들 수 없어요.<br>인원을 줄이거나 필터·검색을 완화해 주세요.</div>`;
      return;
    }
    const results = shuffle(pool.slice()).slice(0, N);
    const names = ($('lad-names').value || '').split(',').map(s => s.trim()).filter(Boolean);
    const participants = Array.from({ length: N }, (_, i) => names[i] || ('참가자 ' + (i + 1)));
    const rows = Math.max(9, N + 5);
    const rungs = genRungs(N, rows);
    const geo = { pad: 46, colGap: Math.max(78, Math.min(120, 640 / (N - 1 || 1))), topY: 30, ladTop: 84, ladBot: 384, H: 430, rows };
    geo.width = geo.pad * 2 + (N - 1) * geo.colGap;
    LAD.data = { N, rows, rungs, participants, results, geo, traced: {} };
    drawLadder();
  }
  function genRungs(N, rows) {
    const rungs = [];
    for (let r = 1; r < rows; r++) {
      let last = -2;
      for (let c = 0; c < N - 1; c++) {
        if (c === last + 1) continue;         // 인접 가로줄 금지
        if (Math.random() < 0.42) { rungs.push({ row: r, col: c }); last = c; }
      }
    }
    return rungs;
  }
  const cx = c => LAD.data.geo.pad + c * LAD.data.geo.colGap;
  const ry = r => { const g = LAD.data.geo; return g.ladTop + (g.ladBot - g.ladTop) * (r / g.rows); };
  function traceLadder(start) {
    const { rows, rungs, geo } = LAD.data;
    let pos = start; const pts = [[cx(pos), geo.ladTop]];
    for (let r = 1; r < rows; r++) {
      const y = ry(r);
      if (rungs.some(g => g.row === r && g.col === pos - 1)) { pts.push([cx(pos), y]); pos--; pts.push([cx(pos), y]); }
      else if (rungs.some(g => g.row === r && g.col === pos)) { pts.push([cx(pos), y]); pos++; pts.push([cx(pos), y]); }
    }
    pts.push([cx(pos), geo.ladBot]);
    return { end: pos, pts };
  }
  function drawLadder() {
    const { N, rungs, participants, geo } = LAD.data;
    let s = `<svg id="ladderSvg" viewBox="0 0 ${geo.width} ${geo.H}" role="img" aria-label="사다리타기 판">`;
    for (let c = 0; c < N; c++) s += `<line class="lad-vline" x1="${cx(c)}" y1="${geo.ladTop}" x2="${cx(c)}" y2="${geo.ladBot}"/>`;
    rungs.forEach(g => { s += `<line class="lad-rung" x1="${cx(g.col)}" y1="${ry(g.row)}" x2="${cx(g.col + 1)}" y2="${ry(g.row)}"/>`; });
    for (let c = 0; c < N; c++) {
      const w = Math.min(geo.colGap - 10, 96);
      s += `<g class="lad-top" data-col="${c}" tabindex="0" role="button" aria-label="${esc(participants[c])} 결과 보기">
        <rect x="${cx(c) - w / 2}" y="${geo.topY}" width="${w}" height="34"/>
        <text x="${cx(c)}" y="${geo.topY + 22}" text-anchor="middle">${esc(clip(participants[c], 6))}</text></g>`;
      s += `<g class="lad-bot" data-idx="${c}"><rect x="${cx(c) - w / 2}" y="${geo.ladBot + 8}" width="${w}" height="34"/>
        <text x="${cx(c)}" y="${geo.ladBot + 30}" text-anchor="middle">?</text></g>`;
    }
    s += `</svg>`;
    els.ladderStage.innerHTML = s;
    els.ladderResults.innerHTML = '';
    els.ladderStage.querySelectorAll('.lad-top').forEach(g => {
      const run = () => revealOne(Number(g.dataset.col));
      g.addEventListener('click', run);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
    });
  }
  function revealOne(startCol) {
    const D = LAD.data; if (!D || D.traced[startCol] != null) return;
    const svg = $('ladderSvg'); const color = LAD.palette[startCol % LAD.palette.length];
    const { end, pts } = traceLadder(startCol);
    D.traced[startCol] = end;
    const poly = document.createElementNS(SVGNS, 'polyline');
    poly.setAttribute('class', 'lad-trace');
    poly.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    poly.setAttribute('stroke', color);
    svg.appendChild(poly);
    const len = poly.getTotalLength();
    poly.style.strokeDasharray = len; poly.style.strokeDashoffset = len;
    requestAnimationFrame(() => { poly.style.strokeDashoffset = '0'; });
    const top = svg.querySelector(`.lad-top[data-col="${startCol}"]`);
    if (top) { top.classList.add('done'); top.querySelector('rect').setAttribute('stroke', color); top.querySelector('text').setAttribute('fill', color); }
    setTimeout(() => revealBottom(end, startCol, color), 700);
  }
  function revealBottom(idx, startCol, color) {
    const D = LAD.data; const r = D.results[idx];
    const bot = $('ladderSvg').querySelector(`.lad-bot[data-idx="${idx}"]`);
    if (bot && !bot.classList.contains('revealed')) {
      bot.classList.add('revealed');
      bot.querySelector('rect').setAttribute('stroke', color);
      const t = bot.querySelector('text'); t.textContent = clip(r.name, 7); t.setAttribute('fill', color);
    }
    addResultRow(D.participants[startCol], r, color);
  }
  function addResultRow(who, r, color) {
    const div = document.createElement('div');
    div.className = 'lr';
    div.innerHTML = `<span class="who" style="color:${color}">${esc(who)}</span>
      <span class="arrow">→</span>
      <a href="${r.mapLinks.naver}" target="_blank" rel="noopener">${esc(r.name)}</a>
      <span class="meta">${esc(r.category)} · ${esc(r.distanceLabel)} · ${esc(r.representativeMenus[0] || '')}</span>`;
    els.ladderResults.appendChild(div);
  }
  function revealAll() {
    const D = LAD.data; if (!D) { toast('먼저 사다리를 만들어 주세요.'); return; }
    for (let c = 0; c < D.N; c++) setTimeout(() => revealOne(c), c * 260);
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

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
