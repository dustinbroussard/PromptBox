# PromptBox

PromptBox is a modern prompt management Progressive Web Application (PWA) rewritten in **React 19**, **TypeScript**, and **Vite** for creating, organizing, enhancing, and exporting prompts.

## Features

- **Prompt Management**: Create, edit, delete, and organize prompts with custom tags.
- **Search & Filtering**: Real-time prompt search across titles, contents, and tags, with tag-based filtering and multi-criteria sorting (newest, oldest, alphabetical, most used).
- **Prompt Details & Clipboard**: Interactive prompt view modal with one-click copy to clipboard, tracking use count and last-used timestamp.
- **Import / Export**: Full support for single prompt and bulk prompt exports (JSON format v2) with optional AI settings, drag-and-drop import, and merge/overwrite/replace behaviors.
- **AI Prompt Lab & Enhancement**: Enhance prompts directly using OpenRouter models (with auto model fetching and free-model indicators) or generate drafts in the AI Prompt Lab.
- **AMOLED Dark & Light Themes**: Seamless theme switcher persisting user preference and syncing with system color scheme.
- **Progressive Web App**: Offline support and native install prompt integration.

## Getting Started

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Tests
```bash
npm test
```

## Security

OpenRouter API keys are stored in `localStorage`; use a restricted-privilege key and rotate it regularly.
