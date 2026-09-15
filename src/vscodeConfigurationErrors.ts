import { l10n } from './localization.js';

export class ConfigurationRegistryRefreshRequired extends Error {
  constructor(readonly settingKey?: string) {
    super(getConfigurationRegistryRefreshMessage(settingKey));
    this.name = 'ConfigurationRegistryRefreshRequired';
  }
}

export function getConfigurationRegistryRefreshMessage(settingKey?: string): string {
  return settingKey
    ? l10n(
        'VS Code has not refreshed MarkLingo\'s settings schema after the VSIX update, so "{0}" cannot be written yet. Reload this VS Code window and reopen MarkLingo Settings. If the issue persists, quit all VS Code windows and reopen VS Code.',
        settingKey,
      )
    : l10n(
        'VS Code has not refreshed MarkLingo\'s settings schema after the VSIX update. Reload this VS Code window and reopen MarkLingo Settings. If the issue persists, quit all VS Code windows and reopen VS Code.',
      );
}

export function isConfigurationRegistryRefreshRequired(error: unknown): error is ConfigurationRegistryRefreshRequired {
  return error instanceof ConfigurationRegistryRefreshRequired;
}

export function getConfigurationRegistryReloadAction(): string {
  return l10n('Reload Window');
}
