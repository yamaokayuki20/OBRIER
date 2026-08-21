/**
 * 本人・上司・管理者を、それぞれ別のURLで配れるように3つのファイルへ書き出す。
 *
 * 中身の正は prototype/obrier-prototype-v5.html の1本だけ。
 * ここでは ROLE_LOCK の行を1行だけ差し替えた写しを作る。
 * 直すときは必ず v5 を直して、これを走らせ直すこと。
 *
 * 使い方: node tools/build-roles.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SRC = new URL('../prototype/obrier-prototype-v5.html', import.meta.url);
const OUT = new URL('../prototype/dist/', import.meta.url);
const MARK = 'const ROLE_LOCK = "";   /* BUILD:ROLE_LOCK */';
/* 見出し（<title>）も分けておく。artifact の一覧やブラウザのタブで
   3つが同じ名前だと、どれがどれだか見分けられなくなる */
const ROLES = {
  person: { label: '本人', title: 'オブリエ アルバム' },
  boss: { label: '上司', title: 'オブリエ チームダッシュボード' },
  admin: { label: '管理者', title: 'オブリエ 管理者設定' },
};

const src = await readFile(SRC, 'utf8');
if (!src.includes(MARK)) throw new Error(`目印が見つからない: ${MARK}`);

await mkdir(OUT, { recursive: true });
/* 入口のページ。3つのURLを並べて選ばせる。
   公開するときは、ここが最初に開かれる */
const INDEX = (logo) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>オブリエ プロトタイプ</title>
<meta name="description" content="感謝可視化サービス「オブリエ」のプロトタイプ。本人・上司・管理者の3つの画面を見られます。">
<meta name="robots" content="noindex">
<style>
  :root { --navy: #09153d; --line: #dfe4ed; --soft: #5c6884; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 56px 20px 80px; min-height: 100vh;
    font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
    color: var(--navy); background: #fff;
    background-image: linear-gradient(#eaf0f8 1px, transparent 1px), linear-gradient(90deg, #eaf0f8 1px, transparent 1px);
    background-size: 40px 40px;
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  .logo { height: 44px; width: auto; display: block; }
  h1 { font-size: 15px; font-weight: 700; letter-spacing: .14em; color: var(--soft); margin: 34px 0 8px; }
  .lead { font-size: 21px; font-weight: 700; line-height: 1.7; margin: 0 0 6px; }
  .note { font-size: 14px; line-height: 1.9; color: var(--soft); margin: 0 0 30px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  a.card {
    display: flex; align-items: center; gap: 16px; text-decoration: none; color: inherit;
    background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px;
    transition: border-color .18s, box-shadow .18s, transform .18s;
  }
  a.card:hover { border-color: #b9c4d8; box-shadow: 0 10px 26px rgba(20,26,40,.10); transform: translateY(-2px); }
  a.card:focus-visible { outline: 2px solid var(--navy); outline-offset: 3px; }
  .ico { width: 44px; height: 44px; border-radius: 12px; background: #f2f5fa; display: grid; place-items: center; flex: none; }
  .t { font-size: 19px; font-weight: 700; }
  .d { font-size: 14px; color: var(--soft); line-height: 1.7; margin-top: 3px; }
  .arw { margin-left: auto; color: var(--soft); }
  footer { margin-top: 40px; font-size: 13px; line-height: 1.9; color: var(--soft); }
</style>
</head>
<body>
<div class="wrap">
  <img class="logo" src="${logo}" alt="オブリエ">
  <h1>プロトタイプ</h1>
  <p class="lead">見たい画面を選んでください</p>
  <p class="note">Slack・Teams で交わされた「ありがとう」を自動で集めて可視化するサービスの試作です。出てくる人物・数値・本文はすべて架空のものです。</p>
  <ul>
    <li><a class="card" href="./obrier-person.html">
      <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#09153d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.6" cy="9.6" r="1.5"/><path d="M3.4 16.6l4.4-4a2 2 0 0 1 2.7 0l3.1 2.9m0 0l2-1.8a2 2 0 0 1 2.7 0l2.3 2.1"/></svg></span>
      <span><span class="t">本人</span><span class="d">届いたありがとうのアルバムと、そこから見える得意</span></span>
      <span class="arw" aria-hidden="true">→</span></a></li>
    <li><a class="card" href="./obrier-boss.html">
      <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#09153d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V4.5M4 19.5h16"/><path d="M8 16.5v-4M12.6 16.5V8M17.2 16.5v-6"/></svg></span>
      <span><span class="t">上司</span><span class="d">チーム全体のようすと、メンバーごとの詳細</span></span>
      <span class="arw" aria-hidden="true">→</span></a></li>
    <li><a class="card" href="./obrier-admin.html">
      <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#09153d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M4.6 12H2M22 12h-2.6M6.5 6.5L4.7 4.7M19.3 19.3l-1.8-1.8M17.5 6.5l1.8-1.8M4.7 19.3l1.8-1.8"/></svg></span>
      <span><span class="t">管理者</span><span class="d">連携設定・チーム管理・監査ログ・検出品質</span></span>
      <span class="arw" aria-hidden="true">→</span></a></li>
  </ul>
  <footer>本人の画面は、開くと新着カードの束から始まります。<br>Alt + Shift + N でもう一度出せます。</footer>
</div>
</body>
</html>`;

for (const [role, { label, title }] of Object.entries(ROLES)) {
  const out = src
    .replace(MARK, `const ROLE_LOCK = ${JSON.stringify(role)};   /* BUILD:ROLE_LOCK */`)
    .replace(/<title>[^<]*<\/title>/,
      `<!-- 生成物：直さないこと。正は prototype/obrier-prototype-v5.html -->\n<title>${title}</title>`);
  const name = `obrier-${role}.html`;
  await writeFile(new URL(name, OUT), out);
  console.log(`${label}\t${title}\t${name}`);
}

/* 入口のページ。ロゴは v5 に埋めてある data URI をそのまま抜いて使う
   （公開するときに外のファイルを読ませない、という制約は入口も同じ） */
{
  const m = src.match(/<img class="brand-logo" src="(data:image\/svg\+xml;base64,[^"]+)"/);
  if (!m) throw new Error('ロゴの data URI が見つからない');
  await writeFile(new URL('index.html', OUT), INDEX(m[1]));
  console.log('入口\tオブリエ プロトタイプ\tindex.html');
}
