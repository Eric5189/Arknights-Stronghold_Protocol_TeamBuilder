# Browser OCR assets

These assets are served locally and loaded only when screenshot recognition starts.

- `tesseract.min.js`, `worker.min.js`: Tesseract.js 6.0.1, from the npm package `tesseract.js@6.0.1`.
- `core/`: Tesseract.js-core 6.1.2, from the dependency installed with Tesseract.js. All four WASM variants are included for browser compatibility.
- `lang/chi_sim.traineddata.gz`: Simplified Chinese fast model, downloaded from `https://tessdata.projectnaptha.com/4.0.0_fast/chi_sim.traineddata.gz`.
- License and bundled third-party notices are preserved beside the assets. Tesseract and its language data use Apache-2.0; see `core/LICENSE` and `LICENSE-tesseract.js.md`.

References: https://github.com/naptha/tesseract.js and https://github.com/tesseract-ocr/tessdata_fast.

Keep this entire directory when deploying to GitHub Pages. Runtime worker, core and language paths are explicitly local; screenshot pixels are processed in the browser, not sent to a server. A page load does not preload the large OCR assets. Browser caching can reuse model data, but this does not by itself make the entire site offline-capable.
