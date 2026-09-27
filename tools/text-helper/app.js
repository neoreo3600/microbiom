/* 글손질 — 앱 로직. 모든 처리는 브라우저 안에서만 이루어진다(서버 전송 없음). */
(function () {
  'use strict';

  const { RULES } = globalThis.GEULSONJIL_RULES;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ── 저장소 (실패해도 앱은 동작해야 한다) ────────────────────────────
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('geulsonjil:' + key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('geulsonjil:' + key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
    },
  };

  // ── 통계 ─────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  function countStats(text) {
    const chars = Array.from(text);
    const withSpaces = chars.length;
    const noSpaces = chars.filter((c) => !/\s/.test(c)).length;
    const noNewline = chars.filter((c) => c !== '\n' && c !== '\r').length;
    const utf8 = encoder.encode(text).length;
    let twoByte = 0;
    for (const c of chars) twoByte += c.codePointAt(0) <= 0x7f ? 1 : 2;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = text.trim()
      ? text.split(/(?<=[.!?…。！？])["'”’)]?\s+|\n+/).filter((s) => s.trim()).length
      : 0;
    const lines = text ? text.split('\n').length : 0;
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
    const manuscript = Math.ceil(withSpaces / 200);
    const readSec = Math.round((noSpaces / 500) * 60); // 분당 500자 어림
    return { withSpaces, noSpaces, noNewline, utf8, twoByte, words, sentences, lines, paragraphs, manuscript, readSec };
  }
  const fmt = (n) => n.toLocaleString('ko-KR');
  function fmtRead(sec) {
    if (sec < 30) return '30초 미만';
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m === 0) return `약 ${s}초`;
    return s ? `약 ${m}분 ${s}초` : `약 ${m}분`;
  }

  // ── 맞춤법 점검 엔진 ─────────────────────────────────────────────
  function substitute(to, m) {
    return to.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '');
  }
  function check(text) {
    const findings = [];
    const taken = []; // [start, end) 이미 잡힌 구간
    const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
    RULES.forEach((rule, ruleIndex) => {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        if (m[0] === '') { rule.re.lastIndex++; continue; }
        const start = m.index, end = start + m[0].length;
        if (!overlaps(start, end)) {
          const ctx = { before: text[start - 1] ?? '', after: text[end] ?? '' };
          const to = typeof rule.to === 'function' ? rule.to(m, ctx) : substitute(rule.to, m);
          if (to !== null && to !== m[0]) {
            taken.push([start, end]);
            findings.push({
              start, end, from: m[0], to, cat: rule.cat, sure: rule.sure, ruleIndex,
              note: rule.note || `${rule.cat} 기준으로 "${m[0].trim()}"은(는) "${to.trim()}"으로 적습니다.`,
            });
          }
        }
      }
    });
    findings.sort((a, b) => a.start - b.start);
    return findings;
  }

  // ── 상태 ─────────────────────────────────────────────────────────
  const SAMPLE = [
    '안녕하세요. 저는 사람들에게 도움이 되는 도구를 만드는 일을 좋아하는 개발자 입니다.',
    '',
    '지난 몇일 동안 이 프로그램을 만들면서 오랫만에 밤을 새웠는데, 생각보다 훨신 재미있었습니다. 처음엔 어떻해야 할지 몰라 헤메었지만, 하나씩 규칙을 정리하다 보니 금새 틀이 잡혔습니다.',
    '',
    '이 도구는 글자수와 바이트를 세고, 자주 틀리는 맞춤법을 짚어 줍니다. 왠지 자소서 쓸때마다 글자수 제한에 걸려 고생하셨다면 도움이 될꺼예요. 컨텐츠를 정리하는 버튼들도 있으니 한번 써 보시고, 이상한 제안이 있으면 "무시"를 눌러 주세요.',
    '',
    '※ 이 글은 예시 문장입니다. 지우고 자신의 글을 붙여 넣으세요.',
  ].join('\n');

  const state = {
    text: '',
    findings: [],
    ignored: new Set(store.get('ignored', [])),
    showMaybe: store.get('showMaybe', true),
    history: [],
    goal: store.get('goal', 500),
    goalBasis: store.get('goalBasis', 'withSpaces'),
  };

  // ── DOM 참조 ─────────────────────────────────────────────────────
  const ta = $('#editor');
  const backdrop = $('#backdrop');
  const findingsList = $('#findings');
  const toast = $('#toast');

  let toastTimer;
  function say(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 1800);
  }

  // ── 편집기 ─────────────────────────────────────────────────────────
  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight + 2, 280) + 'px';
  }
  function setText(next, { pushHistory = true, keepCaret = false } = {}) {
    if (pushHistory && next !== ta.value) {
      state.history.push(ta.value);
      if (state.history.length > 50) state.history.shift();
    }
    const caret = ta.selectionStart;
    ta.value = next;
    if (keepCaret) ta.setSelectionRange(Math.min(caret, next.length), Math.min(caret, next.length));
    onInput();
  }
  function undo() {
    if (!state.history.length) { say('되돌릴 작업이 없습니다'); return; }
    const prev = state.history.pop();
    ta.value = prev;
    onInput();
    say('되돌렸습니다');
  }

  let renderTimer;
  function onInput() {
    state.text = ta.value;
    autosize();
    store.set('text', state.text);
    renderStats();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      state.findings = check(state.text);
      renderFindings();
      renderBackdrop();
      renderFindCount();
    }, 180);
  }

  // ── 통계 렌더 ────────────────────────────────────────────────────
  const BASIS_LABEL = { withSpaces: '공백 포함', noSpaces: '공백 제외', utf8: '바이트(UTF-8)', twoByte: '바이트(한글 2B)' };
  function renderStats() {
    const s = countStats(state.text);
    $('#st-withSpaces').textContent = fmt(s.withSpaces);
    $('#st-noSpaces').textContent = fmt(s.noSpaces);
    $('#st-noNewline').textContent = fmt(s.noNewline);
    $('#st-utf8').textContent = fmt(s.utf8);
    $('#st-twoByte').textContent = fmt(s.twoByte);
    $('#st-words').textContent = fmt(s.words);
    $('#st-sentences').textContent = fmt(s.sentences);
    $('#st-lines').textContent = fmt(s.lines);
    $('#st-paragraphs').textContent = fmt(s.paragraphs);
    $('#st-manuscript').textContent = fmt(s.manuscript);
    $('#st-read').textContent = fmtRead(s.readSec);
    $('#mini-withSpaces').textContent = fmt(s.withSpaces);
    $('#mini-noSpaces').textContent = fmt(s.noSpaces);
    $('#mini-utf8').textContent = fmt(s.utf8);

    // 목표
    const goal = Number(state.goal) || 0;
    const cur = s[state.goalBasis] ?? 0;
    const bar = $('#goal-bar');
    const msg = $('#goal-msg');
    const wrap = $('#goal');
    if (goal > 0) {
      const ratio = Math.min(cur / goal, 1);
      bar.style.width = (ratio * 100).toFixed(1) + '%';
      wrap.classList.toggle('over', cur > goal);
      wrap.classList.toggle('done', cur === goal);
      const unit = state.goalBasis.includes('yte') || state.goalBasis === 'utf8' || state.goalBasis === 'twoByte' ? '바이트' : '자';
      msg.textContent = cur > goal
        ? `${fmt(cur - goal)}${unit} 초과 (${fmt(cur)} / ${fmt(goal)})`
        : cur === goal
          ? `목표 달성 (${fmt(cur)} / ${fmt(goal)})`
          : `${fmt(goal - cur)}${unit} 남음 (${fmt(cur)} / ${fmt(goal)}, ${BASIS_LABEL[state.goalBasis]})`;
    } else {
      bar.style.width = '0%';
      wrap.classList.remove('over', 'done');
      msg.textContent = '목표를 입력하면 진행률이 표시됩니다';
    }
  }

  // ── 하이라이트 배경 ───────────────────────────────────────────────
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function visibleFindings() {
    return state.findings.filter((f) => !state.ignored.has(f.from) && (state.showMaybe || f.sure));
  }
  function renderBackdrop() {
    const text = state.text;
    const list = visibleFindings();
    let html = '', pos = 0;
    list.forEach((f) => {
      html += esc(text.slice(pos, f.start));
      html += `<mark class="${f.sure ? 'sure' : 'maybe'}" data-i="${f.start}">${esc(text.slice(f.start, f.end))}</mark>`;
      pos = f.end;
    });
    html += esc(text.slice(pos)) + '​';
    backdrop.innerHTML = html;
  }

  // ── 점검 결과 렌더 ────────────────────────────────────────────────
  function renderFindings() {
    const list = visibleFindings();
    const sureCount = list.filter((f) => f.sure).length;
    const hidden = state.findings.length - list.length;
    $('#findings-count').textContent = list.length ? fmt(list.length) : '0';
    $('#findings-sub').textContent = list.length
      ? `확실 ${fmt(sureCount)} · 확인 필요 ${fmt(list.length - sureCount)}${hidden ? ` · 숨김 ${fmt(hidden)}` : ''}`
      : state.text.trim() ? '규칙에 걸리는 부분이 없습니다' : '글을 입력하면 자동으로 점검합니다';
    $('#apply-all').disabled = sureCount === 0;

    findingsList.innerHTML = '';
    if (!list.length) return;
    const frag = document.createDocumentFragment();
    list.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'finding ' + (f.sure ? 'sure' : 'maybe');
      li.innerHTML = `
        <button type="button" class="finding-main" data-act="jump" title="본문에서 위치 보기">
          <span class="chip">${esc(f.cat)}${f.sure ? '' : ' · 확인'}</span>
          <span class="diff"><s>${esc(f.from)}</s><span class="to">${esc(f.to)}</span></span>
          <span class="note">${esc(f.note)}</span>
        </button>
        <span class="finding-actions">
          <button type="button" class="btn small primary" data-act="apply">적용</button>
          <button type="button" class="btn small ghost" data-act="ignore" title="같은 표현을 이 기기에서 더 이상 표시하지 않습니다">무시</button>
        </span>`;
      li.dataset.start = f.start;
      li.dataset.end = f.end;
      frag.appendChild(li);
    });
    findingsList.appendChild(frag);
  }

  function findingAt(li) {
    const start = Number(li.dataset.start), end = Number(li.dataset.end);
    return state.findings.find((f) => f.start === start && f.end === end);
  }
  function applyFinding(f) {
    // 현재 텍스트에서 위치·내용이 여전히 일치하는지 확인 (입력 중 어긋남 방지)
    if (state.text.slice(f.start, f.end) !== f.from) { say('본문이 바뀌어 위치를 다시 계산합니다'); onInput(); return; }
    const next = state.text.slice(0, f.start) + f.to + state.text.slice(f.end);
    setText(next);
    say(`"${f.from.trim()}" → "${f.to.trim()}"`);
  }
  function applyAllSure() {
    const list = visibleFindings().filter((f) => f.sure).sort((a, b) => b.start - a.start);
    if (!list.length) return;
    let text = state.text;
    for (const f of list) {
      if (text.slice(f.start, f.end) !== f.from) continue;
      text = text.slice(0, f.start) + f.to + text.slice(f.end);
    }
    setText(text);
    say(`${list.length}곳을 고쳤습니다`);
  }
  function jumpTo(f) {
    ta.focus();
    ta.setSelectionRange(f.start, f.end);
    const mark = backdrop.querySelector(`mark[data-i="${f.start}"]`);
    if (mark) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  findingsList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const li = btn.closest('li');
    const f = findingAt(li);
    if (!f) return;
    if (btn.dataset.act === 'apply') applyFinding(f);
    else if (btn.dataset.act === 'ignore') {
      state.ignored.add(f.from);
      store.set('ignored', Array.from(state.ignored));
      renderFindings(); renderBackdrop();
      say(`"${f.from.trim()}"은(는) 더 표시하지 않습니다`);
      $('#reset-ignored').hidden = false;
    } else jumpTo(f);
  });
  $('#apply-all').addEventListener('click', applyAllSure);
  $('#show-maybe').checked = state.showMaybe;
  $('#show-maybe').addEventListener('change', (e) => {
    state.showMaybe = e.target.checked;
    store.set('showMaybe', state.showMaybe);
    renderFindings(); renderBackdrop();
  });
  $('#reset-ignored').hidden = state.ignored.size === 0;
  $('#reset-ignored').addEventListener('click', () => {
    state.ignored.clear();
    store.set('ignored', []);
    $('#reset-ignored').hidden = true;
    renderFindings(); renderBackdrop();
    say('무시 목록을 비웠습니다');
  });

  // ── 정리 도구 ────────────────────────────────────────────────────
  const CLEANERS = {
    spaces: (t) => t.replace(/[ \t　]{2,}/g, ' '),
    trimLines: (t) => t.split('\n').map((l) => l.trim()).join('\n'),
    dropBlank: (t) => t.split('\n').filter((l) => l.trim()).join('\n'),
    oneBlank: (t) => t.replace(/\n{3,}/g, '\n\n'),
    joinLines: (t) => t.replace(/\s*\n\s*/g, ' ').trim(),
    sentencePerLine: (t) => t.replace(/([.!?…]+["'”’)]?)\s+/g, '$1\n'),
    dedupe: (t) => { const seen = new Set(); return t.split('\n').filter((l) => (seen.has(l) ? false : (seen.add(l), true))).join('\n'); },
    sort: (t) => t.split('\n').sort((a, b) => a.localeCompare(b, 'ko')).join('\n'),
    reverse: (t) => t.split('\n').reverse().join('\n'),
    quotes: (t) => t.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'"),
    halfwidth: (t) => t.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' '),
    punctSpace: (t) => t.replace(/[ \t]+([,.!?;:])/g, '$1'),
    numberLines: (t) => t.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n'),
    upper: (t) => t.toUpperCase(),
    lower: (t) => t.toLowerCase(),
  };
  $('#cleaners').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clean]');
    if (!btn) return;
    const fn = CLEANERS[btn.dataset.clean];
    const before = ta.value;
    const after = fn(before);
    if (after === before) { say('바뀐 내용이 없습니다'); return; }
    setText(after);
    say(btn.textContent.trim() + ' 완료');
  });
  $('#undo').addEventListener('click', undo);

  // ── 찾기·바꾸기 ──────────────────────────────────────────────────
  const fq = $('#find-q'), fr = $('#find-r'), fRegex = $('#find-regex'), fCase = $('#find-case');
  function buildRegex() {
    const q = fq.value;
    if (!q) return null;
    const flags = 'g' + (fCase.checked ? '' : 'i');
    try {
      return fRegex.checked ? new RegExp(q, flags) : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch {
      return 'invalid';
    }
  }
  function renderFindCount() {
    const re = buildRegex();
    const out = $('#find-count');
    if (!re) { out.textContent = ''; return; }
    if (re === 'invalid') { out.textContent = '정규식이 올바르지 않습니다'; return; }
    const n = (ta.value.match(re) || []).length;
    out.textContent = n ? `${fmt(n)}곳 일치` : '일치 없음';
  }
  function findNext() {
    const re = buildRegex();
    if (!re || re === 'invalid') return;
    re.lastIndex = ta.selectionEnd;
    let m = re.exec(ta.value);
    if (!m) { re.lastIndex = 0; m = re.exec(ta.value); }
    if (!m) { say('일치하는 곳이 없습니다'); return; }
    ta.focus();
    ta.setSelectionRange(m.index, m.index + m[0].length);
    // 자동 높이 편집기라 페이지 스크롤로 위치를 맞춘다
    const ratio = m.index / Math.max(ta.value.length, 1);
    const rect = ta.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top + rect.height * ratio - window.innerHeight / 2, behavior: 'smooth' });
  }
  function replaceOne() {
    const re = buildRegex();
    if (!re || re === 'invalid') return;
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    re.lastIndex = 0;
    const m = re.exec(sel);
    if (sel && m && m.index === 0 && m[0].length === sel.length) {
      const s = ta.selectionStart;
      const replaced = fRegex.checked ? sel.replace(new RegExp(re.source, re.flags.replace('g', '')), fr.value) : fr.value;
      setText(ta.value.slice(0, s) + replaced + ta.value.slice(ta.selectionEnd));
      ta.setSelectionRange(s + replaced.length, s + replaced.length);
    }
    findNext();
  }
  function replaceAll() {
    const re = buildRegex();
    if (!re || re === 'invalid') return;
    const n = (ta.value.match(re) || []).length;
    if (!n) { say('일치하는 곳이 없습니다'); return; }
    setText(ta.value.replace(re, fr.value));
    say(`${fmt(n)}곳을 바꿨습니다`);
  }
  [fq, fRegex, fCase].forEach((el) => el.addEventListener('input', renderFindCount));
  fq.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findNext(); } });
  $('#find-next').addEventListener('click', findNext);
  $('#replace-one').addEventListener('click', replaceOne);
  $('#replace-all').addEventListener('click', replaceAll);

  // ── 목표 ─────────────────────────────────────────────────────────
  const goalInput = $('#goal-n'), goalBasis = $('#goal-basis');
  goalInput.value = state.goal || '';
  goalBasis.value = state.goalBasis;
  goalInput.addEventListener('input', () => { state.goal = Number(goalInput.value) || 0; store.set('goal', state.goal); renderStats(); });
  goalBasis.addEventListener('change', () => { state.goalBasis = goalBasis.value; store.set('goalBasis', state.goalBasis); renderStats(); });
  $$('[data-goal]').forEach((b) => b.addEventListener('click', () => { goalInput.value = b.dataset.goal; goalInput.dispatchEvent(new Event('input')); }));

  // ── 상단 동작: 복사 · 파일 열기 · 지우기 · 테마 ───────────────────
  $('#copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      say('본문을 복사했습니다');
    } catch {
      ta.focus(); ta.select();
      say('자동 복사가 막혀 있어 본문을 선택했습니다. Ctrl/⌘+C 를 눌러 주세요');
    }
  });
  const fileInput = $('#file');
  $('#open').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });
  function loadFile(file) {
    if (file.size > 5 * 1024 * 1024) { say('5MB 이하의 텍스트 파일만 열 수 있습니다'); return; }
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result)); say(`"${file.name}"을(를) 불러왔습니다`); };
    reader.onerror = () => say('파일을 읽지 못했습니다');
    reader.readAsText(file, 'utf-8');
  }
  const drop = $('#editor-wrap');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });

  const clearBtn = $('#clear'), clearConfirm = $('#clear-confirm');
  clearBtn.addEventListener('click', () => { clearConfirm.hidden = false; clearBtn.hidden = true; });
  $('#clear-yes').addEventListener('click', () => { setText(''); clearConfirm.hidden = true; clearBtn.hidden = false; say('본문을 지웠습니다. 되돌리기로 복구할 수 있습니다'); });
  $('#clear-no').addEventListener('click', () => { clearConfirm.hidden = true; clearBtn.hidden = false; });

  const THEMES = ['system', 'light', 'dark'];
  const THEME_LABEL = { system: '테마: 시스템', light: '테마: 밝게', dark: '테마: 어둡게' };
  function applyTheme(t) {
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    $('#theme').textContent = THEME_LABEL[t];
    $('#theme').setAttribute('aria-label', THEME_LABEL[t] + ' (눌러서 바꾸기)');
  }
  let theme = store.get('theme', 'system');
  applyTheme(theme);
  $('#theme').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('theme', theme);
    applyTheme(theme);
  });

  // ── 단축키 ───────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'f' && !e.shiftKey && document.activeElement === ta) { e.preventDefault(); fq.focus(); fq.select(); }
    if (mod && e.key.toLowerCase() === 'h') { e.preventDefault(); fr.focus(); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'z' && document.activeElement !== ta) { e.preventDefault(); undo(); }
  });

  // ── 시작 ─────────────────────────────────────────────────────────
  ta.addEventListener('input', onInput);
  window.addEventListener('resize', autosize);
  const saved = store.get('text', null);
  ta.value = saved === null ? SAMPLE : saved;
  onInput();

  // 배포 환경(https 또는 localhost)에서만 서비스 워커 등록. 실패해도 조용히 넘어간다.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
