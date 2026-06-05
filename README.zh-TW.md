# MarkLingo

[English](./README.md) | [简体中文](./README.zh-CN.md) | 繁體中文 | [日本語](./README.ja.md)

用 AI 翻譯 Markdown，同時不破壞 Markdown。

MarkLingo 會將目前已儲存的 Markdown 檔案翻譯成一份副本，同時保留那些不應被更動的部分：標題、清單、表格、程式碼、行內程式碼、HTML、frontmatter 語法、連結與圖片路徑。它專為希望在 VS Code 中快速產生多語系 Markdown 草稿的寫作者、維護者與文件團隊打造。

翻譯預設透過 [OpenRouter](https://openrouter.ai) 完成，也可以使用你設定的、受信任的 OpenAI-compatible 端點。你提供自己的 API 金鑰，自己選擇模型，用多少付多少。

MarkLingo 本身不收取任何費用，並且完全開源透明：所有原始碼都公開在 [GitHub](https://github.com/zzgosh/marklingo) 上。你只需依所選模型直接向 OpenRouter 或你選擇的模型服務支付用量費用。

![從命令選擇區執行 MarkLingo](https://raw.githubusercontent.com/zzgosh/marklingo/v0.0.1/resources/Screen-Recording-2026-06-02-new-720p-12fps.gif)

## 為什麼選擇 MarkLingo

- 可從命令選擇區、編輯器右鍵選單或資源管理器右鍵選單翻譯已儲存的 Markdown 文件。
- 保持原始檔案不變，並在其旁邊寫出一個翻譯後的 `*_<language>_mdt.md` 檔案。
- 翻譯完成後開啟翻譯後的 Markdown 分頁及其 Markdown 預覽。
- 當未更動的 Markdown 區塊再次被翻譯時，重複使用先前的翻譯。
- 翻譯選定的、面向人類閱讀的 YAML frontmatter 值（例如 `title` 與 `description`），同時保留欄位名稱與機器可讀的值。
- 在專屬的設定頁面中設定提供方、模型、API 金鑰、目標語言與自訂指令。
- 使用完全開源透明、擴充功能本身免費的工具；所有原始碼都公開在 [GitHub](https://github.com/zzgosh/marklingo) 上。
- 將 API 金鑰儲存在 VS Code 的 `SecretStorage` 中；不會存入工作區檔案或擴充功能中繼資料。

## 安裝

在 VS Code 的擴充功能檢視畫面中安裝 **MarkLingo**（搜尋 `MarkLingo`），或從 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo) 安裝。

對於使用 Open VSX 的 VS Code 相容編輯器，可從 [Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo) 安裝 MarkLingo。

也可以從 [releases 頁面](https://github.com/zzgosh/marklingo/releases) 安裝打包好的 `.vsix`。

## 快速開始

首先，取得一個 OpenRouter API 金鑰：在 [openrouter.ai/keys](https://openrouter.ai/keys) 登入並建立一個金鑰。費用由 OpenRouter 依請求計費，實際金額取決於你選擇的模型。

1. 執行 `MarkLingo: Open Settings`。
2. 保持 Provider 為 `OpenRouter`，貼上 API key，選擇 Model ID，然後點擊 `Save and Verify`。
3. 開啟一個已儲存的 Markdown 檔案。
4. 從命令選擇區執行 `MarkLingo: Translate Current Markdown`。
5. 選擇目標語言。

預設快捷鍵：

- macOS：`Option + Command + T`
- Windows/Linux：`Control + Alt + T`

你也可以直接從 `MarkLingo: Translate Current Markdown` 開始。首次執行時，MarkLingo 會詢問目標語言和 Provider。選擇 `OpenRouter` 可繼續在命令流程中輸入；選擇 `OpenAI Compatible` / `Open MarkLingo Settings` 可進入設定頁完成自訂 endpoint 設定。

也可以在 Markdown 編輯器上按右鍵執行 `MarkLingo: Translate Current Markdown`。在資源管理器中的 Markdown 檔案上按右鍵執行 `MarkLingo: Translate This Markdown File`。在資源管理器中的資料夾上按右鍵執行 `MarkLingo: Translate All Markdown in This Folder`，可翻譯該資料夾及其子資料夾中的 `.md` 與 `.markdown` 檔案，並略過已產生的 `*_mdt.md` 輸出。也可以在資源管理器中多選 Markdown 檔案或資料夾，再執行 `MarkLingo: Translate Selected Markdown Files` 作為一批翻譯。

## 命令

| 命令 | 功能 |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | 翻譯目前已儲存的 Markdown 檔案，並盡可能重複使用快取的區塊翻譯。 |
| `MarkLingo: Retranslate Current Markdown` | 強制對目前的 Markdown 檔案進行一次完整重新翻譯。 |
| `MarkLingo: Translate This Markdown File` | 翻譯從資源管理器右鍵選單中選取的 Markdown 檔案。 |
| `MarkLingo: Translate Selected Markdown Files` | 將資源管理器中選取的檔案和資料夾收集到的 Markdown 檔案作為一批翻譯，開啟第一個翻譯輸出，其餘輸出寫在各自來源檔案旁邊。 |
| `MarkLingo: Translate All Markdown in This Folder` | 翻譯所選資料夾及其子資料夾中的來源 Markdown 檔案，開啟第一個翻譯輸出，其餘輸出寫在各自來源檔案旁邊。 |
| `MarkLingo: Open Settings` | 開啟 MarkLingo 設定，管理提供方驗證、API 金鑰、目標語言、自訂指令、快捷鍵狀態與清理操作。 |
| `MarkLingo: Add Translated Files to .git/info/exclude` | 將 `*_mdt.md` 加入目前儲存庫的本機 Git 排除檔案中。 |
| `MarkLingo: Delete Current Project Translated Files` | 刪除本專案中由擴充功能追蹤的翻譯輸出，同時保留私有翻譯中繼資料/快取。 |

## 設定

大多數使用者需要的設定，可透過 `MarkLingo: Open Settings` 存取。

- **Provider（提供方）**
  - 設定項：`marklingo.openrouter.provider`
  - 預設值：`openrouter`
  - `OpenRouter` 使用官方 OpenRouter 端點並隱藏 Base URL。`OpenAI Compatible` 會顯示 Base URL，用於 llama.cpp server 等自訂端點。
  - 設定頁面會分別記住 OpenRouter 與 OpenAI Compatible 的欄位。切換下拉選單會載入該 Provider 已儲存的草稿；點擊 `Save and Verify` 後才會啟用所選 Provider。

- **Base URL（基礎 URL）**
  - 設定項：`marklingo.providers.openaiCompatible.baseUrl`
  - 預設值：空
  - 僅在 Provider 為 `OpenAI Compatible` 時使用。自訂端點必須使用 HTTPS，localhost 偵錯除外。

- **API Key（API 金鑰）**
  - 儲存：VS Code `SecretStorage`
  - 預設值：無
  - 輸入所選 Provider 的 API 金鑰。金鑰會依 endpoint origin 分開儲存，不會寫入 VS Code 設定或工作區檔案。

- **Model ID（模型 ID）**
  - 設定項：`marklingo.providers.openrouter.modelId`、`marklingo.providers.openaiCompatible.modelId`
  - 預設值：OpenRouter 為 `google/gemini-3.1-flash-lite`；OpenAI Compatible 為空
  - 使用 OpenRouter 模型 ID，或 OpenAI-compatible 端點暴露的模型 alias。

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

設定頁面透過 `Save and Verify` 儲存 Provider 憑證。其他下拉選單會立即儲存；Provider 之外的自由文字欄位使用各自的行內 `Save` 按鈕。

### 使用 llama.cpp 本機執行 Hy-MT

MarkLingo 可以使用本機 OpenAI-compatible 的 `llama-server` 端點執行 Hy-MT 模型：

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

使用這些設定：

- Provider：`OpenAI Compatible`
- Base URL：`http://127.0.0.1:8080/v1`
- API Key：`local-hy-secret`
- Model ID：`hy-mt2`
- 然後點擊 `Save and Verify`。Hy-MT 預計會使用更小的 Markdown 批次來保持可靠性。

對於 Hy-MT2 模型 ID，MarkLingo 會在小批次請求路徑中使用內部維護的模型專屬 structured-data prompt。其他走這一路徑的模型會繼續使用通用、克制的 prompt，除非 MarkLingo 為該模型維護了專屬 prompt profile。

本機吞吐量主要取決於模型、量化方式與硬體。MarkLingo 不會替你下載、啟動或調校 llama.cpp；那會變成單獨的本機 runtime 管理器，需要處理模型下載、二進位安裝、連接埠分配、行程生命週期與硬體探測。用戶端並行只有在 `llama-server` 有匹配的 `--parallel` slot 時才有幫助；如果 server 只有一個 slot，額外的用戶端請求通常只是排隊，不會讓翻譯更快。普通設定頁會隱藏模型批次調參項，並使用保守預設值：`translationModelMaxBlocksPerRequest: 12`、`translationModelConcurrency: 1`、`translationModelMaxOutputTokens: 0`（依 context 自動估算輸出預算）。用於診斷的 settings.json 進階覆寫仍然保留。

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

MarkLingo 是一個本機 VS Code 擴充功能，但翻譯需要將文件內容傳送到 OpenRouter，或在你選擇對應 Provider 時傳送到受信任的 OpenAI-compatible 自訂端點。

- Markdown 內容會被傳送到設定的端點進行翻譯。
- 預設使用官方的 OpenRouter 端點。
- 你需要所選 Provider 接受的 API 金鑰或 token。
- 翻譯請求為非串流。MarkLingo 會使用 `Save and Verify` 選出的已驗證請求路徑；需要小批次 fallback 的模型不會收到 Custom Instructions。對於標準請求路徑，MarkLingo 會在提供方支援時請求從回應中排除模型推理內容。
- API 金鑰依 endpoint origin 分開儲存在 VS Code 的 `SecretStorage` 中。
- API 金鑰不會存入工作區檔案、VS Code 設定、翻譯中繼資料或記錄檔。
- 翻譯中繼資料儲存在 VS Code 的 `globalStorageUri` 下，而非工作區中。
- 不包含任何遙測 SDK。

變更 Provider 或 Base URL 會改變後續翻譯請求把 Markdown 內容傳送到哪裡。請僅使用你信任的端點。

## 清理

使用 `MarkLingo: Open Settings` 及其中的危險區域來清除已儲存的資料。

`Clear All Data` 可以刪除：

- 已儲存的 API 金鑰
- MarkLingo 使用者設定
- 全域翻譯中繼資料/快取
- （可選）已追蹤的翻譯工作區輸出

`Clear Current Project Data` 可以刪除目前顯示專案目錄下的：

- 已追蹤的專案翻譯輸出
- 專案翻譯中繼資料/快取

當你只想清理目前專案中由擴充功能追蹤的翻譯檔案時，使用 `MarkLingo: Delete Current Project Translated Files`。這個專案範圍的命令會刻意刪除已追蹤的輸出，即使它們在產生後被編輯過。

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
