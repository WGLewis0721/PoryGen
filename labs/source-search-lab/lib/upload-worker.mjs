import { parentPort, workerData } from 'node:worker_threads';
import { ingestUpload } from './upload-source.mjs';
import { scanIngestedSource } from './scan-service.mjs';
import { errorResponse } from './ingestion-policy.mjs';

try {
  const started = Date.now();
  const source = await ingestUpload(workerData.input);
  const result = scanIngestedSource(source, workerData.referenceIndex, started);
  // Provider exception strings must never reflect uploaded source back into logs/errors.
  result.payload.scan.providerErrors = result.payload.scan.providerErrors.map(({ file }) => ({ file, message: 'Source comparison failed.' }));
  parentPort.postMessage(result);
} catch (error) { parentPort.postMessage(errorResponse(error)); }
