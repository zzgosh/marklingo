# shadcn/ui Integration Guide (crk-next)

shadcn/ui is not a typical dependency-only component library. The CLI copies component source code into your repo (for example `src/components/ui/*`), so you can fully customize it.

---

## Prerequisites

The current `webview-ui` is expected to have:

- React 18
- Vite 6
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- TypeScript

---

## 1) Install dependencies

Run this command in `webview-ui/`:

```bash
cd webview-ui

# Base utilities used by shadcn/ui components
npm install class-variance-authority clsx tailwind-merge lucide-react tw-animate-css

# Types for node:path used by Vite config (TypeScript)
npm install -D @types/node
```

---

## 2) Configure path aliases

This enables imports like `@/components/ui/button`.

### 2.1) Update `webview-ui/tsconfig.json`

Add `baseUrl` and `paths`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 2.2) Update `webview-ui/vite.config.ts`

Add `resolve.alias`:

```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../media/webview-ui"),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "src/main.tsx"),
      name: "CoderiderWebviewUI",
      formats: ["iife"],
      fileName: () => "index.js",
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "index.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
```

---

## 3) Add the `cn` helper

Create `webview-ui/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 4) Add `components.json`

Create `webview-ui/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Notes:

- For Tailwind v4, keep `tailwind.config` empty.
- `tailwind.cssVariables` cannot be changed later without reinstalling the generated components.

---

## 5) Theme tokens (CSS variables)

Update `webview-ui/src/index.css` to include the shadcn/ui design tokens.

Core idea:

- Use shadcn/ui tokens (`--background`, `--foreground`, ...) as the single source of truth.
- Map shadcn/ui tokens to VS Code theme variables (`--vscode-*`) so the UI follows the active theme automatically.

Important caveats for VS Code Webview:

- Do not re-declare VS Code variables like `--vscode-sideBar-background`. They are already injected by VS Code; redeclaring them as `var(--vscode-sideBar-background)` is a no-op and can cause confusing computed results.
- If you map tokens directly to `--vscode-*`, you usually do not need a `.dark` class at all because VS Code updates `--vscode-*` values when the theme changes.
- If you still want a `.dark` fallback, VS Code will not add `.dark` automatically. You must toggle it yourself (for example, based on webview `body` classes like `vscode-dark` / `vscode-light`, or based on the `themeChange` message sent by the extension host).

Example:

```css
@import "tailwindcss";
@import "tw-animate-css";

:root {
  --crk-button-border: color-mix(
    in oklab,
    var(--vscode-foreground) 16%,
    transparent
  );
}

:root {
  --radius: 0.5rem;

  /* Base surface and text */
  --background: var(--vscode-sideBar-background, oklch(1 0 0));
  --foreground: var(--vscode-sideBar-foreground, oklch(0.145 0 0));

  /* Card */
  --card: var(--vscode-editor-background, oklch(1 0 0));
  --card-foreground: var(--vscode-editor-foreground, oklch(0.145 0 0));

  /* Popover / floating surfaces */
  --popover: var(--vscode-editorWidget-background, oklch(1 0 0));
  --popover-foreground: var(--vscode-editorWidget-foreground, oklch(0.145 0 0));

  /* Primary action */
  --primary: var(--vscode-button-background, oklch(0.205 0 0));
  --primary-foreground: var(--vscode-button-foreground, oklch(0.985 0 0));

  /* Secondary action */
  --secondary: var(--vscode-button-secondaryBackground, oklch(0.97 0 0));
  --secondary-foreground: var(
    --vscode-button-secondaryForeground,
    oklch(0.205 0 0)
  );

  /* Muted */
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);

  /* Accent */
  --accent: var(--vscode-focusBorder, oklch(0.97 0 0));
  --accent-foreground: oklch(0.205 0 0);

  /* Destructive */
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);

  /* Borders and focus rings
     In shadcn/ui, `--input` is a border color token (used by `border-input`),
     not the input background color. */
  --border: var(--vscode-input-border, oklch(0.922 0 0));
  --input: var(--vscode-input-border, oklch(0.922 0 0));
  --ring: var(--vscode-focusBorder, oklch(0.708 0 0));
}

/* Optional fallback if you toggle `.dark` yourself */
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.269 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.371 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
}

/* Expose CSS variables to Tailwind */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

#root {
  width: 100%;
  height: 100%;
}

* {
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: var(
    --vscode-font-family,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif
  );
}
```

---

## 6) Create directories

Ensure the following paths exist:

```
webview-ui/src/
├── components/
│   └── ui/          # shadcn/ui components will be generated here
├── lib/
│   └── utils.ts     # cn helper
└── hooks/           # your custom hooks
```

---

## 7) Add components

Add components using the shadcn CLI:

```bash
cd webview-ui

npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add select
npx shadcn@latest add dialog
```

Components will be generated under `src/components/ui/`.

---

## 8) Use components

Example usage:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function App() {
  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Button>Click me</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
```

---

## VS Code Webview notes

### Theme synchronization

- Prefer mapping shadcn tokens to VS Code CSS variables (`--vscode-*`) so the theme updates automatically.
- If you rely on `.dark`, you must toggle it yourself (VS Code does not add `.dark` automatically).

### Content Security Policy (CSP)

Some UI primitives may rely on inline styles (for example popovers and portals). If you tighten the CSP, verify those components still render correctly. This project currently allows inline styles via `style-src ... 'unsafe-inline'`.

---

## Build verification

```bash
cd webview-ui
npm run build
```

Then start the extension (F5) and reload the webview.

---

## Troubleshooting

### Styles are not applied

1. Ensure `@import "tailwindcss";` is at the top of `src/index.css`.
2. Ensure `@theme inline { ... }` maps the required tokens.
3. Ensure the built CSS is included by the webview HTML shell.

### `@/components/ui/*` cannot be resolved

1. Confirm `webview-ui/tsconfig.json` has `baseUrl` and `paths`.
2. Confirm `webview-ui/vite.config.ts` has `resolve.alias`.
3. Restart the TypeScript server / reload the VS Code window.

---

## References

- https://ui.shadcn.com/
- https://tailwindcss.com/docs
- https://vite.dev/config/
