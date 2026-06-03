# MarkLingo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | 日本語

AI で Markdown を翻訳します。Markdown を壊さずに。

MarkLingo は、現在保存されている Markdown ファイルを翻訳済みのコピーに変換します。その際、変更すべきでない部分はそのまま保持します。見出し、リスト、表、コード、インラインコード、HTML、frontmatter 構文、リンク、画像パスなどです。VS Code 内で多言語の Markdown ドラフトをすばやく作成したいライター、メンテナー、ドキュメントチームのために作られています。

翻訳はご自身の API キーを使って [OpenRouter](https://openrouter.ai) 経由で実行されます。モデルはご自身で選択でき、使った分だけお支払いいただきます。

MarkLingo 自体は無料で利用でき、完全にオープンソースで透明です。すべてのソースコードは [GitHub](https://github.com/zzgosh/marklingo) で公開されています。お支払いは、選択したモデルに応じた OpenRouter/モデルサービスの利用料金のみです。

![コマンドパレットから MarkLingo を実行](https://raw.githubusercontent.com/zzgosh/marklingo/v0.0.1/resources/Screen-Recording-2026-06-02-new-720p-12fps.gif)

## MarkLingo の特長

- VS Code から、保存済みの Markdown ドキュメントを 1 つのコマンドで翻訳します。
- 元のファイルはそのまま保持し、その隣に翻訳済みの `*_<language>_mdt.md` ファイルを書き出します。
- 翻訳後、翻訳済みの Markdown タブとその Markdown プレビューを開きます。
- 変更されていない Markdown ブロックが再び翻訳されるとき、以前の翻訳を再利用します。
- フィールド名と機械可読の値は保持しつつ、人間向けに選択された YAML frontmatter の値（`title` や `description` など）を翻訳します。
- 専用の設定ページから、OpenRouter エンドポイント、モデル、API キー、ターゲット言語、カスタム指示を設定できます。
- 拡張機能自体は無料で、透明性のある完全なオープンソースです。ソースコードは [GitHub](https://github.com/zzgosh/marklingo) で公開されています。
- API キーは VS Code の `SecretStorage` に保存します。ワークスペースのファイルや拡張機能のメタデータには保存しません。

## インストール

VS Code の拡張機能ビューから **MarkLingo** をインストールするか（`MarkLingo` で検索）、[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo) からインストールしてください。

Open VSX を使用する VS Code 互換エディターでは、[Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo) から MarkLingo をインストールできます。

[releases ページ](https://github.com/zzgosh/marklingo/releases) からパッケージ済みの `.vsix` をインストールすることもできます。

## クイックスタート

まず、OpenRouter の API キーを取得します。[openrouter.ai/keys](https://openrouter.ai/keys) でサインインし、キーを作成してください。料金は、選択したモデルに応じて OpenRouter からリクエストごとに請求されます。

1. 保存済みの Markdown ファイルを開きます。
2. コマンドパレットから `MarkLingo: Translate Current Markdown` を実行します。
3. ターゲット言語を選択します。
4. プロンプトが表示されたら、OpenRouter の API キーを貼り付けます。キーは VS Code の `SecretStorage` に保存され、ワークスペースのファイルには保存されません。
5. モデル ID を確認するか、Enter キーを押してデフォルト（`google/gemini-3.1-flash-lite`）を使用します。

デフォルトのショートカット：

- macOS：`Option + Command + T`
- Windows/Linux：`Control + Alt + T`

翻訳の前に `MarkLingo: Open Settings` を実行して、API キー、ターゲット言語、モデル、カスタム指示を保存しておくこともできます。

## コマンド

| コマンド | 機能 |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | 現在保存されている Markdown ファイルを翻訳します。可能な場合はキャッシュされたブロック翻訳を再利用します。 |
| `MarkLingo: Retranslate Current Markdown` | 現在の Markdown ファイルの完全な再翻訳を強制します。 |
| `MarkLingo: Open Settings` | OpenRouter、API キー、ターゲット言語、カスタム指示、ショートカットの状態、クリーンアップのための MarkLingo 設定を開きます。 |
| `MarkLingo: Add Translated Files to .git/info/exclude` | `*_mdt.md` を現在のリポジトリのローカル Git 除外ファイルに追加します。 |
| `MarkLingo: Delete Current Project Translated Files` | このプロジェクトの拡張機能が追跡する翻訳出力と、プライベートな翻訳メタデータ/キャッシュを削除します。 |

## 設定

ほとんどのユーザーに必要な設定は、`MarkLingo: Open Settings` から利用できます。

- **Base URL（ベース URL）**
  - 設定：`marklingo.openrouter.baseUrl`
  - デフォルト：`https://openrouter.ai/api/v1`
  - カスタムエンドポイントは、localhost でのデバッグを除き、HTTPS を使用する必要があります。

- **API Key（API キー）**
  - 保存先：VS Code `SecretStorage`
  - デフォルト：なし
  - OpenRouter の API キーを入力します。MarkLingo はこれを VS Code の設定やワークスペースのファイルには保存しません。

- **Model ID（モデル ID）**
  - 設定：`marklingo.openrouter.modelId`
  - デフォルト：`google/gemini-3.1-flash-lite`
  - OpenRouter のモデル ID を使用します。

- **Target Language（ターゲット言語）**
  - 設定：`marklingo.translation.targetLanguage`
  - デフォルト：`简体中文`
  - 内蔵の選択肢には `简体中文`、`繁体中文`、`English`、`日本語`、`한국어`、`Français`、`Español`、`Deutsch`、`Custom...` が含まれます。

- **Custom Language（カスタム言語）**
  - 設定：`marklingo.translation.targetLanguageCustom`
  - デフォルト：空
  - ターゲット言語が `Custom...` のときに使用します。

- **Custom Instructions（カスタム指示）**
  - 設定：`marklingo.translation.customPrompt`
  - デフォルト：空
  - MarkLingo に内蔵された Markdown 保護プロンプトの後に追加される、用語・トーン・スタイルに関する追加の指示です。

設定ページでは、ドロップダウンの変更は即座に保存されます。自由入力フィールドには、それぞれ独自のインライン `Save` ボタンがあります。API キーの操作とデータ消去の操作は、確認後すぐに反映されます。

## 出力ファイル

MarkLingo は、ソースの Markdown ファイルを常に変更しません。

翻訳出力はソースファイルの隣に書き出されます。

```text
README.md
README_zh-CN_mdt.md
```

カスタムのターゲット言語では、可能な場合は言語名から派生した安全なサフィックスを使用し、必要に応じて安定した `custom-<hash>` サフィックスを使用します。

翻訳を再実行すると、現在のソース Markdown と MarkLingo のプライベートなメタデータ/キャッシュから翻訳ファイルが再構築されます。翻訳出力に直接加えた手動の編集は、マージも保持もされません。そのため、それらの編集を残したい場合は、まず翻訳ファイルをコピーするか名前を変更してください。

## プライバシーとデータ

MarkLingo はローカルの VS Code 拡張機能ですが、翻訳にはドキュメントの内容を OpenRouter に送信する必要があります。Base URL を変更した場合は、信頼できる OpenRouter 互換のカスタムエンドポイントに送信されます。

- Markdown の内容は、翻訳のために設定されたエンドポイントに送信されます。
- デフォルトでは公式の OpenRouter エンドポイントが使用されます。
- ご自身の OpenRouter API キーが必要です。
- 翻訳リクエストは非ストリーミングで、`reasoning.exclude: true` と `reasoning.effort: none` により推論の除外を要求します。
- API キーは VS Code の `SecretStorage` に保存されます。
- API キーは、ワークスペースのファイル、VS Code の設定、翻訳メタデータ、ログには保存されません。
- 翻訳メタデータは、ワークスペースではなく VS Code の `globalStorageUri` の下に保存されます。
- テレメトリ SDK は含まれていません。

`marklingo.openrouter.baseUrl` を変更すると、以降の翻訳リクエストが保存済みの API キーを送信する先が変わります。信頼できるエンドポイントのみを使用してください。

## クリーンアップ

保存されたデータを消去するには、`MarkLingo: Open Settings` とその危険ゾーンを使用します。

`Clear All Data` では以下を削除できます。

- 保存された API キー
- MarkLingo のユーザー設定
- グローバル翻訳メタデータ/キャッシュ
- （任意）追跡されている翻訳ワークスペース出力

`Clear Current Project Data` では、表示されているプロジェクトディレクトリについて以下を削除できます。

- 追跡されているプロジェクトの翻訳出力
- プロジェクトの翻訳メタデータ/キャッシュ

現在のプロジェクトで拡張機能が追跡する翻訳ファイルだけを整理したい場合は、`MarkLingo: Delete Current Project Translated Files` を使用します。このプロジェクト単位のコマンドは、生成後に編集されたものであっても、追跡対象の出力を意図的に削除します。

## 開発

```sh
npm install
npm run compile
npm test
npm run test:vscode
npm run dev:vscode
npm run package:dry
```

`npm test` は高速な Node ユニットテストを実行します。`npm run test:vscode` は、一時的なワークスペース、ローカルのモック OpenRouter エンドポイント、偽の SecretStorage API キーを備えた、隔離された VS Code 拡張機能ホストを起動します。インストール済みの VSIX 設定や実際の OpenRouter キーは使用しません。

`npm run dev:vscode` は、現在の作業ツリーを手動でスモークテストするために使います。拡張機能をビルドしてから、`--extensionDevelopmentPath` を使って別の VS Code ウィンドウを開き、隔離されたユーザーデータディレクトリ `/tmp/marklingo-dev-user` と隔離された拡張機能ディレクトリ `/tmp/marklingo-dev-extensions` を使用します。通常の VS Code プロファイルやインストール済みの Marketplace 版には影響しません。拡張機能は VSIX としてインストールされるのではなく開発パスから読み込まれるため、隔離された Extensions ビューに `Installed 0` と表示される場合がありますが、これは想定どおりです。Command Palette で `MarkLingo: Open Settings` を実行するか、`Developer: Show Running Extensions` を使って、開発版拡張機能が読み込まれていることを確認してください。実際の翻訳リクエストをテストする場合は、その隔離ウィンドウ内で API キーを再設定してください。

ローカルの VSIX をパッケージ化するには：

```sh
npm run vsix
```

MarkLingo はネイティブ ESM TypeScript で書かれています。ソースは `src/` にあり、コンパイル出力は `out/` に置かれ、公開される拡張機能のエントリポイントはバンドルされた `dist/extension.js` です。
