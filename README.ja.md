# MarkLingo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | 日本語

AI で Markdown を翻訳します。Markdown を壊さずに。

MarkLingo は、保存済みの Markdown を多言語ドラフトに翻訳し、元のファイルは変更しません。VS Code 内で多言語の Markdown ドラフトをすばやく作成したいライター、メンテナー、ドキュメントチームのために作られています。

- Markdown 構造を保持します：見出し、リスト、表、コード、インラインコード、HTML、frontmatter 構文、リンク、画像パス。
- 組み込み Provider presets として [OpenRouter](https://openrouter.ai)、OpenAI、DeepSeek、Moonshot、GLM、Xiaomi MiMo を選択できます。信頼できる Custom OpenAI Compatible エンドポイントも利用できます。
- ソースの隣に翻訳済みの `*_<language>_mdt.md` ファイルを書き出し、翻訳タブとプレビューを開き、変更されていない Markdown ブロックのキャッシュ翻訳を再利用します。
- 無料でオープンソースの拡張機能です。API キーは VS Code `SecretStorage` に保存され、テレメトリ SDK は含まれていません。

![コマンドパレットから MarkLingo を実行](https://raw.githubusercontent.com/zzgosh/marklingo/v0.0.3/resources/Screen-Recording-2026-06-02-new-720p-12fps.gif)

## インストール

VS Code の拡張機能ビューから **MarkLingo** をインストールするか（`MarkLingo` で検索）、[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo) からインストールしてください。

Open VSX を使用する VS Code 互換エディターでは、[Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo) から MarkLingo をインストールできます。

[releases ページ](https://github.com/zzgosh/marklingo/releases) からパッケージ済みの `.vsix` をインストールすることもできます。

## クイックスタート

最短のセットアップは OpenRouter を使う方法です。[openrouter.ai/keys](https://openrouter.ai/keys) でサインインし、API キーを作成してください。料金は、選択したモデルに応じて OpenRouter からリクエストごとに請求されます。別の組み込み Provider を使う場合は、まず `MarkLingo: Open Settings` を実行し、Provider から選択してください。

1. `MarkLingo: Open Settings` を実行します。
2. 最短セットアップでは Provider を `OpenRouter` のままにします。別の Provider は Settings で選択できます。API key を貼り付け、Model ID を選択して `Save and Verify` をクリックします。
3. 保存済みの Markdown ファイルを開きます。
4. コマンドパレットから `MarkLingo: Translate Current Markdown` を実行します。
5. ターゲット言語を選択します。

デフォルトのショートカット：

- macOS：`Option + Command + T`
- Windows/Linux：`Control + Alt + T`

`MarkLingo: Translate Current Markdown` から直接始めることもできます。初回実行時、MarkLingo はターゲット言語と Provider を尋ねます。`OpenRouter` を選ぶと素早く設定できます。`Custom OpenAI Compatible` を選ぶとカスタム endpoint を設定できます。MarkLingo Settings を開いて任意の Provider preset を設定することもできます。

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

### 組み込み Provider モデル

固定 Provider presets は、選択済みのモデル候補だけを表示します。OpenRouter と Custom OpenAI Compatible では Model ID を直接入力することもできます。

| Provider | Model options |
| --- | --- |
| OpenRouter | デフォルトは `google/gemini-3.1-flash-lite`。Model ID を直接入力できます |
| OpenAI | `gpt-5.2` |
| DeepSeek | `deepseek-v4-flash`、`deepseek-v4-pro` |
| Moonshot | `kimi-k2.6`、`kimi-k2.5` |
| GLM | `glm-5.1`、`glm-5`、`glm-4.7` |
| Xiaomi MiMo | `mimo-v2.5-pro`、`mimo-v2.5` |
| Custom OpenAI Compatible | エンドポイントが公開するモデル alias。Model ID を直接入力できます |

- **Provider（プロバイダー）**
  - 設定：`marklingo.openrouter.provider`
  - デフォルト：`openrouter`
  - Presets には `OpenRouter`、`OpenAI`、`DeepSeek`、`Moonshot`、`GLM`、`Xiaomi MiMo`、`Custom OpenAI Compatible` が含まれます。
  - `Custom OpenAI Compatible` は llama.cpp server、Ollama、LM Studio などのローカルまたはカスタムエンドポイント向けです。
  - 設定ページは各 Provider の Model ID を記憶し、API key は endpoint origin ごとに分けて保存します。ドロップダウンを切り替えるとその Provider の保存済みドラフトを読み込み、`Save and Verify` をクリックすると選択した Provider が有効になります。

- **Base URL（ベース URL）**
  - 設定：`marklingo.providers.openaiCompatible.baseUrl`
  - デフォルト：空
  - Provider が `Custom OpenAI Compatible` の場合のみ表示されます。
  - カスタムエンドポイントは、llama.cpp server、Ollama、LM Studio などの localhost デバッグエンドポイントを除き、HTTPS を使用する必要があります。
  - 固定 preset は内部で公式エンドポイントを使用します。`Moonshot` と `GLM` は検証時に対応する Global/China エンドポイントをプローブし、動作したエンドポイントを後続リクエストに使用します。

- **API Key（API キー）**
  - 保存先：VS Code `SecretStorage`
  - デフォルト：なし
  - 選択した Provider の API キーを入力します。キーは endpoint origin ごとに分けて保存され、VS Code の設定やワークスペースのファイルには保存されません。

- **Model ID（モデル ID）**
  - OpenRouter と Custom OpenAI Compatible では Model ID を直接入力できます。
  - その他の Provider presets では、選択済みの Model ID オプションのみを提供します。

- **Save and Verify（保存して検証）**
  - 軽量な検証リクエストが成功した場合のみ、Provider、API Key、Model ID を保存します。
  - 検証では接続性を確認し、選択したモデルに最も安全なリクエスト形式を選びます。
  - 選択した Provider、Base URL、Model ID、保存済み API Key が変わっておらず、capability 結果がすでにキャッシュされている場合、MarkLingo はモデル capability を再度プローブせず、短い接続チェックだけを行います。
  - 利用可能なモデルの中には、信頼性のために小さな Markdown バッチが必要なものがあります。その場合、Settings に小さな情報チップが表示され、大きなファイルでは少し遅くなることがあります。

- **Advanced Request Mode（詳細リクエストモード）**
  - 設定：`marklingo.translation.requestMode`
  - デフォルト：`auto`
  - 通常は `Save and Verify` によって管理されます。`auto` は検証済みのリクエストパスを優先し、検証結果がない場合は標準の structured-output リクエストパスを使います。
  - 小さなバッチのリクエストパス向けの診断用 settings.json 詳細設定は引き続き利用できます：`marklingo.translation.translationModelMaxBlocksPerRequest`、`marklingo.translation.translationModelConcurrency`、`marklingo.translation.translationModelMaxOutputTokens`。

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
  - 選択したモデルが対応している場合、用語、トーン、スタイルの追加指示として MarkLingo に内蔵された Markdown 保護プロンプトの後に追加されます。小さなバッチの fallback が必要なモデルには送信されず、このフィールドも非表示になります。

設定ページでは、Provider の認証情報は `Save and Verify` で保存されます。その他のドロップダウンは即座に保存され、Provider 以外の自由入力フィールドにはそれぞれインライン `Save` ボタンがあります。

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

MarkLingo はローカルの VS Code 拡張機能ですが、翻訳にはドキュメントの内容を Settings で選択した Provider に送信する必要があります。たとえば OpenRouter、OpenAI、DeepSeek、Moonshot、GLM、Xiaomi MiMo、または信頼できる Custom OpenAI Compatible エンドポイントです。

- Markdown の内容は、翻訳のために選択した Provider endpoint に送信されます。
- OpenRouter は推奨のクイックスタート Provider で、その他の Provider presets は Settings で選択できます。
- 選択した Provider が受け付ける API キーまたは token が必要です。
- 翻訳リクエストは非ストリーミングです。MarkLingo は `Save and Verify` が選んだ検証済みのリクエストパスを使用します。小さなバッチの fallback が必要なモデルには Custom Instructions は送信されません。標準のリクエストパスでは、プロバイダーが対応している場合、MarkLingo はレスポンスからモデルの推論内容を除外するようリクエストします。
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
