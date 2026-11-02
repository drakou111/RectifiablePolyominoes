import { parentPort, workerData } from "node:worker_threads";
import {
  runColorsJob,
  type ColorsJob,
  type ColorsParameters,
} from "./colors-job";

const parameters = workerData as ColorsParameters;
if (parentPort === null)
  throw new Error("colors-worker must run as a worker thread");
const port = parentPort;
port.on("message", (job: ColorsJob) =>
  port.postMessage(runColorsJob(job, parameters)),
);
