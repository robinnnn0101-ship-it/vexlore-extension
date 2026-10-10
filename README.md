# VEXLORE Extension

Cute & fast **Chrome / Edge side panel** for token research.

Paste a Solana CA, Robinhood 0x, Arc address, or GitHub link → get **OG / Vamp, holders, dev history & lore** without leaving the tab.

**Version:** 1.4.6  

**Live on:**
- [Chrome Web Store](https://chromewebstore.google.com/detail/vexlore/gmkphgphoojhkfolahlbfinlaginlkfi)
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/vexlore/hfncghionejcphdjeekjcbfjoebimjhn)

---

## Features

- **Side panel** – stays open while you browse
- **Auto-detect** – copies a CA / 0x and the panel notices it
- **Multi-chain** – Solana, Robinhood Chain, Arc
- **One sheet** – OG vs cluster, Vamp check, Holders, Dev, Lore
- **DexScreener image + banner** shown inside the panel
- **GitHub scan** – drop a repo link for quick red-flag check
- **Optional keys** – add your own Solana Tracker / GitHub token in Settings for deeper data
- **No account required** – core OG check stays free

Deeper Solana bundles + full wallet analyser live in the Telegram bot: [t.me/VexloreBOT](https://t.me/VexloreBOT)

---

## How to use

1. Install from Chrome Web Store or Edge Add-ons
2. Click the VEXLORE icon → open the side panel
3. Paste a CA, 0x address, or GitHub link (or just copy one)
4. Read the full sheet

---

## Local development / Load unpacked

1. Open `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this folder

---

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 config |
| `sidepanel.html` + `sidepanel.js` | Main side-panel UI & logic |
| `popup.html` + `popup.js` | Toolbar popup |
| `background.js` | Service worker |
| `icon.jpg` | Extension icon |

---

## Permissions

- `sidePanel` – shows the persistent panel
- `storage` – saves your optional API keys
- `clipboardRead` – auto-detects copied addresses
- Host permissions only for public data sources (DexScreener, Pump.fun, GeckoTerminal, Blockscout, GitHub, Solana Tracker, etc.)

No personal data is collected.

---

## Links

| | |
|---|---|
| Website | [vexlore.xyz](https://vexlore.xyz) |
| Telegram bot | [t.me/VexloreBOT](https://t.me/VexloreBOT) |
| Support | [t.me/vexloresupport](https://t.me/vexloresupport) |
| Community | [t.me/VEXLORECOMM](https://t.me/VEXLORECOMM) |
| X | [@Vexlorebot](https://x.com/Vexlorebot) |
| Bot source | [VexloreBot](https://github.com/robinnnn0101-ship-it/VexloreBot) |

Made by Robin with Love ❤️
