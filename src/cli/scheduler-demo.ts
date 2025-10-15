/**
 * Scheduler demo CLI application
 */

import { Module } from './module';

class SchedulerDemo {
  private module: Module;

  constructor() {
    this.module = new Module();
  }

  run(): void {
    console.log('Running scheduler demo');
    this.module.execute();
  }
}

const demo = new SchedulerDemo();
demo.run();
