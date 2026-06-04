# MarkLingo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | 日本語

AI で Markdown を翻訳します。Markdown を壊さずに。

MarkLingo は、現在保存されている Markdown ファイルを翻訳済みのコピーに変換します。その際、変更すべきでない部分はそのまま保持します。見出し、リスト、表、コード、インラインコード、HTML、frontmatter 構文、リンク、画像パスなどです。VS Code 内で多言語の Markdown ドラフトをすばやく作成したいライター、メンテナー、ドキュメントチームのために作られています。

翻訳はご自身の API キーを使って [OpenRouter](https://openrouter.ai) 経由で実行されます。モデルはご自身で選択でき、使った分だけお支払いいただきます。

MarkLingo 自体は無料で利用でき、完全にオープンソースで透明です。すべてのソースコードは [GitHub](https://github.com/zzgosh/marklingo) で公開されています。お支払いは、選択したモデルに応じた OpenRouter/モデルサービスの利用料金のみです。

![コマンドパレットから MarkLingo を実行](https://raw.githubusercontent.com/zzgosh/marklingo/v0.0.1/resources/Screen-Recording-2026-06-02-new-720p-12fps.gif)

## MarkLingo の特長

- コマンドパレット、エディターのコンテキストメニュー、またはエクスプローラーのコンテキストメニューから、保存済みの Markdown ドキュメントを翻訳します。
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

1. `MarkLingo: Open Settings` を実行します。
2. Provider を `OpenRouter` のままにし、API key を貼り付け、Model ID を選択して `Save and Verify` をクリックします。
3. 保存済みの Markdown ファイルを開きます。
4. コマンドパレットから `MarkLingo: Translate Current Markdown` を実行します。
5. ターゲット言語を選択します。

デフォルトのショートカット：

- macOS：`Option + Command + T`
- Windows/Linux：`Control + Alt + T`

翻訳の前に `MarkLingo: Open Settings` を実行して、API キー、ターゲット言語、モデル、カスタム指示を保存しておくこともできます。

Markdown エディターを右クリックして `MarkLingo: Translate Current Markdown` を実行することもできます。エクスプローラー内の Markdown ファイルを右クリックすると `MarkLingo: Translate This Markdown File` を実行できます。エクスプローラー内のフォルダーを右クリックして `MarkLingo: Translate All Markdown in This Folder` を実行すると、そのフォルダーとサブフォルダー内の `.md` および `.markdown` ファイルを翻訳し、生成済みの `*_mdt.md` 出力はスキップします。エクスプローラーで複数の Markdown ファイルやフォルダーを選択し、`MarkLingo: Translate Selected Markdown Files` で 1 つのバッチとして翻訳することもできます。

## コマンド

| コマンド | 機能 |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | 現在保存されている Markdown ファイルを翻訳します。可能な場合はキャッシュされたブロック翻訳を再利用します。 |
| `MarkLingo: Retranslate Current Markdown` | 現在の Markdown ファイルの完全な再翻訳を強制します。 |
| `MarkLingo: Translate This Markdown File` | エクスプローラーのコンテキストメニューで選択した Markdown ファイルを翻訳します。 |
| `MarkLingo: Translate Selected Markdown Files` | エクスプローラーで選択したファイルやフォルダーから集めた Markdown ファイルを 1 つのバッチとして翻訳し、最初の翻訳出力を開いて、残りは各ソースの隣に書き出します。 |
| `MarkLingo: Translate All Markdown in This Folder` | 選択したフォルダーとサブフォルダー内のソース Markdown ファイルを翻訳し、最初の翻訳出力を開いて、残りは各ソースの隣に書き出します。 |
| `MarkLingo: Open Settings` | プロバイダー検証、API キー、ターゲット言語、カスタム指示、ショートカットの状態、クリーンアップのための MarkLingo 設定を開きます。 |
| `MarkLingo: Add Translated Files to .git/info/exclude` | `*_mdt.md` を現在のリポジトリのローカル Git 除外ファイルに追加します。 |
| `MarkLingo: Delete Current Project Translated Files` | このプロジェクトの拡張機能が追跡する翻訳出力を削除し、プライベートな翻訳メタデータ/キャッシュは保持します。 |

## 設定

ほとんどのユーザーに必要な設定は、`MarkLingo: Open Settings` から利用できます。

- **Provider（プロバイダー）**
  - 設定：`marklingo.openrouter.provider`
  - デフォルト：`openrouter`
  - `OpenRouter` は公式 OpenRouter エンドポイントを使用し、Base URL を非表示にします。`OpenAI Compatible` は llama.cpp server などのカスタムエンドポイント向けに Base URL を表示します。

- **Base URL（ベース URL）**
  - 設定：`marklingo.openrouter.baseUrl`
  - デフォルト：`https://openrouter.ai/api/v1`
  - Provider が `OpenAI Compatible` の場合のみ使用されます。カスタムエンドポイントは、localhost でのデバッグを除き、HTTPS を使用する必要があります。

- **API Key（API キー）**
  - 保存先：VS Code `SecretStorage`
  - デフォルト：なし
  - 選択した Provider の API キーを入力します。キーは endpoint origin ごとに分けて保存され、VS Code の設定やワークスペースのファイルには保存されません。

- **Model ID（モデル ID）**
  - 設定：`marklingo.openrouter.modelId`
  - デフォルト：`google/gemini-3.1-flash-lite`
  - OpenRouter のモデル ID、または OpenAI-compatible エンドポイントが公開するモデル alias を使用します。

- **Save and Verify（保存して検証）**
  - 軽量な検証リクエストが成功した場合のみ、Provider、API Key、Model ID を保存します。
  - 検証では接続性と、モデルが小さな chat-style JSON タスクに従えるかを確認します。
  - 検証を通過したモデルは `Chat JSON` を使用します。エンドポイントに到達でき、内容は返すものの JSON タスクに従えないモデルは `Translation Model` としてキャッシュされます。

- **Advanced Request Mode（詳細リクエストモード）**
  - 設定：`marklingo.translation.requestMode`
  - デフォルト：`auto`
  - 通常は `Save and Verify` によって管理されます。`auto` は検証済みの capability キャッシュを優先し、キャッシュがない場合は `Chat JSON` に戻ります。
  - 診断向けの詳細 settings.json 設定は引き続き利用できます：`marklingo.translation.translationModelMaxBlocksPerRequest`、`marklingo.translation.translationModelConcurrency`、`marklingo.translation.translationModelMaxOutputTokens`。

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
  - Chat JSON モデルでは、MarkLingo に内蔵された Markdown 保護プロンプトの後に追加されます。Translation Model として検証されたアダプターには送信されません。

設定ページでは、Provider の認証情報は `Save and Verify` で保存されます。その他のドロップダウンは即座に保存され、Provider 以外の自由入力フィールドにはそれぞれインライン `Save` ボタンがあります。

### llama.cpp でローカル Hy-MT を使う

MarkLingo は、ローカルの OpenAI-compatible な `llama-server` エンドポイントで Hy-MT モデルを使用できます。

```sh
llama-server \
  -hf tencent/Hy-MT2-1.8B-GGUF:Q4_K_M \
  --host 127.0.0.1 \
  --port 8080 \
  --alias hy-mt2 \
  --parallel 2 \
  --ctx-size 8192 \
  --api-key local-hy-secret
```

以下の設定を使用します。

- Provider：`OpenAI Compatible`
- Base URL：`http://127.0.0.1:8080/v1`
- API Key：`local-hy-secret`
- Model ID：`hy-mt2`
- その後 `Save and Verify` をクリックします。Hy-MT は `Translation Model` として検証されるはずです。

ローカルのスループットは主に、モデル、量子化方式、ハードウェアに依存します。MarkLingo は llama.cpp のダウンロード、起動、調整は行いません。それを行うには、モデルのダウンロード、バイナリのセットアップ、ポート割り当て、プロセスのライフサイクル、ハードウェア検出を扱う別のローカル runtime 管理機能が必要になります。クライアント側の並行実行は、`llama-server` に対応する `--parallel` slot がある場合にのみ有効です。server が 1 slot の場合、追加のクライアントリクエストは通常キューに入るだけで、翻訳は速くなりません。通常の設定 UI ではモデルのバッチ調整項目を隠し、保守的なデフォルト値を使います：`translationModelMaxBlocksPerRequest: 12`、`translationModelConcurrency: 1`、`translationModelMaxOutputTokens: 0`（context から出力予算を自動推定）。診断用の settings.json 詳細上書きは残しています。

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

MarkLingo はローカルの VS Code 拡張機能ですが、翻訳にはドキュメントの内容を OpenRouter に送信する必要があります。該当する Provider を選択した場合は、信頼できる OpenAI-compatible カスタムエンドポイントに送信されます。

- Markdown の内容は、翻訳のために設定されたエンドポイントに送信されます。
- デフォルトでは公式の OpenRouter エンドポイントが使用されます。
- 選択した Provider が受け付ける API キーまたは token が必要です。
- 翻訳リクエストは非ストリーミングです。Chat JSON モードでは `reasoning.exclude: true` と `reasoning.effort: none` により推論の除外を要求し、Translation Model モードでは reasoning フィールドを省略し、Custom Instructions を無視します。
- API キーは endpoint origin ごとに分けて VS Code の `SecretStorage` に保存されます。
- API キーは、ワークスペースのファイル、VS Code の設定、翻訳メタデータ、ログには保存されません。
- 翻訳メタデータは、ワークスペースではなく VS Code の `globalStorageUri` の下に保存されます。
- テレメトリ SDK は含まれていません。

Provider または Base URL を変更すると、以降の翻訳リクエストが Markdown 内容を送信する先が変わります。信頼できるエンドポイントのみを使用してください。

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

`npm run dev:vscode` は、現在の作業ツリーを手動でスモークテストするために使います。拡張機能をビルドしてから、`--extensionDevelopmentPath` を使って別の VS Code ウィンドウを開き、システムの一時ディレクトリ内にある `marklingo-dev-user` という隔離ユーザーデータディレクトリと、`marklingo-dev-extensions` という隔離拡張機能ディレクトリを使用します。通常の VS Code プロファイルやインストール済みの Marketplace 版には影響しません。拡張機能は VSIX としてインストールされるのではなく開発パスから読み込まれるため、隔離された Extensions ビューに `Installed 0` と表示される場合がありますが、これは想定どおりです。Command Palette で `MarkLingo: Open Settings` を実行するか、`Developer: Show Running Extensions` を使って、開発版拡張機能が読み込まれていることを確認してください。実際の翻訳リクエストをテストする場合は、その隔離ウィンドウ内で API キーを再設定してください。固定ディレクトリを使いたい場合は、`MARKLINGO_DEV_USER_DATA_DIR` または `MARKLINGO_DEV_EXTENSIONS_DIR` で上書きできます。

ローカルの VSIX をパッケージ化するには：

```sh
npm run vsix
```

MarkLingo はネイティブ ESM TypeScript で書かれています。ソースは `src/` にあり、コンパイル出力は `out/` に置かれ、公開される拡張機能のエントリポイントはバンドルされた `dist/extension.js` です。
