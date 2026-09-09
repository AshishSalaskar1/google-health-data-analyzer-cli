import type { AnalyzeFilters, DatabaseInfo, HealthReport } from "../health/models";

type WorkerResponse<T> = { id: number; ok: boolean; data?: T; error?: string };

export class HealthDatabaseClient {
  private worker = new Worker(new URL("./health.worker.ts", import.meta.url), { type: "module" });
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse<unknown>>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.data);
      else pending.reject(new Error(response.error ?? "Database processing failed."));
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "The database worker stopped unexpectedly.");
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
    };
  }

  load(file: File): Promise<DatabaseInfo> {
    return file.arrayBuffer().then((bytes) => this.request<DatabaseInfo>("load", { bytes, fileName: file.name }, [bytes]));
  }

  analyze(filters: AnalyzeFilters): Promise<HealthReport> {
    return this.request<HealthReport>("analyze", filters);
  }

  dispose(): void {
    this.worker.terminate();
  }

  private request<T>(type: string, payload: unknown, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, type, payload }, transfer);
    });
  }
}
