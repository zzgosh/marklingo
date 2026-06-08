export class ConfigurationRegistryRefreshRequired extends Error {
  constructor(readonly settingKey?: string) {
    super(getConfigurationRegistryRefreshMessage(settingKey));
    this.name = 'ConfigurationRegistryRefreshRequired';
  }
}

export function getConfigurationRegistryRefreshMessage(settingKey?: string): string {
  const settingDetail = settingKey ? `, so "${settingKey}" cannot be written yet` : '';
  return `VS Code has not refreshed MarkLingo's settings schema after the VSIX update${settingDetail}. Reload this VS Code window and reopen MarkLingo Settings. If the issue persists, quit all VS Code windows and reopen VS Code.`;
}

export function isConfigurationRegistryRefreshRequired(error: unknown): error is ConfigurationRegistryRefreshRequired {
  return error instanceof ConfigurationRegistryRefreshRequired;
}
