# MarkLingo

[English](./README.md) | [简体中文](./README.zh-CN.md) | 繁體中文 | [日本語](./README.ja.md)

MarkLingo 是一款使用 AI 翻譯 Markdown 的 VS Code 開源擴充功能，主要功能包括：

- 翻譯時保留原有 Markdown 結構。
- 內建多種可選的 LLM Provider：OpenRouter、OpenAI、DeepSeek、Moonshot、GLM、Xiaomi MiMo，以及更靈活的 Custom OpenAI Compatible 端點。
- 翻譯完成後，譯文檔案會輸出到來源檔案旁邊，使用 `*_<language>_mdt.md` 命名，並開啟譯文分頁和側邊 Markdown 預覽。
- 採用增量快取方式翻譯，在翻譯新內容的同時避免重複翻譯未變更內容，節省 token。
- 支援從檔案總管右鍵快速翻譯單一檔案、資料夾或多個選取項目。
- 支援快速刪除已產生的翻譯檔案。
- 支援將 `*_mdt.md` 規則加入 `.git/info/exclude`，避免影響本機 Git 工作流程。
- 提供詳細的翻譯用量 Dashboard，可查看已翻譯檔案、成功翻譯任務、provider/model、token 使用量與預估成本。
- API 金鑰安全地儲存在使用者本機的 VS Code `SecretStorage` 中，不包含遙測 SDK。

![從命令選擇區執行 MarkLingo](https://raw.githubusercontent.com/zzgosh/marklingo/v0.1.0/resources/Screen-Recording-2026-07-18-new-720p-12fps.gif)

## 本地化

擴充功能 UI 與面向 Marketplace 的 manifest 字串目前支援英文和簡體中文。打包的 `README.md` 仍是 Visual Studio Marketplace 與 Open VSX 使用的英文長篇說明；倉庫讀者可透過上方語言連結查看簡體中文、繁體中文和日文 README 副本。

## 安裝

- **方式 1：** 從 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo) 安裝；在 VS Code 擴充功能檢視中搜尋 `MarkLingo`，然後點擊安裝。
- **方式 2：** 對於使用 Open VSX 的 VS Code 相容編輯器，可從 [Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo) 安裝 MarkLingo。
- **方式 3：** 從 GitHub [releases 頁面](https://github.com/zzgosh/marklingo/releases) 下載打包好的 `.vsix`。

## 快速開始

1. 安裝擴充功能後，在 VS Code 中使用 `Command/Ctrl + Shift + P` 開啟命令選擇區，然後執行 `MarkLingo: Open Settings`。
2. 選擇 LLM Provider，輸入 API key，選擇模型，再點擊 `Save and Verify` 儲存並驗證。
3. 選擇翻譯輸出的目標語言，預設為簡體中文。
4. 開啟一個已儲存的 Markdown 檔案，從命令選擇區執行 `MarkLingo: Translate Current Markdown`。
5. 等待翻譯完成；翻譯進度會顯示在 VS Code 通知中。
6. 如需查看其他命令，請在命令選擇區輸入 `MarkLingo:`。

### 快捷鍵翻譯

| 命令 | macOS | Windows/Linux |
| --- | --- | --- |
| `MarkLingo: Translate Current Markdown` | `Option + Command + T` | `Control + Alt + T` |
| `MarkLingo: Delete Current Project Translated Files` | `Option + Command + D` | `Control + Alt + D` |

> 注意：如果 MarkLingo 在 macOS 上無法使用 `Option + Command + D`，該快捷鍵可能已被 Dock 佔用。可前往「系統設定 > 鍵盤 > 鍵盤快捷鍵... > Dock > 開啟或關閉 Dock 隱藏」進行變更，或在 MarkLingo Settings 中點擊 `Edit`，為該命令指派其他 VS Code 快捷鍵。

### 右鍵翻譯

除了命令選擇區和快捷鍵外，MarkLingo 也支援從檔案總管右鍵選單翻譯。

1. 在 VS Code 檔案總管中對 Markdown 檔案按右鍵，執行 `MarkLingo: Translate This Markdown File`。
2. 對資料夾按右鍵，執行 `MarkLingo: Translate All Markdown in This Folder`，即可翻譯該資料夾及其子資料夾中的 `.md` 與 `.markdown` 檔案，並略過已產生的 `*_mdt.md` 譯文輸出。
3. 多選 Markdown 檔案或資料夾，按右鍵並執行 `MarkLingo: Translate Selected Markdown Files`，即可作為一個批次進行翻譯。

## 命令

| 命令 | 功能 |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | 翻譯目前已儲存的 Markdown 檔案，並盡可能重複使用快取的區塊翻譯。 |
| `MarkLingo: Retranslate Current Markdown` | 強制對目前的 Markdown 檔案進行一次完整重新翻譯。 |
| `MarkLingo: Translate This Markdown File` | 翻譯從資源管理器右鍵選單中選取的 Markdown 檔案。 |
| `MarkLingo: Translate Selected Markdown Files` | 將資源管理器中選取的檔案和資料夾收集到的 Markdown 檔案作為一批翻譯，開啟第一個翻譯輸出，其餘輸出寫在各自來源檔案旁邊。 |
| `MarkLingo: Translate All Markdown in This Folder` | 翻譯所選資料夾及其子資料夾中的來源 Markdown 檔案，開啟第一個翻譯輸出，其餘輸出寫在各自來源檔案旁邊。 |
| `MarkLingo: Open Settings` | 開啟 MarkLingo 設定，管理提供方驗證、API 金鑰、目標語言、自訂指令、快捷鍵狀態、Usage Insights 與清理操作。 |
| `MarkLingo: Add Translated Files to .git/info/exclude` | 將 `*_mdt.md` 排除規則加入目前儲存庫的本機 `.git/info/exclude`。 |
| `MarkLingo: Delete Current Project Translated Files` | 刪除本專案中由擴充功能追蹤的翻譯輸出，同時保留私有翻譯中繼資料/快取。 |

> 注意：變更 Provider 或 Model ID 並點擊 `Save and Verify` 後，如果希望用新驗證的 provider/model 從頭重新翻譯既有檔案，請使用 `MarkLingo: Retranslate Current Markdown`。`MarkLingo: Translate Current Markdown` 是增量翻譯：它可能會重複使用上一個 provider/model 產生的快取區塊翻譯，只把已變更或新增的區塊傳送給目前的 provider/model。

## 設定

大多數使用者需要的設定，可透過 `MarkLingo: Open Settings` 存取。

### 內建 Provider 模型

固定 Provider presets 只提供預設的模型選項。OpenRouter 和 Custom OpenAI Compatible 也支援直接輸入其他 Model ID。

| Provider | Model options |
| --- | --- |
| OpenRouter | 預設模型，並支援直接輸入 Model ID |
| OpenAI | 預設模型：`gpt-5.4-mini`、`gpt-5.4-nano`、`gpt-5.4`、`gpt-5.5` |
| DeepSeek | 預設模型：`deepseek-v4-flash`、`deepseek-v4-pro` |
| Moonshot | 預設模型：`kimi-k2.6`、`kimi-k2.5` |
| GLM | 預設模型：`glm-4.7`、`glm-5`、`glm-5.1` |
| Xiaomi MiMo | 預設模型：`mimo-v2.5`、`mimo-v2.5-pro` |
| Custom OpenAI Compatible | 直接輸入 Model ID |

- **Provider（提供方）**
  - 設定項：`marklingo.openrouter.provider`
  - 預設值：`openrouter`
  - Presets 包括 `OpenRouter`、`OpenAI`、`DeepSeek`、`Moonshot`、`GLM`、`Xiaomi MiMo` 和 `Custom OpenAI Compatible`。
  - `Custom OpenAI Compatible` 用於 llama.cpp server、Ollama、LM Studio 等本機或自訂端點。
  - 設定頁面會記住每個 Provider 的 Model ID，並依 endpoint origin 分開儲存 API key。切換下拉選單會載入該 Provider 已儲存的草稿；點擊 `Save and Verify` 後才會啟用所選 Provider。

- **Base URL（基礎 URL）**
  - 設定項：`marklingo.providers.openaiCompatible.baseUrl`
  - 預設值：空
  - 僅在 Provider 為 `Custom OpenAI Compatible` 時顯示。
  - 自訂端點必須使用 HTTPS，localhost 偵錯端點（例如 llama.cpp server、Ollama 或 LM Studio）除外。
  - 固定 preset 會在內部使用官方端點。`Moonshot` 和 `GLM` 會在驗證時探測支援的全球/中國端點，並保留可用端點用於後續請求。

- **API Key（API 金鑰）**
  - 儲存：VS Code `SecretStorage`
  - 預設值：無
  - 輸入所選 Provider 的 API 金鑰。金鑰會依 endpoint origin 分開儲存，不會寫入 VS Code 設定或工作區檔案。

- **Model ID（模型 ID）**
  - OpenRouter 和 Custom OpenAI Compatible 支援直接輸入 Model ID。
  - 其他 Provider presets 只提供精選 Model ID 選項。

- **Save and Verify（儲存並驗證）**
  - 只有輕量驗證請求成功後，才會儲存 Provider、API Key 與 Model ID。
  - 驗證會檢查連線能力，並為所選模型選擇最穩妥的請求方式。
  - 如果所選 Provider、Base URL、Model ID 與已儲存的 API Key 都沒有變更，且已經有能力驗證快取，MarkLingo 只會重新做一次短連線檢查，不會再次探測模型能力。
  - 有些可用模型需要更小的 Markdown 批次才能保持輸出可靠。遇到這種情況時，Settings 會顯示一個小提示，大型檔案可能會慢一點。

- **Advanced Request Mode（進階請求模式）**
  - 設定項：`marklingo.translation.requestMode`
  - 預設值：`auto`
  - 通常由 `Save and Verify` 管理。`auto` 會優先使用已驗證的請求路徑；沒有驗證結果時使用標準 structured-output 請求路徑。
  - 面向小批次請求路徑的診斷用進階 settings.json 設定仍然可用：`marklingo.translation.translationModelMaxBlocksPerRequest`、`marklingo.translation.translationModelConcurrency` 與 `marklingo.translation.translationModelMaxOutputTokens`。

- **Target Language（目標語言）**
  - 設定項：`marklingo.translation.targetLanguage`
  - 預設值：`简体中文`
  - 內建選項包括 `简体中文`、`繁体中文`、`English`、`日本語`、`한국어`、`Français`、`Español`、`Deutsch` 與 `Custom...`。

- **Custom Language（自訂語言）**
  - 設定項：`marklingo.translation.targetLanguageCustom`
  - 預設值：空
  - 當目標語言為 `Custom...` 時使用。

- **Custom Instructions（自訂指令）**
  - 設定項：`marklingo.translation.customPrompt`
  - 預設值：空
  - 當所選模型支援時，附加在 MarkLingo 內建的 Markdown 保護提示之後，用於補充術語、語氣或風格要求。需要小批次 fallback 的模型不會收到這些自訂指令，欄位也會隱藏。

> 注意：設定頁面透過 `Save and Verify` 儲存 Provider 憑證。其他下拉選單會立即儲存；Provider 之外的自由文字欄位使用各自的行內 `Save` 按鈕。

### Usage Insights

Settings 中包含一個本機 Usage 區塊，用來查看翻譯歷史。它會顯示已翻譯檔案、成功翻譯任務、provider/model 分組、最近執行記錄、token 使用量，以及可用時的 USD 預估成本。成功的純快取 rerun 只會用既有翻譯重建輸出，不會呼叫 provider，因此不會計入 Usage runs。

OpenRouter 成本來自 provider 回報的本次請求成本；內建 direct provider 使用 provider 回報的 input/output tokens 和隨擴充功能附帶的 Vercel AI Gateway 價格快照。自訂與本機 OpenAI-compatible 端點可能顯示 `Cost unavailable`。如果沒有 reported usage，MarkLingo 會退回到本次實際送出請求的 input token 估算值。

## 輸出檔案

MarkLingo 始終保持來源 Markdown 檔案不變。

翻譯輸出會寫在來源檔案旁邊：

```text
README.md
README_zh-CN_mdt.md
```

自訂目標語言會盡可能使用從語言名稱衍生的安全後綴，必要時使用穩定的 `custom-<hash>` 後綴。

再次執行翻譯時，會根據目前的來源 Markdown 與 MarkLingo 的私有中繼資料/快取重新產生翻譯檔案。直接在翻譯輸出中所做的手動修改不會被合併或保留，因此如果你需要保留這些修改，請先複製或重新命名翻譯檔案。

## 隱私與資料

MarkLingo 是一個本機 VS Code 擴充功能，但翻譯需要將文件內容傳送到 Settings 中選定的 Provider，例如 OpenRouter、OpenAI、DeepSeek、Moonshot、GLM、Xiaomi MiMo，或受信任的 Custom OpenAI Compatible 端點。

- Markdown 內容會被傳送到所選 Provider endpoint 進行翻譯。
- OpenRouter 是推薦的快速上手 Provider，其他 Provider presets 可在 Settings 中選擇。
- 你需要所選 Provider 接受的 API 金鑰或 token。
- 翻譯請求為非串流。MarkLingo 會使用 `Save and Verify` 選出的已驗證請求路徑；需要小批次 fallback 的模型不會收到 Custom Instructions。對於標準請求路徑，MarkLingo 會在提供方支援時請求從回應中排除模型推理內容。
- API 金鑰依 endpoint origin 分開儲存在 VS Code 的 `SecretStorage` 中。
- API 金鑰不會存入工作區檔案、VS Code 設定、翻譯中繼資料或記錄檔。
- 翻譯中繼資料儲存在 VS Code 的 `globalStorageUri` 下，而非工作區中。
- Usage Insights 以按月追加的事件檔案形式儲存在同一個 VS Code 私有儲存中。事件只包含 hash、basename、計數、provider/model 標籤、token/cost 摘要、時間戳與狀態；不會儲存 API key、prompt、原始路徑、完整來源 Markdown 或完整翻譯 Markdown。
- 不包含任何遙測 SDK。

變更 Provider 或 Base URL 會改變後續翻譯請求把 Markdown 內容傳送到哪裡。請僅使用你信任的端點。

## 清理

使用 `MarkLingo: Open Settings` 及其中的危險區域來清除已儲存的資料。

`Clear All Data` 可以刪除：

- 已儲存的 API 金鑰
- MarkLingo 使用者設定
- 全域翻譯中繼資料/快取，包括 Usage Insights 事件
- （可選）已追蹤的翻譯工作區輸出

`Clear Current Project Data` 可以刪除目前顯示專案目錄下的：

- 已追蹤的專案翻譯輸出
- 專案翻譯中繼資料/快取，包括 Usage Insights 事件

當你只想清理目前專案中由擴充功能追蹤的翻譯檔案時，使用 `MarkLingo: Delete Current Project Translated Files` 或其快捷鍵。MarkLingo 會先要求確認，並刻意刪除已追蹤的輸出，即使它們在產生後被編輯過；其他專案的翻譯檔案不會受到影響。

## 開發

```sh
npm install
npm run compile
npm test
npm run test:vscode
npm run dev:vscode
npm run package:dry
```

`npm test` 會執行快速的 Node 單元測試。`npm run test:vscode` 會啟動一個隔離的 VS Code 擴充功能宿主，帶有臨時工作區、本機模擬 OpenRouter 端點與一個偽造的 SecretStorage API 金鑰。它不會使用你已安裝的 VSIX 設定或真實的 OpenRouter 金鑰。

使用 `npm run dev:vscode` 對目前工作樹進行手動冒煙測試。它會建置擴充功能，然後透過 `--extensionDevelopmentPath` 開啟一個獨立的 VS Code 視窗，並在系統臨時目錄中使用名為 `marklingo-dev-user` 的隔離使用者資料目錄、名為 `marklingo-dev-extensions` 的隔離擴充功能目錄。這不會影響你的常規 VS Code 設定或已安裝的 Marketplace 版本。由於擴充功能是從開發路徑載入，而不是以 VSIX 形式安裝，隔離視窗的 Extensions 檢視仍可能顯示 `Installed 0`；這是預期現象。可在 Command Palette 中執行 `MarkLingo: Open Settings`，或使用 `Developer: Show Running Extensions` 來確認開發擴充功能已載入。測試真實翻譯請求時，需要在這個隔離視窗中重新設定 API 金鑰。可透過 `MARKLINGO_DEV_USER_DATA_DIR` 或 `MARKLINGO_DEV_EXTENSIONS_DIR` 指定固定目錄。

打包一個本機 VSIX：

```sh
npm run vsix
```

MarkLingo 以原生 ESM TypeScript 撰寫。原始碼位於 `src/`，編譯輸出到 `out/`，發佈的擴充功能進入點是打包後的 `dist/extension.js`。
