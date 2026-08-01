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
import { readFile } from 'node:fs/promises';

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


/* 巡回する場面。
   ここが薄いと、測っていない場所の違反を見逃したまま「合格」を返してしまう。
   実際、最初はダイアログの中とメンバー詳細を一度も開いておらず、
   再監査で MUST 違反4件（ダイアログ内の文字色32件・戻るリンクの当たり判定・
   メンバー詳細に h1 が無い・拡大詳細のボタンがスマホで32px）を
   見逃したまま合格を出していた。直した範囲と巡回範囲がちょうど一致していた。
   場面を増やすときは「閉じるところまで」を1組にすること */
/* 開けなかった場面は out.__missed に積む。
   以前は try/catch で黙って通り過ぎていたため、#23 で消えた
   「年間アルバム」「これまでの節目」を開こうとして失敗しても何も言わず、
   焦点の復帰は実質 CSV 1つでしか測っていなかった。
   実在する削除の確認・1on1準備メモ・権限変更・監査ログCSVは一度も測られていない。
   場面が開けないこと自体を不合格にする（監査 ゲートの盲点⑧） */
async function visitAll(p, collect) {
  const out = [];
  out.__missed = [];
  const take = async label => out.push(...(await collect()).map(x => ({ ...x, screen: label })));
  const wait = ms => p.waitForTimeout(ms);

  // ---- 本人の3画面 ----
  for (const v of ['album', 'shape', 'sent']) {
    await p.locator(`.tab[data-v="${v}"]`).click();
    await wait(700);
    await take(v);
  }

  // ---- 拡大詳細（カードの中身。ボタン・注記・やり取りが全部ここにある） ----
  await p.locator(`.tab[data-v="album"]`).click();
  await wait(600);
  try {
    await p.locator('#grid .card').first().click({ timeout: 3000 });
    await wait(900);
    await take('拡大詳細');
    await p.keyboard.press('Escape');
    await wait(700);
  } catch {}

  // ---- ダイアログ群 ----
  // いま実在するダイアログだけを並べる。消えた画面を並べたままにすると、
  // 開けないのが当たり前になって「開けない」の意味が薄れる
  const dialogs = [['CSVで書き出す', 'CSV']];
  for (const [label, name] of dialogs) {
    try {
      await p.locator('button', { hasText: label }).first().click({ timeout: 2500 });
      await wait(700);
      if (await p.locator('.overlay').count() === 0) { out.__missed.push(name + '（押しても開かない）'); continue; }
      await take(name);
      await p.keyboard.press('Escape');
      await wait(600);
    } catch { out.__missed.push(name); }
  }

  // ---- 削除の確認（拡大詳細の中から開く入れ子） ----
  /* 削除はイシュー#24 で、日付の右の「⋯」の中へ移った。
     先にメニューを開かないと [data-del] は隠れたままで、
     ここから先（削除の確認）へ一度も入れない。開いた状態も1場面として測る */
  try {
    await p.locator('#grid .card').first().click({ timeout: 3000 });
    await wait(900);
    await p.locator('[data-card-menu]').first().click({ timeout: 2500 });
    await wait(400);
    await take('カードの操作メニュー');
    await p.locator('[data-del]').first().click({ timeout: 2500 });
    await wait(700);
    await take('削除の確認');
    await p.keyboard.press('Escape');
    await wait(500);
    await p.keyboard.press('Escape');
    await wait(700);
  } catch { out.__missed.push('カードの操作メニュー／削除の確認'); }
  await p.evaluate(() => document.querySelectorAll('.overlay').forEach(o => o.remove()));
  await wait(300);

  // ---- 上司：一覧とメンバー詳細（3つのサブタブ）と1on1準備メモ ----
  try {
    await p.locator('.seg button', { hasText: '上司' }).first().click({ timeout: 3000 });
    await wait(900);
    await take('上司一覧');
    /* 行は上司の一覧（#viewTeam）のものを指す。
       `.tbl tbody tr` だけだと、先に描かれている「表で見る」の隠れた表
       （#viewShape の .chart-table）の行に当たり、
       「element is not visible」でメンバー詳細まで一度も進めていなかった。
       同じ理由で 1on1準備メモも「1on1」という文字のボタンが無いため開けていない
       （開く操作は月次レポートの行＝.report-item） */
    await p.locator('#viewTeam .tbl tbody tr').first().click({ timeout: 3000 });
    await wait(900);
    await take('メンバー詳細');
    for (const sub of await p.locator('.sub-tab').all()) {
      try { await sub.click({ timeout: 2000 }); await wait(700); await take('メンバー詳細サブ'); } catch {}
    }
    try {
      await p.locator('.report-item').first().click({ timeout: 2500 });
      await wait(800);
      await take('1on1準備メモ');
      await p.keyboard.press('Escape');
      await wait(600);
    } catch { out.__missed.push('1on1準備メモ'); }
  } catch { out.__missed.push('上司のメンバー詳細'); }

  // ---- 管理者：4つのタブ ----
  try {
    await p.locator('.seg button', { hasText: '管理者' }).first().click({ timeout: 3000 });
    await wait(900);
    await take('管理者');
    for (const sub of await p.locator('.sub-tab').all()) {
      try { await sub.click({ timeout: 2000 }); await wait(700); await take('管理者サブ'); } catch {}
    }
  } catch { out.__missed.push('管理者'); }

  return out;
}

const browser = await chromium.launch();

/* ---- コントラスト比 -------------------------------------------------- */
/* 幅で色は変わらないが、幅で「出る要素」が変わる。
   スマホでしか出ないもの・PCでしか出ないものがあるので両方まわる */
for (const [vw, vh, wlabel] of [[1280, 900, 'PC'], [390, 844, 'スマホ']]) {
  const p = await browser.newPage({ viewport: { width: vw, height: vh } });
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

  const all = await visitAll(p, scan);
  if (wlabel === 'PC')
    check('巡回するはずの場面がすべて開けた', all.__missed.length === 0, all.__missed.join(' / '));
  // 同じ見た目のものは1件にまとめる
  const uniq = [...new Map(all.map(x => [x.cls + x.r, x])).values()].sort((a, b) => a.r - b.r);
  check(`${wlabel}: 文字のコントラスト比が基準を満たす（本文4.5:1／大きな文字3:1）`,
    uniq.length === 0,
    uniq.slice(0, 6).map(x => `[${x.screen}] ${x.cls} ${x.r}:1(要${x.need}) ${x.size}px`).join(' / ')
    + (uniq.length > 6 ? ` ほか${uniq.length - 6}件` : ''));
  await p.close();
}

/* ---- 当たり判定の大きさ ---------------------------------------------- */
for (const [w, h, label, need] of [[1280, 900, 'PC', 24], [390, 844, 'スマホ', 44]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  /* 当たり判定も、コントラストと同じ場面を全部まわって測る。
     拡大詳細とダイアログの中のボタンは、ここを巡回しないと一度も測られない */
  const scanHit = () => p.evaluate(need => {
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
  const small = await visitAll(p, scanHit);
  const uniq = [...new Map(small.map(x => [x.cls + x.w + x.h, x])).values()];
  check(`${label}: 押せるものの当たり判定が${need}px以上`, uniq.length === 0,
    uniq.slice(0, 6).map(x => `[${x.screen}] ${x.cls} ${x.w}x${x.h}`).join(' / ')
    + (uniq.length > 6 ? ` ほか${uniq.length - 6}件` : ''));
  await p.close();
}

/* ---- 横あふれ（全幅） ------------------------------------------------
   これまで 1280 と 390 の2つでしか見ておらず、320px の管理者・監査ログで
   338 > 320 になって実際に18px横へ動くのを3版ぶん見逃していた（監査 盲点⑥）。
   幅は狭いほうから見る。狭いところで壊れるものは広いところでは見えない */
for (const vw of [320, 375, 390, 768, 1280, 1920]) {
  const p = await browser.newPage({ viewport: { width: vw, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2000);
  const bad = [];
  const probe = async label => {
    const r = await p.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
      // どの要素がはみ出しているかも拾う
      who: [...document.querySelectorAll('body *')]
        .filter(e => e.offsetParent !== null && e.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 3).map(e => (String(e.className).split(' ')[0] || e.tagName)
          + ' ' + Math.round(e.getBoundingClientRect().right)),
    }));
    if (r.doc > r.win + 1) bad.push(`${label} ${r.doc}>${r.win}${r.who.length ? '（' + r.who.join(',') + '）' : ''}`);
  };
  for (const v of ['album', 'shape', 'sent']) {
    try { await p.locator(`.tab[data-v="${v}"]`).click({ timeout: 2500 }); await p.waitForTimeout(600); } catch {}
    await probe(v);
  }
  for (const role of ['上司', '管理者']) {
    try { await p.locator('.seg button', { hasText: role }).first().click({ timeout: 2500 }); } catch { continue; }
    await p.waitForTimeout(800);
    await probe(role);
    for (const [i, sub] of (await p.locator('.sub-tab').all()).entries()) {
      try { await sub.click({ timeout: 2000 }); await p.waitForTimeout(600); } catch { continue; }
      await probe(`${role}サブ${i + 1}`);
    }
  }
  check(`${vw}px: 横に溢れていない`, bad.length === 0, bad.slice(0, 4).join(' / '));
  await p.close();
}

/* ---- スマホの入力欄が16px以上か ---------------------------------------
   16px 未満の入力欄に焦点が当たると iOS Safari がページごと勝手に拡大する。
   640px以下で16pxにする @media を書いてあるが、**後から書かれた別の規則に
   打ち消されていた**（.adm-select と .memo-ta）。書いてあることではなく、
   実際に計算された値を見る（監査 盲点⑦） */
{
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(URL);
  await p.waitForTimeout(2000);
  const small = await visitAll(p, () => p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (el.offsetParent === null) continue;
      if (el.type === 'checkbox' || el.type === 'radio') continue;   // 拡大の対象外
      const s = parseFloat(getComputedStyle(el).fontSize);
      if (s < 16) out.push({ cls: String(el.className).split(' ')[0] || el.tagName, s });
    }
    return out;
  }));
  const uniq = [...new Map(small.map(x => [x.cls + x.s, x])).values()];
  check('スマホの入力欄が16px以上（iOSの勝手な拡大を防ぐ）', uniq.length === 0,
    uniq.slice(0, 6).map(x => `[${x.screen}] ${x.cls} ${x.s}px`).join(' / ')
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

/* ---- スタイルシートが最後まで読めているか --------------------------
   マージで規則の閉じ括弧を1つ落としたことがあり、そこから後ろのCSSが
   丸ごと無効になっていた（465規則で打ち切られ、しゃぼん玉と日付のかすれが
   一切効いていなかった）。見た目は「なんとなく違う」だけで、
   他の項目は全部○のまま通ってしまう。

   判定は2本立てにする。
     ① 元の文字列で括弧の数が合っているか（原因そのものを見る）
     ② ブラウザが読んだ規則の数（結果を見る）
   ①だけだと入れ子の取り違えを見逃し、②だけだと「何件なら正しいのか」を
   別に持たねばならない。①が本命で、②は目安として出す */
{
  const src = await readFile(FILE, 'utf8');
  const style = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  // コメントを外してから数える（コメントの中の括弧は数に入れない）
  const bare = style.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = (bare.match(/\{/g) || []).length;
  const close = (bare.match(/\}/g) || []).length;

  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(1800);
  const n = await p.evaluate(() => {
    const sh = [...document.styleSheets].find(s => !s.href);
    return sh ? sh.cssRules.length : 0;
  });
  check('スタイルシートが最後まで読めている（括弧が閉じている）',
    open === close && n > 0,
    open === close ? `規則${n}件・括弧 ${open}対${close}`
                   : `括弧が合っていない：開き${open} 閉じ${close}（差${open - close}）。規則${n}件で打ち切られている`);
  await p.close();
}

/* ---- 閉じたら焦点が戻るか（全てのダイアログで） ----------------------
   拡大詳細だけ見ていて、他の6種のダイアログで焦点が body に落ちているのを
   見逃していた。開く口が違えば戻り方も別の道を通るので、全部通す。
   合わせて、開いている間に背景が読み上げから外れているか（inert）も見る。
   ここを測っていなかったために、inert を入れた変更が焦点の復帰を壊したのに
   合格が出ていた */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);

  /* いま実在する開く口だけを並べる。消えた画面（年間アルバム・これまでの節目）を
     並べたままにしていたため、開けずに黙って飛ばされ、
     焦点の復帰は実質 CSV 1つでしか測っていなかった。
     実在する「削除の確認」「1on1準備メモ」は開き方が違うので、
     押す前の手順（open）を持たせて別に開く */
  const opens = [
    { name: 'CSV', label: 'CSVで書き出す' },
    { name: '削除の確認', label: null, open: async () => {
        await p.locator('#grid .card').first().click({ timeout: 3000 });
        await p.waitForTimeout(800);
        const m = p.locator('[data-card-menu]').first();
        await m.focus(); await m.click();
        await p.waitForTimeout(400);
        await p.locator('[data-del]').first().click({ timeout: 2500 });
        await p.waitForTimeout(700);
        return m;
      } },
  ];
  const backBad = [], inertBad = [], openBad = [];

  /* 焦点が戻るのを「待って」から見る。
     以前は Escape のあと 900ms 固定で見ていたが、閉じる動きは380msかかり、
     さらに元のカードが表に戻るのを rAF で待つ作りなので、
     ほかのページを大量に開いたあとだと900msでは足りずに空振りしていた。
     測りたいのは「戻るか」であって「900ms以内に戻るか」ではない */
  const waitBack = async (test, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await p.evaluate(test)) return true;
      await p.waitForTimeout(120);
    }
    return false;
  };

  for (const spec of opens) {
    const { name, label, open } = spec;
    let btn;
    try {
      if (open) { btn = await open(); }
      else {
        btn = p.locator('button', { hasText: label }).first();
        await btn.waitFor({ timeout: 2500 });
        await btn.focus();
        await btn.click();
        await p.waitForTimeout(800);
      }
    } catch { openBad.push(name); continue; }
    const mark = await btn.evaluate(el => { el.dataset.gateMark = '1'; return true; }).catch(() => false);
    if (!mark) { openBad.push(name + '（起動要素を掴めない）'); continue; }
    if (await p.locator('.overlay').count() === 0) { openBad.push(name + '（開かない）'); continue; }

    // 開いている間、背景は読み上げから外れているか
    const bgOpen = await p.evaluate(() => {
      const bad = [];
      for (const el of document.body.children) {
        if (el.classList?.contains('overlay') || el.classList?.contains('toast')
            || el.id === 'toastLive' || el.classList?.contains('toast-live')) continue;
        if (el.offsetParent === null && el.tagName !== 'HEADER') continue;
        if (!el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true')
          bad.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''));
      }
      return bad;
    });
    if (bgOpen.length) inertBad.push(`${name}: ${bgOpen.join(',')}`);

    await p.keyboard.press('Escape');
    const back = await waitBack(() => document.activeElement?.dataset?.gateMark === '1');
    if (!back) backBad.push(name + '（' + await p.evaluate(() =>
      (document.activeElement?.tagName || '') + '.' + String(document.activeElement?.className || '').split(' ')[0]) + '）');
    // 入れ子で開いた場合に備えて、残っている幕を片付ける
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      document.querySelectorAll('[data-gate-mark]').forEach(e => delete e.dataset.gateMark);
      document.querySelectorAll('.overlay').forEach(o => o.remove());
      document.querySelectorAll('.card').forEach(c => (c.style.visibility = ''));
    });
    await p.waitForTimeout(300);
  }

  // 拡大詳細（通常）
  {
    const card = p.locator('#grid .card').nth(1);
    await card.scrollIntoViewIfNeeded();
    await card.focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(900);
    await p.keyboard.press('Escape');
    const ok = await waitBack(() => /card/.test(String(document.activeElement?.className || '')));
    if (!ok) backBad.push('拡大詳細');
  }

  check('巡回するはずのダイアログがすべて開けた', openBad.length === 0, openBad.join(' / '));
  check('どのダイアログも、閉じたら焦点が開いた場所へ戻る', backBad.length === 0, backBad.join(' / '));
  check('開いている間、背景が読み上げから外れている（inert）', inertBad.length === 0, inertBad.join(' / '));
  await p.close();
}

/* ---- 動きを減らす設定でも、開けて閉じて焦点が戻るか -------------------
   「開けるか」だけを見ていたので、その先で焦点が戻らないのを見逃していた */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.waitForTimeout(2000);
  const card = p.locator('#grid .card').nth(1);
  await card.scrollIntoViewIfNeeded();
  await card.focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  /* 「ある」ではなく「見えている」で判定する。
     裏面は rotateY(180deg) と backface-visibility:hidden を持つので、
     要素の数だけ見ていると、裏を向いて何も描かれていない状態を
     合格と誤って言ってしまう（実際に見逃していた）。
     画面の中央あたりの画素を読んで、暗幕の色でないことを確かめる */
  const opened = await p.evaluate(() => {
    const el = document.querySelector('.f-back, .sheet');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    // 中央に実際にこの要素が来ているか（裏を向いていると手前に出てこない）
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(hit && (el === hit || el.contains(hit)));
  });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  const back = await p.evaluate(() => /card/.test(String(document.activeElement?.className || '')));
  check('動きを減らす設定でも、開いて閉じて焦点が戻る', opened && back && errs.length === 0,
    errs[0] || (!opened ? '開けない' : !back ? '焦点が戻らない' : ''));
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

/* ---- 見出しの階層 ---------------------------------------------------- */
for (const [vw, vh, wlabel] of [[1280, 900, 'PC'], [390, 844, 'スマホ']]) {
  const p = await browser.newPage({ viewport: { width: vw, height: vh } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  const scanH = () => p.evaluate(() => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(e => e.offsetParent !== null);
    const lv = hs.map(e => ({ n: +e.tagName[1], size: parseFloat(getComputedStyle(e).fontSize),
                              t: e.textContent.trim().slice(0, 12) }));
    // visitAll は結果に画面名を足すので、文字列ではなくオブジェクトで返す
    const bad = [];
    const n1 = lv.filter(x => x.n === 1).length;
    if (n1 !== 1) bad.push({ msg: `h1が${n1}個` });
    // 階層の飛び（h1 のあと h3 が来る等）
    for (let i = 1; i < lv.length; i++)
      if (lv[i].n > lv[i - 1].n + 1) bad.push({ msg: `h${lv[i - 1].n}→h${lv[i].n}の飛び` });
    // 見出しは本文より十分大きいこと。日本語は密なので 1.25倍を下限にする
    const body = 16;
    for (const x of lv)
      if (x.n <= 2 && x.size < body * 1.25) bad.push({ msg: `h${x.n} ${x.size}px「${x.t}」` });
    return bad;
  });
  const all = await visitAll(p, scanH);
  const uniq = [...new Set(all.map(x => `[${x.screen}] ${x.msg}`))];
  check(`${wlabel}: 見出しの階層が成立している（h1が1つ・飛びなし・本文の1.25倍以上）`,
    uniq.length === 0, uniq.slice(0, 6).join(' / ') + (uniq.length > 6 ? ` ほか${uniq.length - 6}件` : ''));
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
  /* 「ある」ではなく「見えている」で判定する。
     裏面は rotateY(180deg) と backface-visibility:hidden を持つので、
     要素の数だけ見ていると、裏を向いて何も描かれていない状態を
     合格と誤って言ってしまう（実際に見逃していた）。
     画面の中央あたりの画素を読んで、暗幕の色でないことを確かめる */
  const opened = await p.evaluate(() => {
    const el = document.querySelector('.f-back, .sheet');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    // 中央に実際にこの要素が来ているか（裏を向いていると手前に出てこない）
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(hit && (el === hit || el.contains(hit)));
  });
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
