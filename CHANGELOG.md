# Changelog

All notable changes to MarkLingo are documented in this file.

## 0.0.3

- Add editor and Explorer context-menu actions for Markdown translation.
- Add folder and Explorer multi-selection batch translation for `.md` and `.markdown` files.
- Reuse cached block translations during batch translation and open only the first successful batch output.
- Skip generated `*_mdt.md` files, `.git`, `node_modules`, and symbolic links during folder scanning.
- Simplify translation progress notifications to reduce visual noise during single-file and batch translation.
- Keep Explorer translation commands separate from the editor shortcut command so Explorer menus do not show the editor shortcut.
- Refine project cleanup UX: the Command Palette delete action now removes only current-project tracked translated Markdown files, while Settings Danger Zone handles project data and all-data cleanup.
- Add an isolated VS Code development launcher for manual extension smoke testing.
- Highlight that MarkLingo is free and open source in English, Simplified Chinese, Traditional Chinese, and Japanese README files.
- Stop uploading checksum assets to GitHub Releases.

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
