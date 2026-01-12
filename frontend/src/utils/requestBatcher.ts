// ✅ Cost Optimization: Request batching to reduce API calls
// Groups multiple similar requests into a single batch

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: any) => void;
  key: string;
};

class RequestBatcher<T> {
  private pending: Map<string, PendingRequest<T>[]> = new Map();
  private batchTimeout: number;
  private maxBatchSize: number;
  private batchFn: (keys: string[]) => Promise<Map<string, T>>;

  constructor(
    batchFn: (keys: string[]) => Promise<Map<string, T>>,
    options: { timeout?: number; maxBatchSize?: number } = {}
  ) {
    this.batchFn = batchFn;
    this.batchTimeout = options.timeout ?? 50; // 50ms default
    this.maxBatchSize = options.maxBatchSize ?? 10; // Max 10 requests per batch
  }

  async request(key: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.pending.has(key)) {
        this.pending.set(key, []);
      }
      this.pending.get(key)!.push({ resolve, reject, key });

      // If batch is full, execute immediately
      const totalPending = Array.from(this.pending.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      );
      if (totalPending >= this.maxBatchSize) {
        this.executeBatch();
      } else {
        // Otherwise, wait for timeout
        setTimeout(() => this.executeBatch(), this.batchTimeout);
      }
    });
  }

  private async executeBatch() {
    if (this.pending.size === 0) return;

    const keys = Array.from(this.pending.keys());
    const allPending = Array.from(this.pending.values()).flat();
    this.pending.clear();

    try {
      const results = await this.batchFn(keys);
      allPending.forEach(({ resolve, reject, key }) => {
        const result = results.get(key);
        if (result !== undefined) {
          resolve(result);
        } else {
          reject(new Error(`No result for key: ${key}`));
        }
      });
    } catch (error) {
      allPending.forEach(({ reject }) => reject(error));
    }
  }
}

// ✅ Cost Optimization: Request deduplication
// Prevents duplicate requests for the same resource
class RequestDeduplicator<T> {
  private pending: Map<string, Promise<T>> = new Map();

  async request(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    const promise = fn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }
}

export { RequestBatcher, RequestDeduplicator };
