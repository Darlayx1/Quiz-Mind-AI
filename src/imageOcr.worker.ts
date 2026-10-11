import { createWorker } from 'tesseract.js';

// A disposable outer worker lets removal, workspace changes, and timeouts stop
// OCR even while Tesseract is still initializing its nested worker/languages.
self.addEventListener('message', async (event: MessageEvent<{ blob: Blob; assetBase: string }>) => {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const { blob, assetBase } = event.data;
    worker = await createWorker('eng+ind', 1, {
      workerPath: assetBase + 'worker.min.js', workerBlobURL: false,
      corePath: assetBase + 'tesseract-core-lstm.js', langPath: assetBase, cacheMethod: 'none', errorHandler: () => {},
    });
    const result = await worker.recognize(blob);
    self.postMessage({ text: result.data.text, confidence: result.data.confidence });
  } catch {
    self.postMessage({ error: 'Gambar belum dapat dibaca. Gunakan gambar lebih jelas atau tempel transkripsi teks.' });
  } finally { if (worker) await worker.terminate(); self.close(); }
});
