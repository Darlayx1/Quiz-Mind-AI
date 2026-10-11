// Bound the entire operation, including session lookup before network dispatch.
export function withSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    const cleanup = () => signal.removeEventListener('abort', abort);
    operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

export function storageError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return 'Pemuatan penyimpanan melewati batas waktu. Periksa koneksi lalu coba muat ulang.';
    if (error.message) return error.message;
  }
  return 'Penyimpanan belum berhasil dimuat. Silakan coba muat ulang.';
}
