# MarkLingo

[English](./README.md) | 简体中文 | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md)

MarkLingo 是一款使用 AI 翻译 Markdown 的 VS Code 开源插件，主要功能有：

- 翻译文件不破坏原有 Markdown 结构。
- 内置多种可选的 LLM Provider：OpenRouter、OpenAI、DeepSeek、Moonshot、GLM、Xiaomi MiMo，以及更灵活的自定义 OpenAI Compatible 端点。
- 翻译完成后，译文文件会输出到源文旁边，使用 `*_<language>_mdt.md` 命名，并打开译文标签页和侧边 Markdown 预览。
- 采用增量缓存方式翻译，既保证新内容有效翻译，又能避免老内容重复翻译，节省 Token。
- 支持在文件目录树的侧边栏右键快捷翻译、批量翻译。
- 支持快速删除已翻译的文件。
- 支持将 `*_mdt.md` 规则加入 `.git/info/exclude`，避免污染 Git 工作流。
- 详细的文件翻译用量 Dashboard，方便查看包括已翻译文件、成功翻译任务、provider/model、token 使用量，以及预估成本。
- API 密钥安全存储在用户本机的 VS Code `SecretStorage` 中，不包含遥测 SDK。

![从命令面板运行 MarkLingo](https://raw.githubusercontent.com/zzgosh/marklingo/v0.1.0/resources/Screen-Recording-2026-07-18-new-720p-12fps.gif)

## 安装

- **方式 1：** 从 [VS Code 官方插件市场](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo) 安装，搜索 `MarkLingo`，点击安装。
- **方式 2：** 对于使用 Open VSX 的 VS Code 兼容编辑器，可从 [Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo) 安装 MarkLingo。
- **方式 3：** 从 GitHub 源代码仓库 [releases 页面](https://github.com/zzgosh/marklingo/releases) 下载 `.vsix` 进行安装。

## 快速开始

1. 安装完插件后，在 VS Code 中使用 `Command/Ctrl + Shift + P` 打开命令面板，输入 `MarkLingo: Open Settings` 进入到设置页面。
2. 选择 LLM Provider，输入你的 API key，选择模型，点击 `Save and Verify` 进行保存和验证。
3. 选择要翻译后输出的目标语言，默认简体中文。
4. 打开一个已保存的 Markdown 文件，从命令面板运行 `MarkLingo: Translate Current Markdown`。
5. 等待翻译完成，翻译进度可查看 VS Code 右下角的通知面板。
6. 其他命令，可在 VS Code 命令面板中，输入 `MarkLingo:` 来查看和使用。

### 快捷键翻译

| 命令 | macOS | Windows/Linux |
| --- | --- | --- |
| `MarkLingo: Translate Current Markdown` | `Option + Command + T` | `Control + Alt + T` |
| `MarkLingo: Delete Current Project Translated Files` | `Option + Command + D` | `Control + Alt + D` |

> 注意：如果 MarkLingo 在 macOS 上无法使用 `Option + Command + D`，说明该快捷键可能已被 Dock 占用。可前往“系统设置 > 键盘 > 键盘快捷键... > Dock > 打开或关闭 Dock 隐藏”进行更改，或在 MarkLingo Settings 中点击 `Edit`，为该命令分配其他 VS Code 快捷键。

### 右键翻译

除了命令面板和快捷键外，MarkLingo 也支持右键翻译功能。

1. 在 VS Code 资源管理器里找到要翻译的 Markdown 文件，点击右键，运行 `MarkLingo: Translate This Markdown File` 进行翻译。
2. 对于文件夹点击右键，运行 `MarkLingo: Translate All Markdown in This Folder`，会翻译该文件夹及其子文件夹中的 `.md` 和 `.markdown` 文件，并跳过已生成的 `*_mdt.md` 译文输出。
3. 多选 Markdown 文件或文件夹，再点击右键，运行 `MarkLingo: Translate Selected Markdown Files`，进行翻译。

## 命令

| 命令 | 功能 |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | 翻译当前已保存的 Markdown 文件，尽可能复用缓存的块翻译。 |
| `MarkLingo: Retranslate Current Markdown` | 强制对当前 Markdown 文件进行一次完整重新翻译。 |
| `MarkLingo: Translate This Markdown File` | 翻译从资源管理器右键菜单中选中的 Markdown 文件。 |
| `MarkLingo: Translate Selected Markdown Files` | 将资源管理器中选中的文件和文件夹收集到的 Markdown 文件作为一批翻译，打开第一个翻译输出，其余输出写在各自源文件旁边。 |
| `MarkLingo: Translate All Markdown in This Folder` | 翻译所选文件夹及其子文件夹中的源 Markdown 文件，打开第一个翻译输出，其余输出写在各自源文件旁边。 |
| `MarkLingo: Open Settings` | 打开 MarkLingo 设置，管理提供方验证、API 密钥、目标语言、自定义指令、快捷键状态、Usage Insights 和清理操作。 |
| `MarkLingo: Add Translated Files to .git/info/exclude` | 将 `*_mdt.md` 排除规则添加到当前仓库的本地 `.git/info/exclude`。 |
| `MarkLingo: Delete Current Project Translated Files` | 删除本项目中由扩展跟踪的翻译输出，同时保留私有翻译元数据/缓存。 |

> 注意：更改 Provider 或 Model ID 并点击 `Save and Verify` 后，如果希望用新验证的 provider/model 从头重新翻译已有文件，请使用 `MarkLingo: Retranslate Current Markdown`。`MarkLingo: Translate Current Markdown` 是增量翻译：它可能会复用上一个 provider/model 生成的缓存块翻译，只把已更改或新增的块发送给当前 provider/model。

## 设置

大多数用户需要的设置，可通过 `MarkLingo: Open Settings` 访问。

### 内置 Provider 模型

固定 Provider presets 只提供预设的模型选项。OpenRouter 和 Custom OpenAI Compatible 也支持直接输入想要使用的其他 Model ID。

| Provider | Model options |
| --- | --- |
| OpenRouter | 预设模型，并支持输入 Model ID |
| OpenAI | 预设模型：`gpt-5.4-mini`、`gpt-5.4-nano`、`gpt-5.4`、`gpt-5.5` |
| DeepSeek | 预设模型：`deepseek-v4-flash`、`deepseek-v4-pro` |
| Moonshot | 预设模型：`kimi-k2.6`、`kimi-k2.5` |
| GLM | 预设模型：`glm-4.7`、`glm-5`、`glm-5.1` |
| Xiaomi MiMo | 预设模型：`mimo-v2.5`、`mimo-v2.5-pro` |
| Custom OpenAI Compatible | 输入 Model ID |

- **Provider（提供方）**
  - 设置项：`marklingo.openrouter.provider`
  - 默认值：`openrouter`
  - Presets 包括 `OpenRouter`、`OpenAI`、`DeepSeek`、`Moonshot`、`GLM`、`Xiaomi MiMo` 和 `Custom OpenAI Compatible`。
  - `Custom OpenAI Compatible` 用于 llama.cpp server、Ollama、LM Studio 等本地或自定义端点。
  - 设置页面会记住每个 Provider 的 Model ID，并按 endpoint origin 分开保存 API key。切换下拉菜单会载入该 Provider 已保存的草稿；点击 `Save and Verify` 后才会激活所选 Provider。

- **Base URL（基础 URL）**
  - 设置项：`marklingo.providers.openaiCompatible.baseUrl`
  - 默认值：空
  - 仅在 Provider 为 `Custom OpenAI Compatible` 时显示。
  - 自定义端点必须使用 HTTPS，localhost 调试端点（例如 llama.cpp server、Ollama 或 LM Studio）除外。
  - 固定 preset 会在内部使用官方端点。`Moonshot` 和 `GLM` 会在验证时探测支持的全球/中国端点，并保留可用端点用于后续请求。

- **API Key（API 密钥）**
  - 存储：VS Code `SecretStorage`
  - 默认值：无
  - 输入所选 Provider 的 API 密钥。密钥会按 endpoint origin 分开存储，不会写入 VS Code 设置或工作区文件。

- **Model ID（模型 ID）**
  - OpenRouter 和 Custom OpenAI Compatible 支持直接输入 Model ID。
  - 其他 Provider presets 只提供精选 Model ID 选项。

- **Save and Verify（保存并验证）**
  - 只有轻量验证请求成功后，才会保存 Provider、API Key 和 Model ID。
  - 验证会检查连通性，并为所选模型选择最稳妥的请求方式。
  - 如果所选 Provider、Base URL、Model ID 和已保存的 API Key 都没有变化，并且已经有能力验证缓存，MarkLingo 只会重新做一次短连通性检查，不会再次探测模型能力。
  - 有些可用模型需要更小的 Markdown 批次才能保持输出可靠。遇到这种情况时，Settings 会显示一个小提示，大文件可能会慢一点。

- **Advanced Request Mode（高级请求模式）**
  - 设置项：`marklingo.translation.requestMode`
  - 默认值：`auto`
  - 通常由 `Save and Verify` 管理。`auto` 会优先使用已验证的请求路径；没有验证结果时使用标准 structured-output 请求路径。
  - 面向小批次请求路径的诊断用高级 settings.json 配置仍然可用：`marklingo.translation.translationModelMaxBlocksPerRequest`、`marklingo.translation.translationModelConcurrency` 与 `marklingo.translation.translationModelMaxOutputTokens`。

- **Target Language（目标语言）**
  - 设置项：`marklingo.translation.targetLanguage`
  - 默认值：`简体中文`
  - 内置选项包括 `简体中文`、`繁体中文`、`English`、`日本語`、`한국어`、`Français`、`Español`、`Deutsch` 和 `Custom...`。

- **Custom Language（自定义语言）**
  - 设置项：`marklingo.translation.targetLanguageCustom`
  - 默认值：空
  - 当目标语言为 `Custom...` 时使用。

- **Custom Instructions（自定义指令）**
  - 设置项：`marklingo.translation.customPrompt`
  - 默认值：空
  - 当所选模型支持时，附加在 MarkLingo 内置的 Markdown 保护提示之后，用于补充术语、语气或风格要求。需要小批次 fallback 的模型不会收到这些自定义指令，字段也会隐藏。

> 注意：设置页面通过 `Save and Verify` 保存 Provider 凭据。其他下拉框会立即保存；Provider 之外的自由文本字段使用各自的内联 `Save` 按钮。

### Usage Insights

Settings 中包含一个本地 Usage 区块，用来查看翻译历史。它会显示已翻译文件、成功翻译任务、provider/model 分组、最近运行记录、token 使用量，以及可用时的 USD 预估成本。成功的纯缓存 rerun 只会用已有翻译重建输出，不会调用 provider，因此不会计入 Usage runs。

OpenRouter 成本来自 provider 报告的本次请求成本；内置 direct provider 使用 provider 报告的 input/output tokens 和随扩展附带的 Vercel AI Gateway 价格快照。自定义和本地 OpenAI-compatible 端点可能显示 `Cost unavailable`。如果没有 reported usage，MarkLingo 会退回到本次实际发送请求的 input token 估算值。

## 输出文件

MarkLingo 始终保持源 Markdown 文件不变。

翻译输出会写在源文件旁边：

```text
README.md
README_zh-CN_mdt.md
```

自定义目标语言会尽可能使用从语言名派生的安全后缀，必要时使用稳定的 `custom-<hash>` 后缀。

再次运行翻译时，会根据当前的源 Markdown 和 MarkLingo 的私有元数据/缓存重新生成翻译文件。直接在翻译输出中所做的手动修改不会被合并或保留，因此如果你需要保留这些修改，请先复制或重命名翻译文件。

## 隐私与数据

MarkLingo 是一个本地 VS Code 扩展，但翻译需要将文档内容发送到 Settings 中选定的 Provider，例如 OpenRouter、OpenAI、DeepSeek、Moonshot、GLM、Xiaomi MiMo，或受信任的 Custom OpenAI Compatible 端点。

- Markdown 内容会被发送到所选 Provider endpoint 进行翻译。
- OpenRouter 是推荐的快速上手 Provider，其他 Provider presets 可在 Settings 中选择。
- 你需要所选 Provider 接受的 API 密钥或 token。
- 翻译请求为非流式。MarkLingo 会使用 `Save and Verify` 选出的已验证请求路径；需要小批次 fallback 的模型不会收到 Custom Instructions。对于标准请求路径，MarkLingo 会在提供方支持时请求从响应中排除模型推理内容。
- API 密钥按 endpoint origin 分开存储在 VS Code 的 `SecretStorage` 中。
- API 密钥不会存入工作区文件、VS Code 设置、翻译元数据或日志。
- 翻译元数据存储在 VS Code 的 `globalStorageUri` 下，而非工作区中。
- Usage Insights 以按月追加的事件文件形式存储在同一个 VS Code 私有存储中。事件只包含 hash、basename、计数、provider/model 标签、token/cost 摘要、时间戳和状态；不会存储 API key、prompt、原始路径、完整源 Markdown 或完整翻译 Markdown。
- 不包含任何遥测 SDK。

更改 Provider 或 Base URL 会改变后续翻译请求把 Markdown 内容发送到哪里。请仅使用你信任的端点。

## 清理

使用 `MarkLingo: Open Settings` 及其中的危险区域来清除已保存的数据。

`Clear All Data` 可以删除：

- 已保存的 API 密钥
- MarkLingo 用户设置
- 全局翻译元数据/缓存，包括 Usage Insights 事件
- （可选）已跟踪的翻译工作区输出

`Clear Current Project Data` 可以删除当前显示项目目录下的：

- 已跟踪的项目翻译输出
- 项目翻译元数据/缓存，包括 Usage Insights 事件

当你只想清理当前项目中由扩展跟踪的翻译文件时，使用 `MarkLingo: Delete Current Project Translated Files` 或其快捷键。MarkLingo 会先要求确认，并有意删除已跟踪的输出，即使它们在生成后被编辑过；其他项目的翻译文件不会受到影响。

## 开发

```sh
npm install
npm run compile
npm test
npm run test:vscode
npm run dev:vscode
npm run package:dry
```

`npm test` 运行快速的 Node 单元测试。`npm run test:vscode` 会启动一个隔离的 VS Code 扩展宿主，带有临时工作区、本地模拟 OpenRouter 端点和一个伪造的 SecretStorage API 密钥。它不会使用你已安装的 VSIX 设置或真实的 OpenRouter 密钥。

使用 `npm run dev:vscode` 对当前工作树进行手动冒烟测试。它会构建扩展，然后通过 `--extensionDevelopmentPath` 打开一个单独的 VS Code 窗口，并在系统临时目录中使用名为 `marklingo-dev-user` 的隔离用户数据目录、名为 `marklingo-dev-extensions` 的隔离扩展目录。这不会影响你的常规 VS Code 配置或已安装的 Marketplace 版本。由于扩展是从开发路径加载，而不是以 VSIX 形式安装，隔离窗口的 Extensions 视图仍可能显示 `Installed 0`；这是预期现象。可在 Command Palette 中运行 `MarkLingo: Open Settings`，或使用 `Developer: Show Running Extensions` 来确认开发扩展已加载。测试真实翻译请求时，需要在这个隔离窗口中重新配置 API 密钥。可通过 `MARKLINGO_DEV_USER_DATA_DIR` 或 `MARKLINGO_DEV_EXTENSIONS_DIR` 指定固定目录。

打包一个本地 VSIX：

```sh
npm run vsix
```

MarkLingo 以原生 ESM TypeScript 编写。源代码位于 `src/`，编译输出到 `out/`，发布的扩展入口是打包后的 `dist/extension.js`。
