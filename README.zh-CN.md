# MarkLingo

[English](./README.md) | 简体中文 | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md)

用 AI 翻译 Markdown，同时不破坏 Markdown。

MarkLingo 会将当前已保存的 Markdown 文件翻译成一份副本，同时保留那些不应被改动的部分：标题、列表、表格、代码、行内代码、HTML、frontmatter 语法、链接和图片路径。它面向希望在 VS Code 中快速生成多语言 Markdown 草稿的写作者、维护者和文档团队。

翻译通过 [OpenRouter](https://openrouter.ai) 并使用你自己的 API 密钥完成，因此模型由你选择，用多少付多少。

MarkLingo 本身不收取任何费用，并且完全开源透明：所有源代码都公开在 [GitHub](https://github.com/zzgosh/marklingo) 上。你只需按所选模型直接支付 OpenRouter/模型服务的用量费用。

![从命令面板运行 MarkLingo](https://raw.githubusercontent.com/zzgosh/marklingo/v0.0.1/resources/Screen-Recording-2026-06-02-new-720p-12fps.gif)

## 为什么选择 MarkLingo

- 可从命令面板、编辑器右键菜单或资源管理器右键菜单翻译已保存的 Markdown 文档。
- 保持原文件不变，并在其旁边写出一个翻译后的 `*_<language>_mdt.md` 文件。
- 翻译完成后打开翻译后的 Markdown 标签页及其 Markdown 预览。
- 当未改动的 Markdown 块再次被翻译时，复用此前的翻译。
- 翻译选定的、面向人类阅读的 YAML frontmatter 值（例如 `title` 和 `description`），同时保留字段名和机器可读的值。
- 在专门的设置页面中配置 OpenRouter 端点、模型、API 密钥、目标语言和自定义指令。
- 使用完全开源透明、插件本身免费的扩展；所有源代码都公开在 [GitHub](https://github.com/zzgosh/marklingo) 上。
- 将 API 密钥存储在 VS Code 的 `SecretStorage` 中；不会存入工作区文件或扩展元数据。

## 安装

在 VS Code 的扩展视图中安装 **MarkLingo**（搜索 `MarkLingo`），或从 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo) 安装。

对于使用 Open VSX 的 VS Code 兼容编辑器，可从 [Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo) 安装 MarkLingo。

也可以从 [releases 页面](https://github.com/zzgosh/marklingo/releases) 安装打包好的 `.vsix`。

## 快速开始

首先，获取一个 OpenRouter API 密钥：在 [openrouter.ai/keys](https://openrouter.ai/keys) 登录并创建一个密钥。费用由 OpenRouter 按请求计费，具体取决于你选择的模型。

1. 打开一个已保存的 Markdown 文件。
2. 从命令面板运行 `MarkLingo: Translate Current Markdown`。
3. 选择目标语言。
4. 在提示时粘贴你的 OpenRouter API 密钥。它会存储在 VS Code 的 `SecretStorage` 中，绝不会存入工作区文件。
5. 确认模型 ID，或按回车使用默认模型（`google/gemini-3.1-flash-lite`）。

默认快捷键：

- macOS：`Option + Command + T`
- Windows/Linux：`Control + Alt + T`

你也可以先运行 `MarkLingo: Open Settings`，在翻译前保存 API 密钥、目标语言、模型和自定义指令。

也可以在 Markdown 编辑器上右键运行 `MarkLingo: Translate Current Markdown`。在资源管理器中的 Markdown 文件上右键运行 `MarkLingo: Translate This Markdown File`。在资源管理器中的文件夹上右键运行 `MarkLingo: Translate All Markdown in This Folder`，可翻译该文件夹及其子文件夹中的 `.md` 和 `.markdown` 文件，并跳过已生成的 `*_mdt.md` 输出。也可以在资源管理器中多选 Markdown 文件或文件夹，再运行 `MarkLingo: Translate Selected Markdown Files` 作为一批翻译。

## 命令

| 命令 | 功能 |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | 翻译当前已保存的 Markdown 文件，尽可能复用缓存的块翻译。 |
| `MarkLingo: Retranslate Current Markdown` | 强制对当前 Markdown 文件进行一次完整重新翻译。 |
| `MarkLingo: Translate This Markdown File` | 翻译从资源管理器右键菜单中选中的 Markdown 文件。 |
| `MarkLingo: Translate Selected Markdown Files` | 将资源管理器中选中的文件和文件夹收集到的 Markdown 文件作为一批翻译，打开第一个翻译输出，其余输出写在各自源文件旁边。 |
| `MarkLingo: Translate All Markdown in This Folder` | 翻译所选文件夹及其子文件夹中的源 Markdown 文件，打开第一个翻译输出，其余输出写在各自源文件旁边。 |
| `MarkLingo: Open Settings` | 打开 MarkLingo 设置，管理 OpenRouter、API 密钥、目标语言、自定义指令、快捷键状态和清理操作。 |
| `MarkLingo: Add Translated Files to .git/info/exclude` | 将 `*_mdt.md` 添加到当前仓库的本地 Git 排除文件中。 |
| `MarkLingo: Delete Current Project Translated Files` | 删除本项目中由扩展跟踪的翻译输出，以及私有的翻译元数据/缓存。 |

## 设置

大多数用户需要的设置，可通过 `MarkLingo: Open Settings` 访问。

- **Base URL（基础 URL）**
  - 设置项：`marklingo.openrouter.baseUrl`
  - 默认值：`https://openrouter.ai/api/v1`
  - 自定义端点必须使用 HTTPS，localhost 调试除外。

- **API Key（API 密钥）**
  - 存储：VS Code `SecretStorage`
  - 默认值：无
  - 输入你的 OpenRouter API 密钥。MarkLingo 不会将其存入 VS Code 设置或工作区文件。

- **Model ID（模型 ID）**
  - 设置项：`marklingo.openrouter.modelId`
  - 默认值：`google/gemini-3.1-flash-lite`
  - 使用一个 OpenRouter 模型 ID。

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
  - 附加在 MarkLingo 内置的 Markdown 保护提示之后的额外术语、语气或风格指令。

设置页面会立即保存下拉框的更改。自由文本字段使用各自的内联 `Save` 按钮。API 密钥操作和清除数据操作在确认后立即生效。

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

MarkLingo 是一个本地 VS Code 扩展，但翻译需要将文档内容发送到 OpenRouter，或在你更改 Base URL 时发送到受信任的、兼容 OpenRouter 的自定义端点。

- Markdown 内容会被发送到配置的端点进行翻译。
- 默认使用官方的 OpenRouter 端点。
- 你需要自己的 OpenRouter API 密钥。
- 翻译请求为非流式，并通过 `reasoning.exclude: true` 和 `reasoning.effort: none` 请求排除推理过程。
- API 密钥存储在 VS Code 的 `SecretStorage` 中。
- API 密钥不会存入工作区文件、VS Code 设置、翻译元数据或日志。
- 翻译元数据存储在 VS Code 的 `globalStorageUri` 下，而非工作区中。
- 不包含任何遥测 SDK。

更改 `marklingo.openrouter.baseUrl` 会改变后续翻译请求把已保存的 API 密钥发往何处。请仅使用你信任的端点。

## 清理

使用 `MarkLingo: Open Settings` 及其中的危险区域来清除已保存的数据。

`Clear All Data` 可以删除：

- 已保存的 API 密钥
- MarkLingo 用户设置
- 全局翻译元数据/缓存
- （可选）已跟踪的翻译工作区输出

`Clear Current Project Data` 可以删除当前显示项目目录下的：

- 已跟踪的项目翻译输出
- 项目翻译元数据/缓存

当你只想清理当前项目中由扩展跟踪的翻译文件时，使用 `MarkLingo: Delete Current Project Translated Files`。这个项目范围的命令会有意删除已跟踪的输出，即使它们在生成后被编辑过。

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
