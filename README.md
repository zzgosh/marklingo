# MarkLingo

Translate Markdown files into any language using AI models via OpenRouter while preserving Markdown structure, code, HTML, frontmatter syntax, links, and image paths.

## Features

- Translate the active Markdown file with `Option + Command + T` on macOS or `Control + Alt + T` on Windows/Linux.
- Generate a translated `*_<language>_mdt.md` file, open the translated Markdown tab, and show its Markdown Preview to the side.
- Reuse prior translations by hashing Markdown AST blocks.
- Force a full retranslation with `MarkLingo: Retranslate Current Markdown`.
- Configure provider, translation, and SecretStorage API keys from `MarkLingo: Open Settings`.
- View translate shortcut status and jump directly to VS Code Keyboard Shortcuts from the settings page.
- Store translation metadata in VS Code private global storage instead of the workspace.
- Translate selected human-facing YAML frontmatter values, such as `title` and `description`, while preserving field names, comments, delimiters, and machine-readable values.
- Add translated Markdown outputs to the local Git exclude file with `MarkLingo: Add Translated Files to .git/info/exclude`.
- Delete the current project's translated files and private metadata with `MarkLingo: Delete Current Project Translated Files`.
- Clear saved API keys, user settings, translation metadata/cache, and optionally all tracked workspace outputs from the settings page.

## Usage

1. Open a saved Markdown file.
2. Run `MarkLingo: Translate Current Markdown`.
3. Select the target language.
4. Enter an OpenRouter API key. The API key is stored once in VS Code `SecretStorage` and is used for the configured Base URL.
5. Confirm an OpenRouter model ID, or press Enter to use the default model.

You can also run `MarkLingo: Open Settings` first. Saving an API key from the settings page accepts the visible default target language and model, so the next translation starts without repeating those prompts.

## Keyboard Shortcut

MarkLingo contributes a default keybinding for `marklingo.translateCurrentMarkdown`: `Option + Command + T` on macOS and `Control + Alt + T` on Windows/Linux. This is an extension-provided default shortcut, not an entry written to User `keybindings.json`; use VS Code Keyboard Shortcuts to override or remove it.

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

The custom settings page saves dropdown changes immediately. Free-text fields have their own inline `Save` button. API key actions and Clear Data actions take effect immediately after their in-panel confirmation.

## Security And Privacy

- Markdown content is sent to the configured OpenRouter-compatible endpoint for translation.
- Translation requests are non-streaming and explicitly request reasoning exclusion (`reasoning.exclude: true`, `reasoning.effort: none`) to avoid returning thinking tokens.
- The official OpenRouter endpoint is used by default. Custom endpoints must use HTTPS, except for localhost debugging.
- API keys are stored in VS Code `SecretStorage`, not in workspace files, VS Code settings, translation metadata, or logs. VS Code owns the underlying OS credential storage, so the raw secret is not exposed as a normal file to browse in this repository.
- The API key is stored once and sent to whatever Base URL is configured. Changing the Base URL changes where future requests send the saved key.
- Delete the saved API key from `MarkLingo: Open Settings` using the `Danger Zone` section. Replacing a key does not require deletion — type a new key into the API Key field and click `Save`.
- Use `Clear Data` in `MarkLingo: Open Settings` before uninstalling if you want MarkLingo to delete saved API keys, user settings, translation metadata/cache, and optionally tracked workspace outputs. It does not modify User keybindings.
- Translation metadata, including source block hashes and cached translations, is stored under VS Code `globalStorageUri`. MarkLingo automatically keeps this metadata storage within a 300 MB quota by removing the oldest cached translations first.

## Output Files

- Translated output is always written next to the source Markdown file, for example `xxx_zh-CN_mdt.md`, `xxx_en_mdt.md`, or another target-language suffixed file next to `xxx.md`.
- Custom target languages use a safe suffix derived from the language name when possible, or a stable `custom-<hash>` suffix when the name cannot be represented as an ASCII slug.
- Metadata is written under VS Code private global storage. It includes source block hashes, cached translation blocks, output tracking, and a structured `debug` section with run status, extension/environment versions, non-secret settings, request planning details, warnings, and errors.
- The visible `xxx_<language>_mdt.md` file is output, not the translation cache. If an output file is deleted manually but its private metadata still exists, the next normal translation can rebuild the output from cached block translations instead of retranslating every unchanged block.
- Running translation again rebuilds the translated file from the current source Markdown and translation metadata/cache. Manual edits made directly in the translated output file are not merged or preserved, so copy or rename the file first if you need to keep those edits.
- `MarkLingo: Delete Current Project Translated Files` removes the current project's extension-tracked outputs, including outputs edited after generation, and clears that project's translation metadata/cache. After that, the next translation for that project has no cache to reuse and will translate the document again.
- `MarkLingo: Open Settings` shows metadata storage usage. `Optimize` removes the oldest cached translations while keeping small tracking records, so MarkLingo can still identify extension-tracked output files but must retranslate content whose cache was removed.
- `MarkLingo: Add Translated Files to .git/info/exclude` adds `*_mdt.md` to the current repository's local `.git/info/exclude`. This does not modify the repository `.gitignore`.
- Existing outputs from earlier versions named `xxx_mdt.md` are not renamed automatically; retranslate the source file to generate `xxx_<language>_mdt.md`, then remove the old output manually if it is no longer needed.

## Uninstall / Cleanup

Before uninstalling MarkLingo, run `MarkLingo: Open Settings`, select the data to delete in `Clear Data`, then confirm the cleanup:

- `Saved API key`: selected by default. Removes the saved MarkLingo API key.
- `MarkLingo settings`: selected by default. Removes current MarkLingo User settings.
- `Translation metadata & cache`: selected by default. Deletes the extension `globalStorage` folder.
- `Tracked translated files (*_mdt.md)`: not selected by default. Deletes tracked source-folder `*_<language>_mdt.md` outputs only when they were not edited after generation.

If MarkLingo has already been uninstalled, reinstall it, run `MarkLingo: Open Settings`, and use `Clear Data`; or remove the leftovers manually:

- Open `Preferences: Open User Settings (JSON)` and remove keys that start with `marklingo.`.
- Open `Preferences: Open Keyboard Shortcuts (JSON)` and remove entries whose `command` starts with `marklingo.` or `-marklingo.`.
- Delete MarkLingo's extension global storage folder from VS Code's User `globalStorage` directory. The folder name is based on the extension identifier, for example `zzgosh.marklingo`.
- Delete workspace `*_<language>_mdt.md` translated files manually if you no longer need them. After translation metadata/cache is deleted, MarkLingo can no longer tell which workspace outputs were extension-tracked.

## Token Estimates

Debug token counts are rough prompt estimates used only for request planning. They include the system prompt, the user prompt wrapper, JSON block payload, placeholder-expanded Markdown, and a small chat-message overhead. They do not use the exact tokenizer for the selected model, so they will not match external token counters exactly.

The Command Palette delete command removes the current project's extension-tracked outputs and private metadata, including edited generated outputs. Cross-project cleanup is available only from the Settings page Danger Zone.

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
