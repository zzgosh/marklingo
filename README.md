# VS Code Markdown Translator

一个用于在 VS Code 中**将 Markdown 翻译为简体中文**的扩展，翻译能力来自 **OpenRouter** 大模型。

## 功能

- **快捷键翻译**：默认 `Option + Command + V`（仅在 Markdown 编辑器中生效）
- **输出文件**：在原文件同级目录生成 `*_mdt.md`
- **预览呈现**：翻译完成后自动用 **Markdown Preview（Split）** 打开
- **增量翻译**：基于 Markdown AST 分块与 hash 复用已翻译块，减少 API 调用（默认不会因“删减”自动全量重译）
- **强制全量**：`Markdown Translator: Translate Current Markdown (Full)` 重新翻译全部 blocks（用于大改/删减后想统一风格）
- **缓存更干净**：增量缓存默认存放在工作区 `.vscode/markdown-translator/meta/` 下，避免在文档目录旁边生成 `*_mdt.meta.json`
- **一键清理**：`Markdown Translator: Delete all translated files` 删除工作区内 `*_mdt.md` 与 `*_mdt.meta.json`

## 使用方法

1. 打开任意 Markdown 文件（`editorLangId == markdown`）
2. 按下快捷键 `Option + Command + V`
3. 首次使用若未配置，会提示你输入：
   - OpenRouter API Key（会写入 VS Code `SecretStorage`）
   - OpenRouter Model ID（例如：`openai/gpt-4o-mini`；设置后会记住，后续翻译不会再弹出）
4. 等待翻译完成，右侧会打开预览

## 设置项

在 VS Code 设置中搜索 `Markdown Translator` 或 `markdownTranslator`：

- `markdownTranslator.openrouter.baseUrl`
  - 默认：`https://openrouter.ai/api/v1`
- `markdownTranslator.openrouter.modelId`
  - 例：`openai/gpt-4o-mini`
- `markdownTranslator.openrouter.apiKey`
  - 建议：优先通过首次提示输入并存入 `SecretStorage`
- `markdownTranslator.translation.maxBlocksPerRequest`
  - 默认：`12`
  - 越大：请求更少，但单次 prompt 更大、越容易超出模型限制
- `markdownTranslator.translation.systemPrompt`
  - 默认：空
  - 追加到内置 system prompt 之后（用于术语表/风格约束等）
- `markdownTranslator.translation.deletionFallback`
  - 默认：`false`
  - 当检测到“段落/块删除”时，自动回退为全量翻译（更保守，调用更多；也可改用“强制全量”命令）
- `markdownTranslator.translation.similarityThreshold`
  - 默认：`0.6`
  - 用于区分“删除”与“修改”（越高越严格）

## 输出文件说明

- `xxx_mdt.md`：译文文件
- `.vscode/markdown-translator/meta/**/xxx_mdt.meta.json`：增量翻译缓存（用于复用已翻译块；未打开工作区时会回退到原文件同级目录）

> 建议将 `.vscode/markdown-translator/` 加入你项目的 `.gitignore`，避免缓存进入版本控制。

## 隐私与安全

- 你的 Markdown 内容会发送到你配置的 OpenRouter 模型进行翻译
- API Key 建议使用扩展首次提示输入并存入 VS Code `SecretStorage`，避免明文写在 settings

## 常见问题

- **为什么提示我输入 API Key / Model ID？**
  - 因为未在设置中配置，或 `SecretStorage` 中还没有保存过 API Key。
- **如何修改 / 重置 OpenRouter API Key？**
  - 运行命令：`Markdown Translator: Set OpenRouter API Key`（覆盖保存）或 `Markdown Translator: Reset OpenRouter API Key`（删除保存）
- **如何修改 OpenRouter Model ID？**
  - 运行命令：`Markdown Translator: Set OpenRouter Model ID`
- **翻译后的代码/链接被改动了怎么办？**
  - 扩展会尽量通过“占位符保护”保留代码块、行内代码、URL 与图片路径不变；如果你遇到模型不遵守规则，建议更换更强的模型或降低 `maxBlocksPerRequest`。

## 开发调试

1. `npm install`
2. 在 VS Code 中按 `F5`（Run Extension）
   - 调试会使用隔离目录：`${workspaceFolder}/.vscode-test/*`，避免加载你本机已安装的第三方扩展，Debug Console 更干净
