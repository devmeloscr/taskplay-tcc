import { Module } from '@nestjs/common';
import { PrismaModule } from '@taskplay/api-database';
import { ObservabilityModule } from '@taskplay/api-observability';
import { StorageModule } from '@taskplay/api-storage';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TasksModule } from './tasks/tasks.module';
import { HealthController } from './health/health.controller';
import { TelemetryController } from './telemetry/telemetry.controller';
import { TelemetryService } from './telemetry/telemetry.service';

@Module({
  imports: [ObservabilityModule, PrismaModule, StorageModule, AuthModule, NotificationsModule, TasksModule],
  controllers: [HealthController, TelemetryController],
  providers: [TelemetryService],
})
export class AppModule {}
