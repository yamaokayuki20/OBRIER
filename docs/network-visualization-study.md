# 双方向のやり取りをどう見せるか — 表現技法の調査と選定

作成: 2026-08-01 ／ 対象: 上司ダッシュボード（S06）全体サマリの「だれから だれへ」

## 0. きっかけ

実物を見たユーザーの言葉。

> 矢印で表現するのやめましょう。太さも変えません。矢印がぐにゃぐにゃ曲がってスパゲッティみたいです。気持ち悪い。
> ドットがピピピット移動するようなアニメーションとかで表現したい。アニメーションは特定の個人をクリックしたらアニメーションが出てくる感じで。
> ちなみにこういう双方向のやり取りの量を可視化する時って、一般的にどういう表現技法が使われる？グラフデータベースとかそういう文脈とかでどういう扱い方をしているのかが気になる。そういう事例を調査して、最適な表現技法を選定してそれを採用して可視化して欲しいです。私がいったことは全部無視しても構いません。それが優先される。

「調査の結論を優先してよい」とされているので、**まず調べ、そのうえで採否を決めた**。結論から言うと、ユーザーの直感（矢印をやめる・太さを変えない・押したら点が流れる）は**調査の結果とほぼ一致していた**。ただし、それだけでは足りない部分があったので、そこに1つ足している。

---

## 1. いま何が起きていたのか

rev.20 の図は **6人・有向26本**。6人の有向グラフが持てる辺の上限は 30 本なので、**密度87%**。ほぼ全員が全員とやり取りしている。

この状態で、1本ごとに

- 太さを変える（1.1〜7.3px）
- 濃さを変える（不透明度 0.18〜0.80）
- 向きを弧の反りと終端の三角形で示す
- 双方向の組み合わせには2本引く

をやっていた。**1本の線に4つの意味を載せ、それを26本重ねた**。ユーザーが「スパゲッティ」と呼んだのは正確な描写で、これは設計の失敗である。

そして、これは**既知の失敗パターン**だった。

> For basic readability tasks such as finding an actor or determining if two actors are linked, **node-link diagrams perform badly for dense graphs even with few nodes** (e.g., 20).
> — Ghoniem, Fekete, Castagliola (2005)

ノードリンク図が破綻するのは「ノードが多いとき」ではなく「**密なとき**」。6人でも密度87%なら破綻する。人数が少ないから大丈夫だろう、という私の見立てが間違っていた。

---

## 2. 調べた技法と、その評価

### 2-1. コード図（chord diagram）

円周に人を並べ、リボンで結ぶ。国家間の貿易など、双方向で量の非対称な流れの教科書的な題材で使われる。

**採らない。** CHI 2023 の比較実験で Sankey に完敗している。

> Participants took substantially longer to answer questions with Chord diagrams and made more errors; participants also rated Chord as requiring more effort, and strongly preferred Sankey diagrams.
> 51人中 43人が Sankey のほうが正確だと感じ、42人が Sankey を選んだ。

リボンが重なると追えなくなる、という失敗の仕方が**いまのスパゲッティとまったく同じ**。見た目が変わるだけで、問題は解けない。

### 2-2. サンキー図（Sankey diagram）

上の実験で勝ったほう。左に送り手、右に受け手を並べて帯で結ぶ。

**採らない。** 送り手と受け手を左右に分ける形なので、**同じ人が画面に2回出る**。部署間・工程間の流れなら自然だが、7人のチームで「森さんが左右に1人ずついる」のは直感に反するし、「誰が孤立しているか」が読み取れない（左右どちらの列を見ればいいのか決まらない）。**流れを見る道具であって、関係を見る道具ではない。**

### 2-3. 隣接行列（adjacency matrix / who-to-whom マトリクス）

行＝送った人、列＝受け取った人。交点の濃さが通数。

**採る。主表現にする。** 理由は4つ。

1. **線を引かないので、絡まりようがない。** 密度がいくら上がっても読みやすさが落ちない。ハーバー（hairball）問題の標準的な解答がこれ
2. **向きが表現に内在している。** 矢印も弧も要らない。行と列の役割が決まっているだけで「誰から誰へ」が確定する
3. **非対称が対角線をまたいだ比較で見える。** 「森→佐藤は多いのに、佐藤→森は少ない」という一方通行の関係が、2つのマスを見比べるだけで分かる。これは矢印つきノードリンクでいちばん読み取りにくかったこと
4. **孤立が帯として見える。** 1人ぶんの行と列がまるごと薄いと、十字の白い帯になる。「誰かが孤立していないか」という上司の問いに、いちばん素直に答える形

そして実装上も大きい ——**本物の `<table>` として書けるので、読み上げとキーボードが何もしなくても効く。** ノードリンク図では `aria-label` を手で組み立てて補うしかなかった部分が、構造そのもので満たされる。

弱点は「冷たく見える」こと（設計原則1の「無機質な管理画面にしない」）。ここは配色と余白で受け止める。数字を裸で並べず、濃淡の面として見せる。

### 2-4. ノードリンク図（node-link diagram）

**採る。ただし副表現に降ろし、載せる意味を減らす。**

Ghoniem らの実験で、行列がほぼ全勝するなかで**ノードリンクが唯一勝ち続けたタスクがある**。

> **Only path finding is consistently in favor of node-link diagrams** throughout the evaluation.

つまり「AとBはつながっているか」「この人は輪の中にいるか、外れているか」という**形の読み取り**は、行列より図のほうが速い。逆に「AからBへ何通か」という**値の読み取り**は行列が速い。

だから2つを並べる。**行列が値を、図が形を担当する。** これは coordinated multiple views の定石であり、どちらか一方を捨てる理由がない。

そのうえで、図から**太さ・濃さ・矢印・弧を全部外す**。線は1組につき1本、太さ一定・向きなし・直線。線の仕事は「つながっている」の一言だけにする。

### 2-5. 向きは「動き」で示す

外した向きの情報を、どこで返すか。**押したときの点の流れで返す。**

これは研究的にも裏がある。ベクトル場の実験で、向きの読み取りは

> **Animated streamlets were rated the most effective** representation in both accuracy and reaction time tasks, followed by static equally spaced streamlines, animated orthogonal particles and **lastly the static arrow grid**.

**動く点がいちばん速く正確で、静止した矢印がいちばん遅い。** いま外そうとしているものが最下位で、代わりに入れようとしているものが1位だった。ユーザーの直感が当たっていた。

さらに「常に流すのではなく、押した人のぶんだけ流す」も正しい。組織ネットワーク分析（ONA）の実務ツール（Polinode、Viva Insights など）が共通して採っているのが、**全体は静かに見せ、1人を選んだらその人の関係だけを浮かび上がらせる**やり方（エゴネットワーク表示）で、これがハーバーへの標準的な対処でもある。26本を同時に流したら、スパゲッティが動くだけで悪化する。

---

## 3. 採用する構成

| | 表現 | 答える問い | 根拠 |
|---|---|---|---|
| **主** | **誰から誰への表**（隣接行列・濃淡） | 誰から誰へ、何通か。一方通行になっていないか。孤立していないか | Ghoniem+2005（密なグラフは行列が優位）／向きが構造に内在／`<table>` で読み上げ・キーボードが自然に効く |
| **副** | **つながりの図**（ノードリンク・線は一定） | 誰と誰がつながっているか。輪の中にいるか外れているか | Ghoniem+2005（形の読み取りはノードリンクが唯一優位） |
| 副の上乗せ | **押したら点が流れる**（エゴ表示） | その人のありがとうは、どちらへ向かっているか | 動く点＞静止した矢印（向きの読み取り速度・正確さ）／ONA実務ツールの標準的な作り |

### 図から外したもの

| 外したもの | 理由 |
|---|---|
| 矢じり | 向きは点の流れが担う。静止した矢印は向きの読み取りが最下位 |
| 線の太さ（1.1〜7.3px） | 量は表が担う。1本に意味を載せすぎない |
| 線の濃さ（0.18〜0.80） | 同上 |
| 弧の反り | 「ぐにゃぐにゃ」の原因。向きを示す必要が無くなったので直線でよい |
| 双方向の2本引き | 向きを線で示さなくなったので、1組1本で足りる。**26本 → 15本**に減る |

### 図に残したもの

**玉の大きさ**だけは残す。指摘は線についてのもので、玉の大小はスパゲッティの原因ではない。むしろ「誰が輪の中心にいるか」を形で示す唯一の手段になる。

---

## 4. 決めなかったこと・見送ったもの

| 技法 | 見送りの理由 |
|---|---|
| エッジバンドリング（線束ね） | 束ねると個々のやり取りが追えなくなる。見た目はむしろスパゲッティに近づく |
| BioFabric・ハイブプロット | 数万辺の規模のための技法。6人には過剰で、読み方の学習コストのほうが高くつく |
| コミュニティ検出でまとめる | 6人では意味を持たない。#27 でグループ分けをやめた判断とも合わない |
| 点の流れを常時流す | 26本が同時に動くと、動くスパゲッティになる。押した人のぶんだけにする |

---

## 5. 守る制約

- **設計原則8** — 表・図・インサイトのいずれも、じぶんのメモを集計値としても派生指標としても使わない
- **設計原則6（改訂後）** — 上司ビューなので順位を出してよい。ただし煽らず、事実を静かに並べる
- **`prefers-reduced-motion: reduce`** — 点を流さない。代わりに向きと通数を文字で出す。**動きを止めても向きが読めなくなってはいけない**（表があるので、ここは構造的に満たされる）
- **ホバー限定にしない** — 表のマスも図の玉もキーボードで到達でき、同じ内容が読み上げに出る
- **当たり判定** PC 24px ／ スマホ 44px
- **390px で成立させる** — 6×6 の表は狭い画面でこそ強い（図と違って潰れない）

---

## 6. 出典

- [On the Readability of Graphs Using Node-Link and Matrix-Based Representations: A Controlled Experiment and Statistical Analysis — Ghoniem, Fekete, Castagliola (2005)](https://journals.sagepub.com/doi/10.1057/palgrave.ivs.9500092)
- [Showing Flow: Comparing Usability of Chord and Sankey Diagrams — Gutwin, Mairena, Bandi (CHI 2023)](https://dl.acm.org/doi/10.1145/3544548.3581119)
- [Motion of animated streamlets appears to surpass their graphical alterations in human visual detection of vector field maxima](https://www.tandfonline.com/doi/full/10.1080/15230406.2018.1553113)
- [Grooming the hairball — how to tidy up network visualizations?](https://www.researchgate.net/publication/281050201_Grooming_the_hairball_-_how_to_tidy_up_network_visualizations)
- [Graph visualization: fixing data hairballs — Cambridge Intelligence](https://cambridge-intelligence.com/blog/hairball-effect-in-graph-visualization/)
- [Combing the hairball with BioFabric](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3574047/)
- [Organizational Network Analysis — Polinode](https://www.polinode.com/info/organizational-network-analysis)
- [Uncover network collaboration insights — Microsoft Viva Insights](https://learn.microsoft.com/en-us/viva/insights/advanced/analyst/network-collaboration-insights)
- [Adjacency Matrix — Multivariate Network Visualization (Univ. of Utah VDL)](https://vdl.sci.utah.edu/mvnv/techniques/adj-matrix/)
