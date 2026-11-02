import { parentPort, workerData } from "node:worker_threads";
import {
  runWitnessJob,
  type WitnessJob,
  type WitnessParameters,
} from "./witness-job";

const parameters = workerData as WitnessParameters;
if (parentPort === null)
  throw new Error("witness-worker must run as a worker thread");
const port = parentPort;
port.on("message", (job: WitnessJob) =>
  port.postMessage(runWitnessJob(job, parameters)),
);
