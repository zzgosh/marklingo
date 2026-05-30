# MarkLingo

Translate Markdown files into any language using AI models via OpenRouter while preserving Markdown structure, code, HTML, frontmatter, links, and image paths.

## Features

- Translate the active Markdown file with `Control + Option + Command + T`.
- Generate a translated `*_mdt.md` file, open the translated Markdown tab, and show its locked Markdown Preview to the side.
- Reuse prior translations by hashing Markdown AST blocks.
- Force a full retranslation with `MarkLingo: Translate Current Markdown (Full)`.
- Configure provider, translation, storage, and SecretStorage API keys from `MarkLingo: Open Settings`.
- View the current translate shortcut and jump directly to VS Code Keyboard Shortcuts from the settings page.
- Store translation metadata in VS Code private global storage instead of the workspace.
- Delete only extension-tracked translated files and private metadata with `MarkLingo: Delete all translated files`.
- Clear saved API keys, user settings, private metadata/cache, and optionally tracked workspace outputs from the settings page.

## Usage

1. Open a saved Markdown file.
2. Run `MarkLingo: Open Settings`.
3. Set an OpenRouter model ID, such as `google/gemini-3.1-flash-lite`.
4. Save an API key. The API key is stored once in VS Code `SecretStorage` and is used for the configured Base URL.
5. Run `MarkLingo: Translate Current Markdown`.

The first translation also asks for a target language if one has not been selected yet.

## Settings

Search for `MarkLingo` in VS Code Settings, or use `MarkLingo: Open Settings`.

- `marklingo.openrouter.baseUrl`
  - Default: `https://openrouter.ai/api/v1`
  - Custom endpoints must use HTTPS, except for localhost debugging.
- `marklingo.openrouter.modelId`
  - Default: `google/gemini-3.1-flash-lite`
- `marklingo.translation.maxContextUsageRatio`
  - Default: `0.5`
  - When the selected OpenRouter model reports a context window, each translation request prompt targets this share of that window.
- `marklingo.translation.maxBlocksPerRequest`
  - Default: `24`
  - Fallback block count used only when the model context window cannot be read.
- `marklingo.translation.targetLanguage`
  - Default: `简体中文`
- `marklingo.translation.targetLanguageCustom`
  - Used when `targetLanguage` is `Custom...`.
- `marklingo.translation.systemPrompt`
  - Advanced base system prompt override, not shown in the MarkLingo settings panel. Leave empty to use the extension default. Use `{targetLanguage}` as the target language placeholder.
- `marklingo.translation.customPrompt`
  - Custom instructions appended after the built-in translation prompt, such as terminology or style rules.
- `marklingo.storage.outputLocation`
  - `sourceFolder`: write the visible translated Markdown file next to the source file.
  - `privateStorage`: write translated Markdown under the extension private storage directory.

The custom settings page saves dropdown changes immediately. Free-text fields have their own inline `Save` button. API key actions and Clear Data actions take effect immediately after their in-panel confirmation.

## Security And Privacy

- Markdown content is sent to the configured OpenRouter-compatible endpoint for translation.
- Translation requests are non-streaming and explicitly request reasoning exclusion (`reasoning.exclude: true`, `reasoning.effort: none`) to avoid returning thinking tokens.
- The official OpenRouter endpoint is used by default. Custom endpoints must use HTTPS, except for localhost debugging.
- API keys are stored in VS Code `SecretStorage`, not in workspace files, VS Code settings, translation metadata, or logs. VS Code owns the underlying OS credential storage, so the raw secret is not exposed as a normal file to browse in this repository.
- The API key is stored once and sent to whatever Base URL is configured. Changing the Base URL changes where future requests send the saved key.
- Delete the saved API key from `MarkLingo: Open Settings` with the API Key `Clear` button.
- Use `Clear Data` in `MarkLingo: Open Settings` before uninstalling if you want MarkLingo to delete saved API keys, user settings, private metadata/cache, and optionally tracked workspace outputs. It does not modify User keybindings.
- Translation metadata, including source block hashes and cached translations, is stored under VS Code `globalStorageUri`.
- Writing translated Markdown to `privateStorage` keeps generated files out of the workspace, but Markdown Preview resolves relative links and images from the private storage directory. Use `sourceFolder` when relative links or local images must keep working.

## Output Files

- `sourceFolder` output: `xxx_mdt.md` is written next to `xxx.md`.
- `privateStorage` output: translated Markdown is written under the extension private storage directory.
- Metadata is written under VS Code private global storage. It includes cached source/translation blocks plus a structured `debug` section with run status, extension/environment versions, non-secret settings, request planning details, warnings, and errors.
- The visible `xxx_mdt.md` file is output, not the translation cache. If a source-folder output file is deleted manually but its private metadata still exists, the next normal translation can rebuild the output from cached block translations instead of retranslating every unchanged block.
- `MarkLingo: Delete all translated files` removes extension-tracked outputs and clears the private metadata/cache. After that, the next translation has no cache to reuse and will translate the document again.

## Uninstall / Cleanup

Before uninstalling MarkLingo, run `MarkLingo: Open Settings`, select the data to delete in `Clear Data`, type `CLEAR`, then click `Clear data`:

- `Saved API key`: selected by default. Removes the saved MarkLingo API key.
- `MarkLingo settings`: selected by default. Removes current MarkLingo User settings.
- `Private cache & metadata`: selected by default. Deletes the extension `globalStorage` folder.
- `Tracked translated files (*_mdt.md)`: not selected by default. Deletes tracked source-folder `*_mdt.md` outputs only when they were not edited after generation.

If MarkLingo has already been uninstalled, reinstall it, run `MarkLingo: Open Settings`, and use `Clear Data`; or remove the leftovers manually:

- Open `Preferences: Open User Settings (JSON)` and remove keys that start with `marklingo.`.
- Open `Preferences: Open Keyboard Shortcuts (JSON)` and remove entries whose `command` starts with `marklingo.` or `-marklingo.`.
- Delete MarkLingo's extension global storage folder from VS Code's User `globalStorage` directory. The folder name is based on the extension identifier, for example `zzgosh.marklingo`.
- Delete workspace `*_mdt.md` translated files manually if you no longer need them. After private metadata/cache is deleted, MarkLingo can no longer tell which workspace outputs were extension-tracked.

## Token Estimates

Notification token counts are rough prompt estimates used only for request planning. They include the system prompt, the user prompt wrapper, JSON block payload, placeholder-expanded Markdown, and a small chat-message overhead. They do not use the exact tokenizer for the selected model, so they will not match external token counters exactly.

The delete command removes extension-tracked outputs and private metadata. If a tracked source-folder output was edited after generation, it is skipped instead of deleted.

## Development

```sh
npm install
npm run compile
npm test
npm run test:vscode
npm run package:dry
```

`npm test` runs fast Node unit tests. `npm run test:vscode` launches an isolated VS Code Extension Host with a temporary workspace, a local mock OpenRouter endpoint, and a fake SecretStorage API key. It does not use your installed VSIX settings or real OpenRouter key.

Debug in VS Code with `Run Extension` from `.vscode/launch.json`.

## Packaging

```sh
npm run vsix
```

The extension is authored as ESM (`"type": "module"` and `module: "NodeNext"`), compiles TypeScript to `out/`, and publishes the bundled ESM entrypoint from `dist/extension.js`.
