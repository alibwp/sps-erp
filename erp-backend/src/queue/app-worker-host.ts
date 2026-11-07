import { WorkerHost } from '@nestjs/bullmq';
import { OnApplicationBootstrap } from '@nestjs/common';
import { queueErrorListener } from './queue-errors.js';

// Base class for every queue processor: worker connection errors go to the
// app log as JSON instead of the console.
export abstract class AppWorkerHost
  extends WorkerHost
  implements OnApplicationBootstrap
{
  onApplicationBootstrap(): void {
    this.worker.on('error', queueErrorListener(`Worker ${this.worker.name}`));
  }
}
