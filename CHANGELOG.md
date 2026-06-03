# Changelog

All notable changes to MarkLingo are documented in this file.

## 0.0.3

- Batch translate folders from the Explorer. Right-click a folder, or multi-select Markdown files and folders, to translate source `.md` and `.markdown` files in one run.
- Keep batch translation usable while it runs. MarkLingo opens the first translated output and preview, writes the rest beside their source files, reuses cached blocks, and keeps progress notifications concise.
- Reduce translation menu clutter. Generated `*_mdt.md` outputs are skipped and hidden from translation actions, and Explorer commands no longer show the editor keyboard shortcut.
- Make project cleanup safer. The Command Palette cleanup now removes only tracked translated files for the current project; metadata/cache cleanup stays in Settings.
- Clarify in the README that MarkLingo is free and open source.

## 0.0.2

- Add multilingual README files for Simplified Chinese, Traditional Chinese, and Japanese.
- Document installation from Visual Studio Marketplace, Open VSX, and GitHub Releases.
- Add tag-driven GitHub Actions publishing to Visual Studio Marketplace and Open VSX.
- Include release VSIX checksums in GitHub Releases.

## 0.0.1

- Initial release.
- Translate saved Markdown files through OpenRouter-compatible chat models.
- Preserve Markdown structure, code blocks, inline code, HTML, frontmatter syntax, links, and image paths during translation.
- Translate selected human-facing YAML frontmatter values, such as `title` and `description`, while preserving field names, comments, delimiters, and machine-readable values.
- Reuse cached translations by hashing Markdown AST blocks for incremental translation.
- Store API keys in VS Code SecretStorage, separated by endpoint origin.
- Store translation metadata in VS Code private global storage while writing translated outputs next to the source Markdown file.
- Provide a custom settings webview for provider, translation, API key, target-language, and shortcut status controls.
- Include the target-language suffix in translated Markdown and metadata file names.
- Use stable custom hash suffixes when a custom target language name cannot be represented as an ASCII slug.
- Replace the global Command Palette cleanup with `MarkLingo: Delete Current Project Translated Files`; cross-project cleanup remains in the settings Danger Zone.
