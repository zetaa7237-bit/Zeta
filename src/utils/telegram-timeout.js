export function limitTelegramRequests(client, timeoutMs) {
  const callApi = client.callApi.bind(client);
  client.callApi = async (method, payload, options = {}) => {
    const controller = new AbortController(); const parent = options.signal;
    const abort = () => controller.abort();
    if (parent?.aborted) controller.abort(); else parent?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, method === 'getUpdates' ? 65000 : timeoutMs); timer.unref();
    try { return await callApi(method, payload, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); parent?.removeEventListener('abort', abort); }
  };
}
