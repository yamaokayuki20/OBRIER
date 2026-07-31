# UI/UX 参照基準と遊び心の事例集

UI/UX改善サイクル（イシュー #6）のために調べた外部基準と事例。判断の根拠として残す。
**このファイルは参照資料であり、決定ではない。** 実際に採用したものは `decision-log.md` に記録する。

---

## 第1部 日本の一流BtoB SaaS の基準

出典：SmartHR Design System / freee アクセシビリティー・ガイドライン / マネーフォワード / デジタル庁デザインシステム（DADS）

### 1. 余白（スペーシング）

| ルール | 出典 |
|---|---|
| 余白はプリミティブ層（ベース値）→セマンティック層（役割）の2層トークンで持つ | [SmartHR 余白](https://smarthr.design/products/design-tokens/spacing/) |
| 4px / 8px の倍数で刻む。12px・14px・18px のような半端な値を氾濫させない | 業界通例（xs:4 / sm:8 / md:16 / lg:24 / xl:32） |
| 要素間・グループ間・セクション間で余白の大小に意味の階層をつける | [SmartHR 余白の取り方](https://smarthr.design/products/design-patterns/spacing-layout-pattern/) |

### 2. 色とコントラスト

| ルール | 出典 |
|---|---|
| **本文・アイコンは背景に対し 4.5:1 以上**。大きな文字は 3:1 以上 | [SmartHR コントラスト比](https://smarthr.design/accessibility/check-list/contrast/) |
| 「大きな文字」の閾値は、**和文では欧文より厳しく 22pt / 太字18pt**（同じptでも小さく見えるため） | [freee テキスト](https://a11y-guidelines.freee.co.jp/categories/text.html) |
| **フォーカスインジケータは背景・隣接色に対し 3:1 以上** | [DADS カラー（アクセシビリティ）](https://design.digital.go.jp/dads/foundations/color/accessibility/) |
| エラー色は「操作前の強い警告」に限定して使う（濫用しない） | [SmartHR 色](https://smarthr.design/products/design-tokens/color/) |
| 色は役割ベースのセマンティックトークンとして名前を持たせる | [SmartHR 色](https://smarthr.design/products/design-tokens/color/)／[DADS カラー](https://design.digital.go.jp/dads/foundations/color/) |

### 3. ボタンの階層

| ルール | 出典 |
|---|---|
| **Primary は1画面に最大1個**。「目立たせたいから」でPrimaryにしない | [SmartHR Button](https://smarthr.design/products/components/button/) |
| Primary と Secondary を横並びにするとき、**Primary は読み進行方向の末尾（右）** | 同上 |
| 破壊的操作は Danger。確認ダイアログの確定ボタンは右・具体的な動詞ラベル | [SmartHR 削除ダイアログ](https://smarthr.design/products/design-patterns/delete-dialog/) |
| **色だけに頼らず**、塗り／アウトラインなど色以外の視覚差も持たせる（色覚多様性配慮） | [DADS ボタン（アクセシビリティ）](https://design.digital.go.jp/dads/components/button/accessibility/) |
| **ターゲット領域は 44 CSS px 以上**。小サイズでも上下余白で44pxを確保 | [DADS ボタン](https://design.digital.go.jp/dads/components/button/) |
| モバイル44×44px以上、**デスクトップは最低24×24px**（44px推奨） | [freee ターゲット・サイズ](https://a11y-guidelines.freee.co.jp/explanations/target-size.html) |

### 4. フォーム

| ルール | 出典 |
|---|---|
| 入力要素1つにラベル・ヘルプ／エラー・必須有無を紐付ける。見た目のラベルと読み上げ名を一致させる | [SmartHR FormControl](https://smarthr.design/products/components/form-control/) |
| エラーは `aria-describedby` で入力欄と関連付け、`aria-invalid` で状態を示す | [SmartHR エラーの特定](https://smarthr.design/accessibility/check-list/error/) |
| エラー文は **事象・原因・対処** の3要素。書ききれないときは 原因＞対処＞事象 の順で圧縮 | [SmartHR エラーメッセージ](https://smarthr.design/products/contents/error-messages/overview/) |
| **「※任意」も明示する**（日本の官公庁・SaaS の流儀） | [DADS 日付ピッカー](https://design.digital.go.jp/dads/components/date-picker/usage/) |

### 5. テーブル

| ルール | 出典 |
|---|---|
| ソート可能列は **昇順（上矢印）／降順（下矢印）／未ソート** をアイコンで明示 | [DADS テーブル](https://design.digital.go.jp/dads/components/table/usage/) |
| 値がない項目は空欄にせず **「—」＋無効化色** | [SmartHR 値がない項目](https://smarthr.design/products/design-patterns/empty-data/) |
| 行高は Default / Dense の2パターンを持たせてよい | [DADS テーブル](https://design.digital.go.jp/dads/components/table/changelog/) |

### 6. 空状態・読込中・フィードバック

| ルール | 出典 |
|---|---|
| 空状態は **状態の説明＋次の一手** をセットで出す | [Carbon Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/) |
| **1秒未満の待ちにローダーを出さない**（ちらつき防止）。アイコンと背景は3:1以上 | [SmartHR Loader](https://smarthr.design/products/components/loader/) |
| 構造が既知のもの（カード・表）はスケルトン、確定処理はスピナー | 実務通例 |
| 通知は Success / Error / Warning に加え、中立の **Information** を持つ | [DADS ノティフィケーションバナー](https://design.digital.go.jp/dads/components/notification-banner/) |
| 破壊的操作はモーダルで範囲を制限。**疑問形で確認を促し、取り消し不可を明記**、対象を画面上に明示 | [SmartHR ActionDialog](https://smarthr.design/products/components/dialog/action-dialog/) |

### 7. キーボード操作

| ルール | 出典 |
|---|---|
| Tab / Shift+Tab で **すべてのリンク・ボタン・フォーム部品にフォーカスが移る**。移動順は視覚順序と一致させる | [freee キーボード操作](https://a11y-guidelines.freee.co.jp/checks/examples/keyboard.html) |
| マウス／タッチ限定の機能を作らない | [freee 入力ディバイス](https://a11y-guidelines.freee.co.jp/categories/input_device.html) |

### 8. 文言（マイクロコピー）

| ルール | 出典 |
|---|---|
| **ボタンラベルは動詞の終止形**（「取り込む」「取り消す」）。サ変名詞は「する」を省いて名詞のみ（「追加」「削除」） | [SmartHR ライティング](https://smarthr.design/products/contents/writing-style/) |
| **画面タイトル・項目名は名詞**（動詞のボタンと明確に区別する） | 同上 |
| 動詞の前にオブジェクトを置くときの助詞は「を」（「権限を追加」） | 同上 |
| 冗長表現（「〜することができる」）を避ける。責める主語を使わない | [SmartHR エラーメッセージ](https://smarthr.design/products/contents/error-messages/overview/) |

---

## 第2部 遊び心の事例（良質なBtoCから）

**採否の物差し**：「気づいた人だけがニヤッとする」「毎日見ても飽きない」。
派手・うるさい・自己主張の強いものは採らない。

### 採用を推奨するもの

| 案 | 何が起きるか | 難易度 | このペルソナに効く理由 | 参照元 |
|---|---|---|---|---|
| **節目の静かな帯** | 節目で画面上部から淡いタグ色の帯が2〜3秒だけ降り、事実だけを述べて消える。紙吹雪・音・ポップアップは無し | 低 | 褒められることに身構えやすい人でも、「静かな事実の提示」なら受け取れる | [紙吹雪の使いすぎ批判](https://uxdesign.cc/the-over-confetti-ing-of-digital-experiences-af523745db19) |
| **「1年前の今日」への静かな導線** | 同じ日付に届いた感謝がある日**だけ**、1行のリンクが控えめに現れる。自動で開かない。無い日は何も出さない | 低 | 積み重ねに気づきにくい人へ、自分から選び取れる形で気づきを渡す | [Google フォト 思い出](https://support.google.com/photos/answer/9454489?hl=ja) |
| **タグの「はじめて」の印** | あるタグが初めて付いたときだけ、そのタグに小さな印。カタチ画面に「このタグは去年の6月からです」の1行 | 中 | 「自分にはこういう得意があったのか」という発見（狙い②）を、数値でなく物語で渡す | [あつ森 博物館](https://nookipedia.com/wiki/Museum)／[Pokémon GO 図鑑](https://niantic.helpshift.com/hc/ja/6-pokemon-go/faq/5041-what-is-the-stamp-rally/) |
| **チェックが自分で描かれる確認演出** | 送信・保存でボタンがチェックに変わり、線が0.3秒で描かれてから文字がフェードイン | 低 | 誤検出報告のような気まずい操作こそ、小さな温かみが安心になる | 紙吹雪批判記事の代替案 |
| **段階的に立ち上がる表示** | 拡大詳細や節目の帯で、要素が下から順に少しずつ現れる（staggered reveal） | 低 | ストリーク機構は使わないが、**演出技法だけ**は転用できる | [Duolingo](https://60fps.design/shots/duolingo-30-day-streak-animation) |
| **年間アルバムの表紙に最初と最後の1枚** | PDFの表紙に、その年最初と最後の感謝を日付だけ添えて静かに並べる。集計値もランキングも出さない | 中 | 点在するデータを誇張なしで物語に変える。狙い①に直結 | [Spotify Wrapped](https://engineering.atspotify.com/2024/01/exploring-the-animation-landscape-of-2023-wrapped)／[Strava Year in Sport](https://www.itsnicethat.com/articles/manual-strava-year-in-sport-graphic-design-150321) |
| **「無かった日」を強調しない** | 推移チャートで、データがない日を空白として際立たせず、他の日と同じ淡さのまま置く | 低 | 自己肯定感が低い人ほど「ない日」で落ち込む。可視化に評価の意味を持たせない | [GitHub 草グラフ再評価](https://techquestershub.hashnode.dev/the-github-chronicles-your-contribution-graph-tells-a-story-but-not-the-one-you-think) |

### 思想面の裏付け

- **ほぼ日手帳**：クリーム色の紙に薄墨、3.7mm方眼、装飾を削ぎ落とす。「毎日見ても飽きない」ための引き算。オブリエの方眼台紙はこの思想と同じ（[出典](https://www.1101.com/store/techo/ja/2023/all_about/5year/about05.html)）
- **note.com**：「シンプルであり続ける」規律。**遊び心を足す前に、まず削る**（[出典](https://note.com/623px/n/nb468ad085509)）

### 却下したもの（理由つき）

| 却下案 | 理由 |
|---|---|
| フルスクリーンの紙吹雪・花火 | 使い古されており、静かなトーンと根本的に不一致 |
| ストリーク（連続日数）の可視化・炎アイコン | 「途切れさせたくない」圧を生む。**催促表現の禁止**に直接抵触 |
| 達成バッジ・メダルの収集画面 | 3D質感は**奥行きはアバターのみ**に反する。バッジ収集は暗黙の順位付けに近く**非ランキング**とも相性が悪い |
| 効果音 | オフィス利用を考えると事故のもと。静かなトーンの対極 |
| カードの3Dチルト・光沢 | CLAUDE.md で明示的に禁止 |
| SNSシェア機能・シェア画像の自動生成 | 感謝は社内の私的な記録。外部共有は不要というより危険 |
| 「あと◯枚で節目」のカウントダウン | 空白を埋めさせる誘導。感謝を*集めさせる*行為に転じ、狙い①から逸れる |
| 未取得項目のシルエット表示 | 「まだ足りない」を強調し、このペルソナには逆効果 |
| スタンプカードの空白理論 | 同上。オブリエは集めさせるものではなく、届いたものを見返すもの |
| 台紙の季節ごとの色変化 | 悪くはないが、変化量を誤ると「デザインが変わった」と混乱を招く。**要ユーザー確認**として保留 |
