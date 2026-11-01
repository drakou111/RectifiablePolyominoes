import { Worker } from "node:worker_threads";

/** Runs jobs on worker threads, `workerCount` at a time, reporting progress every `every` results. */
export async function runPool<Job, Outcome>(
  bootstrap: URL,
  workerData: unknown,
  jobs: readonly Job[],
  workerCount: number,
  every = 200,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  const started = Date.now();
  let next = 0;
  await new Promise<void>((resolve, reject) => {
    let running = 0;
    const count = Math.min(workerCount, jobs.length);
    if (count === 0) resolve();
    for (let w = 0; w < count; w++) {
      const worker = new Worker(bootstrap, { workerData });
      running++;
      const feed = (): void => {
        const job = jobs[next++];
        if (job === undefined) {
          void worker.terminate();
          if (--running === 0) resolve();
          return;
        }
        worker.postMessage(job);
      };
      worker.on("message", (outcome: Outcome) => {
        outcomes.push(outcome);
        if (outcomes.length % every === 0 || outcomes.length === jobs.length)
          console.log(
            `${outcomes.length}/${jobs.length} done, ${((Date.now() - started) / 1000).toFixed(0)} s`,
          );
        feed();
      });
      worker.on("error", reject);
      feed();
    }
  });
  return outcomes;
}
