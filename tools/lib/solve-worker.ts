import { parentPort, workerData } from "node:worker_threads";
import { runJob, type SolveJob, type SolveParameters } from "./solve-job";

const parameters = workerData as SolveParameters;
if (parentPort === null)
  throw new Error("solve-worker must run as a worker thread");
const port = parentPort;
port.on("message", (job: SolveJob) =>
  port.postMessage(runJob(job, parameters)),
);
