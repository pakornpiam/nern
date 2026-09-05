(function (root) {
  'use strict';
  function run(action, input, { signal, progress = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
      const worker = new Worker('geometry-worker.mjs', { type: 'module' });
      const finish = (error, result) => {
        worker.terminate(); signal?.removeEventListener('abort', cancel);
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => finish(new DOMException('Cancelled', 'AbortError'));
      signal?.addEventListener('abort', cancel, { once: true });
      worker.onmessage = ({ data }) => {
        if (data.progress) progress(data.progress.key, data.progress.params);
        else if (data.error) finish(new Error(data.error));
        else finish(null, data.result);
      };
      worker.onerror = () => finish(new Error('errGeometryWorker'));
      worker.postMessage({ action, ...input });
    });
  }
  root.TopoWorker = { run };
})(globalThis);
