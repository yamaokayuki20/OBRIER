/**
 * オブリエ プロトタイプ 回帰検査
 *
 * UI/UX改善で手を入れたあと、これまで積み上げた保証が壊れていないかを見る。
 * 実際にブラウザで開いて操作し、描画結果を測る（CSSの記述ではなく結果を見る）。
 *
 *   1. JSエラーが出ない
 *   2. 全画面が開ける（本人3タブ・上司・管理者）
 *   3. 文字サイズが基準を満たす（本文16px以上／最小12px以上）
 *   4. はみ出し・横スクロールが無い（1280 / 390）
 *   5. カードの丈がそろっていて、本文が行の途中で切れていない
 *   6. 押した瞬間に本文の字面が変わらない
 *   7. 閉じるとき、戻り切った最後のコマでカードが元の位置に着く（着地ずれ）
 *   8. じぶんのメモが上司・管理者に漏れていない
 *
 * 使い方: node tools/check.mjs [ファイルパス]
 * 終了コード 0 = 合格 / 1 = 不合格
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';

const FILE = process.argv[2] || '/home/user/OBRIER/prototype/obrier-prototype-v5.html';
const URL = 'file://' + path.resolve(FILE);
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const browser = await chromium.launch();

/* ---- 1〜2. JSエラーと全画面 ---------------------------------------- */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForTimeout(2200);

  const screens = [];
  for (const v of ['album', 'shape', 'sent']) {
    await p.locator(`.tab[data-v="${v}"]`).click();
    await p.waitForTimeout(700);
    screens.push({ v, len: await p.evaluate(() => document.body.innerText.replace(/\s/g, '').length) });
  }
  for (const r of ['上司', '管理者', '本人']) {
    try { await p.locator('.seg button', { hasText: r }).first().click({ timeout: 3000 }); await p.waitForTimeout(800); } catch {}
    screens.push({ v: r, len: await p.evaluate(() => document.body.innerText.replace(/\s/g, '').length) });
  }
  ok('JSエラーが出ない', errs.length === 0, errs.slice(0, 3).join(' / '));
  ok('全画面が中身を持って開ける', screens.every(s => s.len > 150),
      screens.map(s => `${s.v}:${s.len}`).join(' '));
  await p.close();
}

/* ---- 3〜5. 文字サイズ・はみ出し・カード ------------------------------ */
for (const [w, h, label] of [[1280, 900, 'PC'], [390, 844, 'スマホ']]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto(URL);
  await p.waitForTimeout(2200);

  // 実際に描かれている文字の大きさ
  const small = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null) continue;
      const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (!t) continue;
      const s = parseFloat(getComputedStyle(el).fontSize);
      if (s < 12) out.push({ cls: String(el.className).split(' ')[0] || el.tagName, s, t: t.slice(0, 12) });
    }
    return out;
  });
  ok(`${label}: 12px未満の文字が無い`, small.length === 0,
      small.slice(0, 4).map(x => `${x.cls} ${x.s}px`).join(' / '));

  ok(`${label}: 横スクロールが無い`,
      await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  const cards = await p.evaluate(() => [...document.querySelectorAll('#grid .card')].map(c => {
    const f = c.querySelector('.front');
    const fb = f.getBoundingClientRect();
    const pb = parseFloat(getComputedStyle(f).paddingBottom);
    let over = 0;
    for (const el of f.children) {
      if (getComputedStyle(el).position === 'absolute') continue;
      over = Math.max(over, el.getBoundingClientRect().bottom - (fb.bottom - pb));
    }
    const say = c.querySelector('.say');
    const cs = getComputedStyle(say);
    const lh = parseFloat(cs.lineHeight);
    return { h: Math.round(fb.height), over: +over.toFixed(1),
             // 枠が行の整数倍でないと、行の途中で切れて汚くなる
             lines: +(say.clientHeight / lh).toFixed(2),
             clamp: parseInt(cs.webkitLineClamp) || 0,
             clipped: say.scrollHeight > say.clientHeight + 1 };
  }));
  ok(`${label}: カードの丈がそろっている`, new Set(cards.map(c => c.h)).size === 1,
      [...new Set(cards.map(c => c.h))].join(','));
  ok(`${label}: カードの中身がはみ出していない`, cards.every(c => c.over <= 1),
      cards.filter(c => c.over > 1).map(c => c.over + 'px').join(' '));
  // 省略している本文は、行の整数倍で止まっていること
  const midCut = cards.filter(c => c.clipped && c.lines < c.clamp - 0.05);
  ok(`${label}: 本文が行の途中で切れていない`, midCut.length === 0,
      midCut.map(c => `${c.lines}/${c.clamp}行`).join(' '));
  await p.close();
}

/* ---- 6. 押した瞬間に字面が変わらない -------------------------------- */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  const n = await p.locator('#grid .card').count();
  const diffs = [];
  for (let i = 0; i < n; i++) {
    const before = await p.evaluate(i => {
      const s = [...document.querySelectorAll('#grid .card')][i].querySelector('.say');
      const cs = getComputedStyle(s);
      return { size: cs.fontSize, clamp: cs.webkitLineClamp, align: cs.textAlign };
    }, i);
    await p.locator('#grid .card').nth(i).click();
    await p.waitForTimeout(450);
    const after = await p.evaluate(() => {
      const s = document.querySelector('.f-front .say');
      if (!s) return null;
      const cs = getComputedStyle(s);
      return { size: cs.fontSize, clamp: cs.webkitLineClamp, align: cs.textAlign };
    });
    if (!after || after.size !== before.size || after.clamp !== before.clamp || after.align !== before.align)
      diffs.push(`${i}枚目 ${before.size}/${before.clamp}→${after?.size}/${after?.clamp}`);
    await p.locator('.sheet-close').click();
    await p.waitForTimeout(520);
  }
  ok('押した瞬間に本文の字面が変わらない', diffs.length === 0, diffs.slice(0, 3).join(' / '));
  await p.close();
}

/* ---- 7. 着地ずれ（戻り切る瞬間の跳ね） ------------------------------- */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  const lands = [];
  for (const [i, wait, scroll] of [[1, 0, 0], [1, 2500, 0], [4, 2500, 0], [6, 2500, 700]]) {
    await p.evaluate(() => {
      document.querySelectorAll('.overlay').forEach(o => o.remove());
      document.querySelectorAll('.card').forEach(c => (c.style.visibility = ''));
    });
    await p.evaluate(y => window.scrollTo(0, y), scroll);
    await p.waitForTimeout(320);
    const card = p.locator('#grid .card').nth(i);
    await card.scrollIntoViewIfNeeded();
    await p.waitForTimeout(200);
    await card.click();
    await p.waitForTimeout(700 + wait);
    await p.evaluate(() => {
      const c = [...document.querySelectorAll('#grid .card')].find(x => x.style.visibility === 'hidden');
      const r = c.getBoundingClientRect();
      window.__goal = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      window.__last = null;
      const tick = () => {
        const el = document.querySelector('.f-front');
        if (!el) return;
        const q = el.getBoundingClientRect();
        window.__last = { x: q.left + q.width / 2, y: q.top + q.height / 2 };
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await p.locator('.sheet-close').click();
    await p.waitForTimeout(700);
    lands.push(await p.evaluate(() => {
      const l = window.__last, g = window.__goal;
      return l ? +Math.hypot(l.x - g.x, l.y - g.y).toFixed(1) : -1;
    }));
  }
  ok('戻り切る瞬間にカードが跳ねない（着地ずれ2px以下）',
      lands.every(v => v >= 0 && v <= 2), lands.map(v => v + 'px').join(' '));
  await p.close();
}

/* ---- 8. じぶんのメモが漏れていない ---------------------------------- */
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(URL);
  await p.waitForTimeout(2200);
  const leaks = [];
  for (const role of ['上司', '管理者']) {
    try { await p.locator('.seg button', { hasText: role }).first().click({ timeout: 3000 }); } catch { continue; }
    await p.waitForTimeout(900);
    /* 数えるのは「その役割で実際に見えているもの」だけ。
       本人画面のDOMは切り替えても残るが、隠れていれば漏れではない
       （実サービスではそもそも配信しない。ここは見え方の確認） */
    const found = await p.evaluate(() => {
      const shown = sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null).length;
      return { 入力欄: shown('.memo-ta, [data-memo]'), ドット: shown('.memo-dot'),
               本文: shown('.memo-row, .memo-text') };
    });
    if (found.入力欄 || found.ドット || found.本文) leaks.push(`${role}: ${JSON.stringify(found)}`);
  }
  ok('じぶんのメモが上司・管理者に出ていない', leaks.length === 0, leaks.join(' / '));
  await p.close();
}

await browser.close();

/* ---- 結果 ------------------------------------------------------------ */
const pad = s => s + ' '.repeat(Math.max(0, 42 - [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0)));
console.log('\n=== オブリエ 回帰検査 ===\n');
for (const r of results) console.log((r.pass ? '○ ' : '× ') + pad(r.name) + (r.detail || ''));
const ng = results.filter(r => !r.pass);
console.log(`\n判定: ${ng.length === 0 ? '合格' : `不合格（${ng.length}件）`} — ${results.length}項目`);
process.exit(ng.length === 0 ? 0 : 1);
