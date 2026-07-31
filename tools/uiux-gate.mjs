/**
 * オブリエ UI/UX 合否ゲート
 *
 * 監査報告書（docs/uiux-audit.md）が「あるべき姿」を書くのに対し、
 * こちらは同じ基準を**毎回機械で確かめる**ためのもの。
 * 直したつもりで直っていない、直したのに別の場所で壊した、を防ぐ。
 *
 * 判定は実際にブラウザで開いて描画結果から測る（CSSの記述は見ない）。
 *
 * 基準の出典は docs/uiux-references.md（SmartHR / freee / DADS）。
 *   ・本文のコントラスト比 4.5:1 以上（大きな文字は 3:1）
 *   ・フォーカスの見た目が背景に対し 3:1 以上、かつ全操作要素で見えること
 *   ・押せるものの当たり判定は スマホ44px / PC24px 以上
 *   ・Tab で全ての操作要素に到達でき、順序が視覚順序と一致すること
 *   ・モーダルは焦点を閉じ込め、Escapeで閉じ、閉じたら元へ戻すこと
 *
 * 使い方: node tools/uiux-gate.mjs [ファイルパス]
 * 終了コード 0 = 合格 / 1 = 不合格
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';

const FILE = process.argv[2] || '/home/user/OBRIER/prototype/obrier-prototype-v5.html';
const URL = 'file://' + path.resolve(FILE);

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

/* ブラウザ側に注入する道具。色の合成とコントラスト比の計算 */
const TOOLS = `
window.__ui = {
  /* 色の解析は canvas に一度描いて画素を読む。
     この画面は color-mix() を多用しており、その計算値は rgb() 以外の
     書式（color(srgb …) や oklab(…)）で返ることがある。
     正規表現で rgb を待っていると取りこぼす。
     canvas はブラウザが解釈できる書式なら何でも受けるので確実 */
  _cv: null,
  parse(c) {
    if (!c || c === 'none' || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (!this._cv) { this._cv = document.createElement('canvas'); this._cv.width = this._cv.height = 1; }
    const x = this._cv.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, 1, 1);
    x.fillStyle = 'rgba(0,0,0,0)';
    x.fillStyle = c;                       // 解釈できなければ直前の値が残る
    x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  },
  over(fg, bg) {
    if (!fg) return bg;
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  },
  // その要素の背後にある「実際の」色。透明なら親をたどる
  bgOf(el) {
    let cur = el, stack = [];
    while (cur && cur !== document.documentElement) {
      const c = this.parse(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
      cur = cur.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = this.over(stack[i], base);
    return base;
  },
  lum(c) {
    const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  },
  ratio(a, b) {
    const l1 = this.lum(a), l2 = this.lum(b);
    return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
  },
  // 和文は同じptでも小さく見えるため、「大きな文字」の閾値を欧文より厳しく取る
  // （freee: 和文 22pt / 太字18pt ≒ 29px / 24px）
  isLarge(size, weight) {
    return size >= 29 || (size >= 24 && parseInt(weight) >= 700);
  },
};
`;

const browser = await chromium.launch();

/* ---- コントラスト比 -------------------------------------------------- */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  await p.addScriptTag({ content: TOOLS });

  const scan = () => p.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null) continue;
      const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (!t) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) === 0) continue;
      const size = parseFloat(cs.fontSize);
      const fg = window.__ui.parse(cs.color);
      const bg = window.__ui.bgOf(el);
      // 文字自体の不透明度も効くので、下地に乗せてから測る
      const eff = window.__ui.over({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * parseFloat(cs.opacity) }, bg);
      const r = window.__ui.ratio(eff, bg);
      const need = window.__ui.isLarge(size, cs.fontWeight) ? 3 : 4.5;
      if (r < need) bad.push({
        cls: String(el.className).split(' ')[0] || el.tagName,
        r, need, size, t: t.slice(0, 14),
      });
    }
    return bad;
  });

  const all = [];
  for (const v of ['album', 'shape', 'sent']) {
    await p.locator(`.tab[data-v="${v}"]`).click();
    await p.waitForTimeout(700);
    all.push(...(await scan()).map(x => ({ ...x, screen: v })));
  }
  for (const r of ['上司', '管理者']) {
    try { await p.locator('.seg button', { hasText: r }).first().click({ timeout: 3000 }); } catch { continue; }
    await p.waitForTimeout(900);
    all.push(...(await scan()).map(x => ({ ...x, screen: r })));
  }
  // 同じ見た目のものは1件にまとめる
  const uniq = [...new Map(all.map(x => [x.cls + x.r, x])).values()].sort((a, b) => a.r - b.r);
  check('文字のコントラスト比が基準を満たす（本文4.5:1／大きな文字3:1）',
    uniq.length === 0,
    uniq.slice(0, 6).map(x => `${x.cls} ${x.r}:1(要${x.need}) ${x.size}px「${x.t}」`).join(' / ')
    + (uniq.length > 6 ? ` ほか${uniq.length - 6}件` : ''));
  await p.close();
}

/* ---- 当たり判定の大きさ ---------------------------------------------- */
for (const [w, h, label, need] of [[1280, 900, 'PC', 24], [390, 844, 'スマホ', 44]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  const small = await p.evaluate(need => {
    const out = [];
    const sel = 'button, a[href], [role="button"], input, select, textarea, .tab, .card, [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll(sel)) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // 見た目が小さくても、余白で当たり判定を広げていれば良い
      if (r.width < need || r.height < need) out.push({
        cls: String(el.className).split(' ')[0] || el.tagName,
        w: Math.round(r.width), h: Math.round(r.height),
        t: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 10),
      });
    }
    return out;
  }, need);
  const uniq = [...new Map(small.map(x => [x.cls + x.w + x.h, x])).values()];
  check(`${label}: 押せるものの当たり判定が${need}px以上`, uniq.length === 0,
    uniq.slice(0, 6).map(x => `${x.cls} ${x.w}x${x.h}`).join(' / ')
    + (uniq.length > 6 ? ` ほか${uniq.length - 6}件` : ''));
  await p.close();
}

/* ---- キーボード操作とフォーカスの見え方 ------------------------------ */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  await p.addScriptTag({ content: TOOLS });

  // 見えている操作要素のうち、Tabで到達できないもの
  const reach = await p.evaluate(() => {
    const sel = 'button, a[href], [role="button"], input, select, textarea, .tab, .card:not(.static)';
    const want = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
    const unreachable = want.filter(e => {
      if (e.hasAttribute('disabled')) return false;
      const ti = e.getAttribute('tabindex');
      if (ti !== null) return parseInt(ti) < 0;
      // 元から焦点を取れるのはこれら。div や span は tabindex が要る
      return !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
    });
    return unreachable.map(e => ({
      cls: String(e.className).split(' ')[0] || e.tagName,
      t: (e.textContent || '').trim().slice(0, 12),
    }));
  });
  const ru = [...new Map(reach.map(x => [x.cls, x])).values()];
  check('見えている操作要素すべてにキーボードで到達できる', ru.length === 0,
    ru.slice(0, 6).map(x => `${x.cls}「${x.t}」`).join(' / ')
    + (ru.length > 6 ? ` ほか${ru.length - 6}件` : ''));

  // 焦点が当たったときに見た目が変わるか（変わらない＝どこにいるか分からない）
  const invisible = await p.evaluate(() => {
    const out = [];
    const sel = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    /* 見た目の変化は、その要素自身とは限らない。
       たとえばカードは :focus-visible で中の .card3d に影を付けている。
       自分だけを見ていると「見えない」と誤って言ってしまうので、
       自分と子孫をまとめて撮って比べる */
    const snap = el => {
      const one = e => { const s = getComputedStyle(e);
        return [s.outline, s.outlineOffset, s.boxShadow, s.borderColor, s.backgroundColor, s.color].join('|'); };
      return [el, ...el.querySelectorAll('*')].map(one).join('~');
    };
    for (const el of document.querySelectorAll(sel)) {
      if (el.offsetParent === null) continue;
      const a = snap(el);
      el.focus();
      const b = snap(el);
      if (a === b) out.push({ cls: String(el.className).split(' ')[0] || el.tagName,
                              t: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 10) });
      el.blur();
    }
    return out;
  });
  const iu = [...new Map(invisible.map(x => [x.cls, x])).values()];
  check('焦点が当たったことが見た目で分かる', iu.length === 0,
    iu.slice(0, 6).map(x => `${x.cls}「${x.t}」`).join(' / ')
    + (iu.length > 6 ? ` ほか${iu.length - 6}件` : ''));

  await p.close();
}

/* ---- モーダル（拡大詳細）の作法 -------------------------------------- */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);

  const card = p.locator('#grid .card').nth(1);
  await card.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);

  // キーボードだけで開けるか
  await card.focus();
  const focusable = await p.evaluate(() => document.activeElement?.className || '');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  const openedByKey = await p.locator('.f-back').count() > 0;
  check('カードをキーボード（Enter）で開ける', openedByKey && /card/.test(focusable),
    openedByKey ? '' : `焦点=${focusable || 'なし'}`);

  if (openedByKey) {
    // 開いた直後、焦点が詳細の中に移っているか
    const inside = await p.evaluate(() => {
      const ov = document.querySelector('.overlay');
      return !!(ov && document.activeElement && ov.contains(document.activeElement));
    });
    check('開いたとき焦点が詳細の中に移る', inside);

    // Tabを回しても詳細の外へ出ないか（閉じ込め）
    let escaped = false;
    for (let i = 0; i < 25; i++) {
      await p.keyboard.press('Tab');
      const out = await p.evaluate(() => {
        const ov = document.querySelector('.overlay');
        return !!(ov && document.activeElement && !ov.contains(document.activeElement)
                  && document.activeElement !== document.body);
      });
      if (out) { escaped = true; break; }
    }
    check('詳細を開いている間、焦点が外へ出ない', !escaped);

    // Escapeで閉じられるか
    await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
    check('Escapeで詳細を閉じられる', await p.locator('.f-back').count() === 0);

    // 閉じたあと、元のカードへ焦点が戻るか
    const back = await p.evaluate(() => String(document.activeElement?.className || ''));
    check('閉じたあと焦点が元のカードへ戻る', /card/.test(back), `焦点=${back || 'body'}`);
  } else {
    check('開いたとき焦点が詳細の中に移る', false, 'キーボードで開けないため未確認');
    check('詳細を開いている間、焦点が外へ出ない', false, '同上');
    check('Escapeで詳細を閉じられる', false, '同上');
    check('閉じたあと焦点が元のカードへ戻る', false, '同上');
  }
  await p.close();
}

/* ---- 状態の網羅 ------------------------------------------------------ */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);

  /* 0件のとき空状態が出るか。
     アルバムの絞り込みはタグ（#tagFilter）で行う。
     どのタグでも0件にならないので、いったん元データを空にして描き直す */
  const emptyInfo = await p.evaluate(() => {
    const g = document.getElementById('grid');
    if (!g) return { ok: false, why: 'アルバムが無い' };
    if (typeof DATA === 'undefined' || typeof applyFilters !== 'function')
      return { ok: false, why: '絞り込みの仕掛けに手が届かない' };
    const keep = DATA.splice(0, DATA.length);
    applyFilters();
    const html = g.innerHTML;
    const text = g.innerText.replace(/\s+/g, ' ').trim();
    DATA.push(...keep);
    applyFilters();
    return { ok: true, html, text };
  });
  await p.waitForTimeout(400);
  const hasEmpty = emptyInfo.ok && /empty/.test(emptyInfo.html || '');
  check('0件のとき、空状態の案内が出る', hasEmpty, emptyInfo.why || `表示=「${emptyInfo.text}」`);
  /* 空状態は「状態の説明」だけでなく「次に何が起きるか／何ができるか」まで書く
     （SmartHR・Carbon の空状態パターン）。一文で終わっていないかを見る */
  const t = emptyInfo.text || '';
  const hasNext = hasEmpty && /(と|すると|してください|できます|変えて|外して|届く|並びます|見直)/.test(t) && t.length >= 24;
  check('空状態に次の一手が書かれている', hasNext, hasEmpty ? `表示=「${t}」` : '空状態が出ないため未確認');

  await p.close();
}

/* ---- 動きを減らす設定 ------------------------------------------------ */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.waitForTimeout(2000);
  await p.locator('#grid .card').nth(1).click();
  await p.waitForTimeout(600);
  const opened = await p.locator('.f-back, .sheet').count() > 0;
  check('動きを減らす設定でも詳細が開ける', opened && errs.length === 0, errs[0] || '');
  await p.close();
}

await browser.close();

/* ---- 結果 ------------------------------------------------------------ */
const width = s => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
const pad = s => s + ' '.repeat(Math.max(1, 52 - width(s)));
console.log('\n=== オブリエ UI/UX 合否ゲート ===\n');
for (const r of results) console.log((r.pass ? '○ ' : '× ') + pad(r.name) + (r.detail || ''));
const ng = results.filter(r => !r.pass);
console.log(`\n判定: ${ng.length === 0 ? '合格' : `不合格（${ng.length}件）`} — ${results.length}項目`);
process.exit(ng.length === 0 ? 0 : 1);
