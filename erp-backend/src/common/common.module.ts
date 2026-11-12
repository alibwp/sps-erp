import { Global, Module } from '@nestjs/common';
import { Clock } from './clock/clock.js';

@Global()
@Module({
  providers: [Clock],
  exports: [Clock],
})
export class CommonModule {}
