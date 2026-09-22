import { Worker } from 'node:worker_threads';
import { UPLOAD_LIMITS } from './upload-source.mjs';
import { IngestionError, errorResponse } from './ingestion-policy.mjs';

let active = 0;
export function scanUpload(input, referenceIndex, { timeoutMs = UPLOAD_LIMITS.maxProcessingMs } = {}) {
  if (active >= 2) return Promise.resolve(errorResponse(new IngestionError('SCAN_BUSY', 'The scanner is busy. Try again shortly.', 429)));
  // A main-thread timer cannot interrupt synchronous matching. Terminate the
  // worker on timeout: https://nodejs.org/api/worker_threads.html#workerterminate
  return new Promise(resolve => {
    let timer;
    const worker = new Worker(new URL('./upload-worker.mjs', import.meta.url), {
      workerData: { input, referenceIndex }, resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    active++;
    let finished = false;
    const finish = async result => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      await worker.terminate(); active--; resolve(result);
    };
    worker.once('message', finish);
    worker.once('error', () => finish(errorResponse(new Error())));
    worker.once('exit', () => { if (!finished) finish(errorResponse(new Error())); });
    timer = setTimeout(() => finish(errorResponse(new IngestionError('PROCESSING_TIMEOUT', 'Project processing timed out. Upload a smaller project.', 408))), timeoutMs);
  });
}
