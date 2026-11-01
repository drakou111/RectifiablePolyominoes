import { parentPort, workerData } from "node:worker_threads";
import {
  runSquaresJob,
  type SquaresJob,
  type SquaresParameters,
} from "./squares-job";

const parameters = workerData as SquaresParameters;
if (parentPort === null)
  throw new Error("squares-worker must run as a worker thread");
const port = parentPort;
port.on("message", (job: SquaresJob) =>
  port.postMessage(runSquaresJob(job, parameters)),
);
