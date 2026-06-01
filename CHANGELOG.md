# Changelog

All notable changes to MarkLingo are documented in this file.

## 0.0.1

- Initial release.
- Translate saved Markdown files through OpenRouter-compatible chat models.
- Preserve Markdown structure, code blocks, inline code, HTML, frontmatter, links, and image paths during translation.
- Reuse cached translations by hashing Markdown AST blocks for incremental translation.
- Store API keys in VS Code SecretStorage, separated by endpoint origin.
- Store translation metadata in VS Code private global storage, with source-folder or private-storage output options.
- Provide a custom settings webview for provider, translation, storage, target-language, and shortcut status controls.
- Include the target-language suffix in translated Markdown and metadata file names.
- Use stable custom hash suffixes when a custom target language name cannot be represented as an ASCII slug.
- Replace the global Command Palette cleanup with `MarkLingo: Delete Current Project Translated Files`; cross-project cleanup remains in the settings Danger Zone.
