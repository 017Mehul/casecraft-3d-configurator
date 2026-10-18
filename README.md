# CaseCraft — 3D Configurator

Premium suitcase customizer concept built with HTML, CSS, JavaScript and Three.js.

## Run locally
Serve this folder from a local HTTP server (Three.js uses ES modules and an import map). For example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Files
- `index.html` — storefront, configurator UI, and demo cart/checkout modals
- `theme.css` — site styling, responsive layouts, and design tokens
- `quote.css` — viewer controls and quotation modal styling
- `app.js` — Three.js scene, suitcase configurator, pricing and mock cart logic
- `quote.js` — downloadable quotation and mailto inquiry demo

## Notes
Prices, stock, delivery estimates, reviews, and warranty/return statements are illustrative portfolio content. Cart and checkout run locally in the browser and do not process payments or create real orders.

The current Three.js model is the in-project model. The exact model from `cabin-case.html` remains a follow-up integration task.
