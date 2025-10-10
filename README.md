# GONG

A tiny static site that synthesizes a gong sound using the Web Audio API.

Files added:

- `index.html` - main page and UI
- `css/style.css` - styling
- `js/gong.js` - Web Audio gong synthesizer and UI wiring

How to use

1. Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).
	- For the best experience, serve the directory with a static server instead of double-clicking the file.

2. Click the "Strike" button or press Space / Enter to play the gong. Adjust volume, tone, and dampening.

Quick local server (Python 3) — run in the project root:

```fish
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Notes

- The gong is synthesized — no audio files are bundled.
- If audio doesn't play on first interaction, click/tap the page to
  unlock audio on some mobile browsers.

Nix flake

This repository includes a `flake.nix` with a convenient `defaultApp` and `devShell`.

- Start the dev server with:

```fish
# run this from the project root and open http://localhost:8000
nix run
```
