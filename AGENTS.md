# Repository Notes

## Project Overview

This repository contains a VS Code extension named `MarkLingo`. It translates saved Markdown documents through OpenRouter-compatible chat models while preserving Markdown structure, protected syntax, links, image paths, code, HTML, and frontmatter.

The extension is authored in TypeScript as native ESM:

- Source: `src/`
- TypeScript output: `out/`
- Bundled extension entrypoint: `dist/extension.js`
- Published entrypoint: `package.json` `main: ./dist/extension.js`

Do not edit generated `out/` or `dist/` files manually. Use the package scripts.

## Commands

- `npm run compile`: type-check and compile TypeScript into `out/`.
- `npm test`: compile, then run Node test files under `test/**/*.test.js`.
- `npm run check`: compile and run tests.
- `npm run test:vscode`: build the extension, launch an isolated VS Code Extension Host, and run integration tests under `test/integration/`.
- `npm run check:integration`: run `npm run check`, then `npm run test:vscode`.
- `npm run benchmark:postprocessing`: run the local Markdown postprocessing benchmark.
- `npm run package`: compile and bundle `dist/extension.js`.
- `npm run package:dry`: build the extension and list VSIX contents.
- `npm run vsix`: run checks, then create the `.vsix` package.

For code changes, run at least `npm run check`. For extension-host behavior, storage, command, SecretStorage, or OpenRouter request-flow changes, also run `npm run test:vscode`. For packaging or VSIX-related changes, run `npm run package:dry` or `npm run vsix`.

## Main Architecture

- `src/extension.ts` registers VS Code commands.
- `src/commands/translateCurrentMarkdown.ts` owns the translation workflow: validation, target-language selection, segmentation, cache reuse, request planning, OpenRouter calls, output assembly, metadata writing, and Markdown preview.
- `src/services/openRouterClient.ts` handles OpenRouter settings, endpoint validation, per-origin SecretStorage API keys, model-context lookup, and chat completions.
- `src/translation/segmenter.ts` splits Markdown into stable translatable blocks.
- `src/translation/placeholders.ts` protects URLs, image paths, code, HTML, YAML, and other sensitive Markdown syntax before sending text to the model.
- `src/translation/requestPlanner.ts` estimates prompt size and splits requests by model context budget when available.
- `src/translation/modelOutput.ts` normalizes model block output. It accepts a translated block as either a string or an array of strings.
- `src/translation/blockResults.ts` restores placeholders and falls back to the source block if one block is malformed, so one damaged model output does not fail the whole document.
- `src/translation/cache.ts` defines metadata, hashing, deletion detection, and debug metadata.
- `src/storage/paths.ts` chooses source-folder output or VS Code private global storage output.
- `src/webview/settingsPanel.ts` renders the custom settings webview.

## Storage And Privacy

API keys must only use VS Code `SecretStorage`. Keys are separated by endpoint origin. Do not store API keys in workspace settings, metadata, logs, or debug output.

Translation metadata lives under VS Code private global storage through `context.globalStorageUri`, not in the workspace. It stores source block hashes, source blocks, cached translated blocks, output hashes, and structured debug metadata. Source-folder output may still write a visible `*_mdt.md` next to the source Markdown when `marklingo.storage.outputLocation` is `sourceFolder`.

The delete command should delete only extension-tracked outputs and private metadata. If a source-folder output was edited after generation, it should be skipped instead of deleted.

## Metadata Debug Field

`TranslationMetaV1.debug` is intended for diagnosis without leaking secrets. It records:

- run id, status, start/end timestamps, and duration
- extension id, extension version, and extension mode
- VS Code app name, VS Code version, UI kind, remote name, and workspace folder count
- document language, line count, source size, source hash, segment counts, cache hits, and blocks to translate
- non-secret settings such as base URL, model ID, target language, output location, request shape, reasoning exclusion, and prompt hashes
- request plan, chunk counts, estimated prompt tokens, request duration, and request status
- warnings, errors, and concise event messages

Do not add raw API keys, full prompt text, full OpenRouter responses, or duplicate full source/translated document snapshots to `debug`. The normal cache already stores source blocks and translated blocks.

On translation failure, preserve existing cache metadata when possible and update only `debug`, so one failed run does not wipe incremental-translation state.

## Prompt And Token Estimation

The notification label uses `estimated prompt tokens` intentionally. This is a rough local estimate for request planning, not a model-specific tokenizer result.

The estimate includes the system prompt, user prompt wrapper, JSON block payload, placeholder-protected Markdown, and fixed chat overhead. It only covers blocks being sent in the current request, so it will not match an external tokenizer run over the raw Markdown file.

## User-Facing Copy

Use English for extension UI, notifications, command prompts, Output Channel messages, errors, README text, tests, and comments. Language option labels may remain in their native language, for example `简体中文` and `日本語`.

The custom language option label is `Custom...`.

## VSIX Testing Notes

After installing a VSIX into an already-open VS Code window, reload the window with `Developer: Reload Window` before retesting. The extension host may keep running the previous extension code until reload.

When installing a VSIX from a terminal, verify the `code` binary actually targets Visual Studio Code. Some local machines may alias or symlink `code` to another editor such as Cursor. The VS Code app-bundled CLI is:

```sh
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension ./marklingo-0.0.1.vsix --force
```

## Integration Testing Notes

The VS Code integration test runner uses `@vscode/test-electron`, a temporary workspace under `.vscode-test/workspace`, a temporary user data directory, and a local mock OpenRouter server. It must not use the developer's real VS Code profile, installed VSIX settings, or real OpenRouter API key.

Test-only commands are registered only when `context.extensionMode === vscode.ExtensionMode.Test`. Keep them out of `package.json` `contributes.commands` so normal users cannot discover them from the Command Palette.

## Development Constraints

Keep the extension ESM-compatible. Preserve `package.json` `type: module`, TypeScript `module: NodeNext`, and the esbuild ESM bundle path unless the release strategy is intentionally changed.

Keep API boundary inputs explicit and validated: URLs, model output JSON, model block values, file paths, and user configuration should fail clearly or fall back in a documented way.

Prefer focused tests under `test/` for translation planning, prompt behavior, placeholder protection, model-output normalization, and block fallback behavior.
