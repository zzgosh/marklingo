# MarkLingo

English | [简体中文](https://github.com/zzgosh/marklingo/blob/main/README.zh-CN.md) | [繁體中文](https://github.com/zzgosh/marklingo/blob/main/README.zh-TW.md) | [日本語](https://github.com/zzgosh/marklingo/blob/main/README.ja.md)

Translate Markdown with AI, without breaking it.

MarkLingo turns the active saved Markdown file into a translated copy while preserving the parts that should not be touched: headings, lists, tables, code, inline code, HTML, frontmatter syntax, links, and image paths. It is built for writers, maintainers, and documentation teams who want fast multilingual Markdown drafts inside VS Code.

Translation runs through [OpenRouter](https://openrouter.ai) with your own API key, so you pick the model and pay only for what you use.

MarkLingo itself is free to use and fully open source: all source code is public on [GitHub](https://github.com/zzgosh/marklingo). You only pay OpenRouter/model usage directly, based on the model you choose.

![Run MarkLingo from the Command Palette](https://raw.githubusercontent.com/zzgosh/marklingo/v0.0.1/resources/Screen-Recording-2026-06-02-new-720p-12fps.gif)

## Why MarkLingo

- Translate a saved Markdown document from VS Code with one command.
- Keep the original file intact and write a translated `*_<language>_mdt.md` file next to it.
- Open the translated Markdown tab and its Markdown Preview after translation.
- Reuse prior translations when unchanged Markdown blocks are translated again.
- Translate selected human-facing YAML frontmatter values, such as `title` and `description`, while preserving field names and machine-readable values.
- Configure the OpenRouter endpoint, model, API key, target language, and custom instructions from a dedicated settings page.
- Use a transparent, fully open-source extension with no extension fee; the source code is public on [GitHub](https://github.com/zzgosh/marklingo).
- Store API keys in VS Code `SecretStorage`; do not store them in workspace files or extension metadata.

## Install

Install **MarkLingo** from the VS Code Extensions view (search for `MarkLingo`) or from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zzgosh.marklingo).

For VS Code-compatible editors that use Open VSX, install MarkLingo from the [Open VSX Registry](https://open-vsx.org/extension/zzgosh/marklingo).

You can also install a packaged `.vsix` from the [releases page](https://github.com/zzgosh/marklingo/releases).

## Quick Start

First, get an OpenRouter API key: sign in at [openrouter.ai/keys](https://openrouter.ai/keys) and create a key. Usage is billed by OpenRouter per request, based on the model you choose.

1. Open a saved Markdown file.
2. Run `MarkLingo: Translate Current Markdown` from the Command Palette.
3. Select the target language.
4. Paste your OpenRouter API key when prompted. It is stored in VS Code `SecretStorage`, never in workspace files.
5. Confirm the model ID, or press Enter to use the default (`google/gemini-3.1-flash-lite`).

Default shortcut:

- macOS: `Option + Command + T`
- Windows/Linux: `Control + Alt + T`

You can also run `MarkLingo: Open Settings` first to save your API key, target language, model, and custom instructions before translating.

## Commands

| Command | What it does |
| --- | --- |
| `MarkLingo: Translate Current Markdown` | Translate the current saved Markdown file, reusing cached block translations when possible. |
| `MarkLingo: Retranslate Current Markdown` | Force a full retranslation of the current Markdown file. |
| `MarkLingo: Open Settings` | Open MarkLingo settings for OpenRouter, API key, target language, custom instructions, shortcut status, and cleanup. |
| `MarkLingo: Add Translated Files to .git/info/exclude` | Add `*_mdt.md` to the current repository's local Git exclude file. |
| `MarkLingo: Delete Current Project Translated Files` | Delete this project's extension-tracked translated outputs while keeping private translation metadata/cache. |

## Settings

Use `MarkLingo: Open Settings` for the settings most users need.

- **Base URL**
  - Setting: `marklingo.openrouter.baseUrl`
  - Default: `https://openrouter.ai/api/v1`
  - Custom endpoints must use HTTPS, except localhost debugging.

- **API Key**
  - Storage: VS Code `SecretStorage`
  - Default: none
  - Enter your OpenRouter API key. MarkLingo does not store it in VS Code settings or workspace files.

- **Model ID**
  - Setting: `marklingo.openrouter.modelId`
  - Default: `google/gemini-3.1-flash-lite`
  - Use an OpenRouter model ID.

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
  - Extra terminology, tone, or style instructions appended after MarkLingo's built-in Markdown-preservation prompt.

The settings page saves dropdown changes immediately. Free-text fields use their own inline `Save` buttons. API key actions and cleanup actions take effect immediately after confirmation.

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

MarkLingo is a local VS Code extension, but translation requires sending document content to OpenRouter, or to a trusted OpenRouter-compatible custom endpoint if you change the Base URL.

- Markdown content is sent to the configured endpoint for translation.
- The official OpenRouter endpoint is used by default.
- You need your own OpenRouter API key.
- Translation requests are non-streaming and request reasoning exclusion with `reasoning.exclude: true` and `reasoning.effort: none`.
- API keys are stored in VS Code `SecretStorage`.
- API keys are not stored in workspace files, VS Code settings, translation metadata, or logs.
- Translation metadata is stored under VS Code `globalStorageUri`, not in the workspace.
- No telemetry SDK is included.

Changing `marklingo.openrouter.baseUrl` changes where future translation requests send the saved API key. Only use endpoints you trust.

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

Use `npm run dev:vscode` for manual smoke testing of the current working tree. It builds the extension, then opens a separate VS Code window with `--extensionDevelopmentPath`, an isolated user data directory at `/tmp/marklingo-dev-user`, and an isolated extensions directory at `/tmp/marklingo-dev-extensions`. This keeps your regular VS Code profile and installed Marketplace version untouched. Because the extension is loaded from the development path instead of installed as a VSIX, the isolated Extensions view may still show `Installed 0`; that is expected. Verify the loaded development extension from the Command Palette with `MarkLingo: Open Settings`, or use `Developer: Show Running Extensions`. Configure the API key again inside that isolated window when testing real translation requests.

Package a local VSIX:

```sh
npm run vsix
```

MarkLingo is authored as native ESM TypeScript. Source lives in `src/`, compiled output goes to `out/`, and the published extension entrypoint is the bundled `dist/extension.js`.
