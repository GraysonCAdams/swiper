# Swiper for Obsidian

On iPhone, swipe right/left on a line to indent/dedent. That’s it.

## Features

- Swipe right: indent current line
- Swipe left: dedent current line
- iPhone-only; no effect on desktop or iPad/Android

## Installation

### Manual

1. Build the plugin:
   ```bash
   npm install
   npm run build
   ```
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault:
   - `.obsidian/plugins/swiper/`
3. In Obsidian, enable the plugin in Community Plugins.

## Development

```bash
git clone https://github.com/GraysonCAdams/swiper.git
cd swiper
npm install
npm run dev
```

## Usage

- Open a note on iPhone and swipe horizontally across the line you want to change.
- Fast horizontal swipes indent/dedent; vertical motion cancels the gesture.

## License

MIT — see `LICENSE`.
