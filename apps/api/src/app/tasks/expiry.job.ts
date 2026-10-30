import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from './tasks.service';

const CADENCIA = process.env['TASKS_EXPIRY_CRON'] ?? CronExpression.EVERY_30_MINUTES;
@Injectable()
export class ExpiryJob {
  constructor(
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExpiryJob.name);
  }

  @Cron(CADENCIA)
  async executar(): Promise<void> {
    try {
      const { processadas, debitado } = await this.tasks.processarVencidas();
      if (processadas > 0) {
        this.logger.info({ processadas, debitado }, 'tarefas vencidas processadas');
      }

      // A retencao das fotos anda na mesma rotina, e nao numa segunda: sao duas
      // varreduras baratas sobre indices, e um agendamento a menos para manter.
      const { excluidas, falhas } = await this.tasks.processarRetencaoDeImagens();
      if (excluidas > 0 || falhas > 0) {
        this.logger.info({ excluidas, falhas }, 'retencao de imagens aplicada');
      }

      const despacho = await this.notifications.despachar();
      if (despacho.enviadas > 0 || despacho.falhas > 0 || despacho.semAparelho > 0) {
        this.logger.info(despacho, 'notificacoes despachadas');
      }

      const recibos = await this.notifications.conferirRecibos();
      if (recibos.comErro > 0) {
        this.logger.info(recibos, 'recibos de notificacao conferidos');
      }
    } catch (erro) {
      this.logger.error({ erro }, 'falha na rotina de vencimento, retencao e notificacoes');
    }
  }
}
