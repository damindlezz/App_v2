/**
 * Führt asynchrone Aufgaben strikt nacheinander aus.
 * Ein Fehler blockiert nachfolgende Aufgaben nicht.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async whenIdle(): Promise<void> {
    await this.tail;
  }
}
