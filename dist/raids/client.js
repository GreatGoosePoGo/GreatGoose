/* Local RPC bridge. Heavy calculations run in a dedicated module worker. */
(() => {
  let worker, sequence = 0;
  const pending = new Map();
  function failAll(message) {
    for (const {reject} of pending.values()) reject(new Error(message));
    pending.clear();worker?.terminate();worker = undefined;
  }
  function connect() {
    if (worker) return worker;
    if (location.protocol === 'file:') throw new Error('Run npm start and open http://localhost:8000 to load the website.');
    worker = new Worker(new URL('engine-a63b7d5fe155/worker.js', document.baseURI), {type:'module'});
    worker.onmessage = ({data}) => {
      const job = pending.get(data.id);if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
    };
    worker.onerror = () => failAll('The calculation worker stopped. Retry the calculation, or restore your saved battle.');
    worker.onmessageerror = () => failAll('The calculation worker returned unreadable data.');
    return worker;
  }
  globalThis.RaidClient = {
    request(method,payload = {}) {
      return new Promise((resolve,reject) => {
        try {
          const current = connect(), id = ++sequence;
          pending.set(id,{resolve,reject});
          try { current.postMessage({id,method,payload}); }
          catch(error) { pending.delete(id);reject(error); }
        } catch(error) { reject(error); }
      });
    },
  };
})();
