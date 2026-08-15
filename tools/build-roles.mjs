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
for (const [role, { label, title }] of Object.entries(ROLES)) {
  const out = src
    .replace(MARK, `const ROLE_LOCK = ${JSON.stringify(role)};   /* BUILD:ROLE_LOCK */`)
    .replace(/<title>[^<]*<\/title>/,
      `<!-- 生成物：直さないこと。正は prototype/obrier-prototype-v5.html -->\n<title>${title}</title>`);
  const name = `obrier-${role}.html`;
  await writeFile(new URL(name, OUT), out);
  console.log(`${label}\t${title}\t${name}`);
}
