export type Localize = (message: string, ...args: Array<string | number | boolean>) => string;

// Keep pure translation and webview modules usable in Node tests without importing the VS Code runtime.
function formatDefaultMessage(message: string, ...args: Array<string | number | boolean>): string {
  return message.replace(/\{(\d+)\}/g, (placeholder, indexText: string) => {
    const value = args[Number(indexText)];
    return value === undefined ? placeholder : String(value);
  });
}

let localize: Localize = formatDefaultMessage;

export function initializeLocalization(nextLocalize: Localize): void {
  localize = nextLocalize;
}

export function l10n(message: string, ...args: Array<string | number | boolean>): string {
  return localize(message, ...args);
}
