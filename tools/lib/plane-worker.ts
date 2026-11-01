import { parentPort, workerData } from "node:worker_threads";
import { runPlaneJob, type PlaneJob, type PlaneParameters } from "./plane-job";

const parameters = workerData as PlaneParameters;
if (parentPort === null)
  throw new Error("plane-worker must run as a worker thread");
const port = parentPort;
port.on("message", (job: PlaneJob) =>
  port.postMessage(runPlaneJob(job, parameters)),
);
