import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ExpiryJob } from './expiry.job';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [TasksController, StoreController, WalletController],
  providers: [TasksService, StoreService, WalletService, TelemetryService, ExpiryJob],
  exports: [TasksService, StoreService, WalletService],
})
export class TasksModule {}
