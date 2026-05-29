# VS Code Markdown Translator

A VS Code extension for translating Markdown files with OpenRouter-compatible chat models while preserving Markdown structure, code, HTML, frontmatter, links, and image paths.

## Features

- Translate the active Markdown file with `Option + Command + V`.
- Generate a translated `*_mdt.md` file and open it in Markdown Preview to the side.
- Reuse prior translations by hashing Markdown AST blocks.
- Force a full retranslation with `Markdown Translator: Translate Current Markdown (Full)`.
- Configure provider, translation, storage, and SecretStorage API keys from `Markdown Translator: Open Settings`.
- View the current translate shortcut and jump directly to VS Code Keyboard Shortcuts from the settings page.
- Store translation metadata in VS Code private global storage instead of the workspace.
- Delete only extension-tracked translated files and private metadata with `Markdown Translator: Delete all translated files`.

## Usage

1. Open a saved Markdown file.
2. Run `Markdown Translator: Open Settings`.
3. Set an OpenRouter model ID, such as `openai/gpt-4o-mini`.
4. Save an API key. API keys are stored in VS Code `SecretStorage`.
5. Run `Markdown Translator: Translate Current Markdown`.

The first translation also asks for a target language if one has not been selected yet.

## Settings

Search for `Markdown Translator` in VS Code Settings, or use `Markdown Translator: Open Settings`.

- `markdownTranslator.openrouter.baseUrl`
  - Default: `https://openrouter.ai/api/v1`
  - Custom endpoints require explicit confirmation before use.
- `markdownTranslator.openrouter.modelId`
  - Example: `openai/gpt-4o-mini`
- `markdownTranslator.translation.maxContextUsageRatio`
  - Default: `0.5`
  - When the selected OpenRouter model reports a context window, each translation request prompt targets this share of that window.
- `markdownTranslator.translation.maxBlocksPerRequest`
  - Default: `24`
  - Fallback block count used only when the model context window cannot be read.
- `markdownTranslator.translation.targetLanguage`
  - Default: `简体中文`
- `markdownTranslator.translation.targetLanguageCustom`
  - Used when `targetLanguage` is `Custom...`.
- `markdownTranslator.translation.systemPrompt`
  - Base system prompt template. Leave empty to use the extension default. Use `{targetLanguage}` as the target language placeholder.
- `markdownTranslator.translation.customPrompt`
  - Optional custom prompt appended after the system prompt, such as terminology or style rules.
- `markdownTranslator.translation.deletionFallback`
  - Default: `false`
  - Runs a full translation when block deletion is detected.
- `markdownTranslator.translation.similarityThreshold`
  - Default: `0.6`
- `markdownTranslator.storage.outputLocation`
  - `sourceFolder`: write the visible translated Markdown file next to the source file.
  - `privateStorage`: write translated Markdown under the extension private storage directory.

## Security And Privacy

- Markdown content is sent to the configured OpenRouter-compatible endpoint for translation.
- Translation requests are non-streaming and explicitly request reasoning exclusion (`reasoning.exclude: true`, `reasoning.effort: none`) to avoid returning thinking tokens.
- The official OpenRouter origin is allowed by default. Custom origins show a modal confirmation before use.
- API keys are stored separately per endpoint origin. A custom endpoint does not reuse the official OpenRouter API key.
- Translation metadata, including source block hashes and cached translations, is stored under VS Code `globalStorageUri`.
- Writing translated Markdown to `privateStorage` keeps generated files out of the workspace, but Markdown Preview resolves relative links and images from the private storage directory. Use `sourceFolder` when relative links or local images must keep working.

## Output Files

- `sourceFolder` output: `xxx_mdt.md` is written next to `xxx.md`.
- `privateStorage` output: translated Markdown is written under the extension private storage directory.
- Metadata is written under VS Code private global storage. It includes cached source/translation blocks plus a structured `debug` section with run status, extension/environment versions, non-secret settings, request planning details, warnings, and errors.

## Token Estimates

Notification token counts are rough prompt estimates used only for request planning. They include the system prompt, the user prompt wrapper, JSON block payload, placeholder-expanded Markdown, and a small chat-message overhead. They do not use the exact tokenizer for the selected model, so they will not match external token counters exactly.

The delete command removes extension-tracked outputs and private metadata. If a tracked source-folder output was edited after generation, it is skipped instead of deleted.

## Development

```sh
npm install
npm run compile
npm test
npm run package:dry
```

Debug in VS Code with `Run Extension` from `.vscode/launch.json`.

## Packaging

```sh
npm run vsix
```

The extension is authored as ESM (`"type": "module"` and `module: "NodeNext"`), compiles TypeScript to `out/`, and publishes the bundled ESM entrypoint from `dist/extension.js`.
