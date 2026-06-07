# MarkLingo

English | [简体中文](https://github.com/zzgosh/marklingo/blob/main/README.zh-CN.md) | [繁體中文](https://github.com/zzgosh/marklingo/blob/main/README.zh-TW.md) | [日本語](https://github.com/zzgosh/marklingo/blob/main/README.ja.md)

Translate Markdown with AI, without breaking it.

MarkLingo translates saved Markdown into multilingual drafts while keeping the original file untouched. It is built for writers, maintainers, and documentation teams who need fast Markdown translation inside VS Code.

- Preserve Markdown structure: headings, lists, tables, code, inline code, HTML, frontmatter syntax, links, and image paths.
- Choose from built-in provider presets for [OpenRouter](https://openrouter.ai), OpenAI, DeepSeek, Moonshot, GLM, Xiaomi MiMo, or use a trusted Custom OpenAI Compatible endpoint.
- Write translated `*_<language>_mdt.md` files next to the source, open the translated tab and preview, and reuse cached translations for unchanged Markdown blocks.
- Use a free, open-source extension with API keys stored in VS Code `SecretStorage` and no telemetry SDK.

![Run MarkLingo from the Command Palette](https://raw.githubusercontent.com/zzgosh/marklingo/v0.0.3/resources/Screen-Recording-2026-06-02-new-720p-12fps.gif)

## Install

Install **MarkLingo** from the VS Code Extensions view (search for `MarkLingo`) or from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo).

For VS Code-compatible editors that use Open VSX, install MarkLingo from the [Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo).

You can also install a packaged `.vsix` from the [releases page](https://github.com/zzgosh/marklingo/releases).

## Quick Start

Fastest path: use OpenRouter. Sign in at [openrouter.ai/keys](https://openrouter.ai/keys) and create an API key. Usage is billed by OpenRouter per request, based on the model you choose. To use another built-in provider, start with `MarkLingo: Open Settings` and choose it from Provider.

1. Run `MarkLingo: Open Settings`.
2. Keep Provider as `OpenRouter` for the quickest setup, or choose another provider in Settings. Paste your API key, choose a Model ID, then click `Save and Verify`.
3. Open a saved Markdown file.
4. Run `MarkLingo: Translate Current Markdown` from the Command Palette.
5. Choose the target language.

Default shortcut:

- macOS: `Option + Command + T`
- Windows/Linux: `Control + Alt + T`

You can also start with `MarkLingo: Translate Current Markdown`. On first run, MarkLingo asks for the target language and Provider. Choose `OpenRouter` for quick setup, choose `Custom OpenAI Compatible` for a custom endpoint, or open MarkLingo Settings to configure any provider preset.

Right-click a Markdown editor to run `MarkLingo: Translate Current Markdown`. Right-click a Markdown file in the Explorer to run `MarkLingo: Translate This Markdown File`. Right-click a folder in the Explorer to run `MarkLingo: Translate All Markdown in This Folder`, which translates `.md` and `.markdown` files in that folder and its subfolders while skipping generated `*_mdt.md` outputs. You can also select multiple Markdown files or folders in the Explorer and run `MarkLingo: Translate Selected Markdown Files` to translate them as one batch.

## Commands

| Command | What it does |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | Translate the current saved Markdown file, reusing cached block translations when possible. |
| `MarkLingo: Retranslate Current Markdown` | Force a full retranslation of the current Markdown file. |
| `MarkLingo: Translate This Markdown File` | Translate the Markdown file selected from the Explorer context menu. |
| `MarkLingo: Translate Selected Markdown Files` | Translate Markdown files gathered from selected Explorer files and folders as one batch, opening the first translated output and writing the rest next to their sources. |
| `MarkLingo: Translate All Markdown in This Folder` | Translate source Markdown files in the selected folder and subfolders, opening the first translated output and writing the rest next to their sources. |
| `MarkLingo: Open Settings` | Open MarkLingo settings for provider verification, API key, target language, custom instructions, shortcut status, and cleanup. |
| `MarkLingo: Add Translated Files to .git/info/exclude` | Add `*_mdt.md` to the current repository's local Git exclude file. |
| `MarkLingo: Delete Current Project Translated Files` | Delete this project's extension-tracked translated outputs while keeping private translation metadata/cache. |

## Settings

Use `MarkLingo: Open Settings` for the settings most users need.

### Built-In Provider Models

Fixed provider presets expose a curated set of model choices. OpenRouter and Custom OpenAI Compatible also allow direct Model ID entry.

| Provider | Model options |
| --- | --- |
| OpenRouter | `google/gemini-3.1-flash-lite` by default; recommended models plus direct Model ID entry |
| OpenAI | `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.4`, `gpt-5.5` |
| DeepSeek | `deepseek-v4-flash`, `deepseek-v4-pro` |
| Moonshot | `kimi-k2.6`, `kimi-k2.5` |
| GLM | `glm-4.7`, `glm-5`, `glm-5.1` |
| Xiaomi MiMo | `mimo-v2-flash`, `mimo-v2.5`, `mimo-v2.5-pro` |
| Custom OpenAI Compatible | Endpoint-provided model alias; direct Model ID entry |

- **Provider**
  - Setting: `marklingo.openrouter.provider`
  - Default: `openrouter`
  - Presets include `OpenRouter`, `OpenAI`, `DeepSeek`, `Moonshot`, `GLM`, `Xiaomi MiMo`, and `Custom OpenAI Compatible`.
  - Use `Custom OpenAI Compatible` for local or custom endpoints such as llama.cpp server, Ollama, or LM Studio.
  - The settings page remembers each provider's Model ID and API key by endpoint origin. Switching the dropdown loads that provider's saved draft; `Save and Verify` activates the selected provider.

- **Base URL**
  - Shown only for `Custom OpenAI Compatible`.
  - Custom endpoints must use HTTPS, except localhost debugging endpoints such as llama.cpp server, Ollama, or LM Studio.
  - Fixed presets use their official endpoint internally. `Moonshot` and `GLM` probe their supported global/China endpoints during verification and keep the working endpoint for later requests.

- **API Key**
  - Storage: VS Code `SecretStorage`
  - Default: none
  - Enter the API key for the selected provider. Keys are stored separately by endpoint origin and are never stored in VS Code settings or workspace files.

- **Model ID**
  - OpenRouter and Custom OpenAI Compatible allow direct Model ID entry.
  - Other provider presets offer only curated Model ID choices.

- **Save and Verify**
  - Saves the Provider, API key, and Model ID only after a lightweight verification request succeeds.
  - The verification checks connectivity and chooses the safest request shape for the selected model.
  - If the selected provider, internal endpoint, Model ID, and saved API key are unchanged and a capability result is already cached, MarkLingo only reruns a short connectivity check instead of probing model capability again.
  - Some reachable models need smaller Markdown batches for reliability. When that happens, Settings shows a small info tip, and large files may run a bit slower.

- **Advanced Request Mode**
  - Setting: `marklingo.translation.requestMode`
  - Default: `auto`
  - Normally managed by `Save and Verify`. In `auto`, MarkLingo uses the verified request path when available and otherwise uses the standard structured-output request path.
  - Advanced settings.json knobs remain available for diagnostics for the smaller-batch request path: `marklingo.translation.translationModelMaxBlocksPerRequest`, `marklingo.translation.translationModelConcurrency`, and `marklingo.translation.translationModelMaxOutputTokens`.

- **Target Language**
  - Setting: `marklingo.translation.targetLanguage`
  - Default: `简体中文`
  - Built-in options include `简体中文`, `繁体中文`, `English`, `日本語`, `한국어`, `Français`, `Español`, `Deutsch`, and `Custom...`.

- **Custom Language**
  - Setting: `marklingo.translation.targetLanguageCustom`
  - Default: empty
  - Used when target language is `Custom...`.

- **Custom Instructions**
  - Setting: `marklingo.translation.customPrompt`
  - Default: empty
  - Extra terminology, tone, or style instructions appended after MarkLingo's built-in Markdown-preservation prompt when the selected model supports them. This field is hidden and not sent for models that need the smaller-batch fallback.

The settings page saves Provider credentials through `Save and Verify`. Other dropdown changes save immediately, and free-text fields outside Provider use their own inline `Save` buttons.

## Output Files

MarkLingo always keeps the source Markdown file unchanged.

Translated output is written next to the source file:

```text
README.md
README_zh-CN_mdt.md
```

Custom target languages use a safe suffix derived from the language name when possible, or a stable `custom-<hash>` suffix when needed.

Running translation again rebuilds the translated file from the current source Markdown and MarkLingo's private metadata/cache. Manual edits made directly in the translated output are not merged or preserved, so copy or rename the translated file first if you need to keep those edits.

## Privacy and Data

MarkLingo is a local VS Code extension, but translation requires sending document content to the provider selected in Settings, such as OpenRouter, OpenAI, DeepSeek, Moonshot, GLM, Xiaomi MiMo, or a trusted custom OpenAI-compatible endpoint.

- Markdown content is sent to the selected provider endpoint for translation.
- OpenRouter is the recommended quick-start provider, and other provider presets can be selected in Settings.
- You need an API key or token accepted by the selected Provider.
- Translation requests are non-streaming. MarkLingo uses the verified request path selected by `Save and Verify`; models that need the smaller-batch fallback do not receive Custom Instructions. For the standard request path, MarkLingo asks the provider to exclude model reasoning from responses when supported.
- API keys are stored in VS Code `SecretStorage`, separated by endpoint origin.
- API keys are not stored in workspace files, VS Code settings, translation metadata, or logs.
- Translation metadata is stored under VS Code `globalStorageUri`, not in the workspace.
- No telemetry SDK is included.

Changing Provider or the Custom OpenAI Compatible Base URL changes where future translation requests send Markdown content. Only use endpoints you trust.

## Cleanup

Use `MarkLingo: Open Settings` and the Danger Zone to clear saved data.

`Clear All Data` can delete:

- Saved API key
- MarkLingo user settings
- Global translation metadata/cache
- Optionally, tracked translated workspace outputs

`Clear Current Project Data` can delete, for the shown project directory:

- Tracked translated project outputs
- Project translation metadata/cache

Use `MarkLingo: Delete Current Project Translated Files` when you only want to clean the current project's extension-tracked translated files. It intentionally deletes tracked outputs even if they were edited after generation.

## Development

```sh
npm install
npm run compile
npm test
npm run test:vscode
npm run dev:vscode
npm run package:dry
```

`npm test` runs fast Node unit tests. `npm run test:vscode` launches an isolated VS Code Extension Host with a temporary workspace, a local mock OpenRouter endpoint, and a fake SecretStorage API key. It does not use your installed VSIX settings or real OpenRouter key.

Use `npm run dev:vscode` for manual smoke testing of the current working tree. It builds the extension, then opens a separate VS Code window with `--extensionDevelopmentPath`, an isolated user data directory named `marklingo-dev-user` in the system temp directory, and an isolated extensions directory named `marklingo-dev-extensions` in the system temp directory. This keeps your regular VS Code profile and installed Marketplace version untouched. Because the extension is loaded from the development path instead of installed as a VSIX, the isolated Extensions view may still show `Installed 0`; that is expected. Verify the loaded development extension from the Command Palette with `MarkLingo: Open Settings`, or use `Developer: Show Running Extensions`. Configure the API key again inside that isolated window when testing real translation requests. Override `MARKLINGO_DEV_USER_DATA_DIR` or `MARKLINGO_DEV_EXTENSIONS_DIR` to choose fixed directories.

Package a local VSIX:

```sh
npm run vsix
```

MarkLingo is authored as native ESM TypeScript. Source lives in `src/`, compiled output goes to `out/`, and the published extension entrypoint is the bundled `dist/extension.js`.
