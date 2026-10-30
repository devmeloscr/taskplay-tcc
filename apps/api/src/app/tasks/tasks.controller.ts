import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { TAMANHO_MAXIMO_BYTES, TIPOS_ACEITOS } from '@taskplay/api-storage';

interface ArquivoEnviado {
  buffer: Buffer;
  mimetype: string;
}
import { TaskStatus, UserRole } from '@taskplay/api-database';
import {
  createTaskRequest,
  reviewTaskRequest,
  submitTaskRequest,
  updateTaskRequest,
} from '@taskplay/shared-types';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { Actor } from '../auth/auth.types';
import { parseBody } from '../auth/zod-validation';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  listar(@CurrentUser() actor: Actor, @Query('status') status?: TaskStatus) {
    return this.tasks.listar(actor, status);
  }

  @Get(':id')
  obter(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.obter(actor, id);
  }

  @Post()
  @Roles(UserRole.PARENT)
  criar(@CurrentUser() actor: Actor, @Body() body: unknown) {
    return this.tasks.criar(actor, parseBody(createTaskRequest, body, 'Tarefa inválida'));
  }

  @Patch(':id')
  @Roles(UserRole.PARENT)
  atualizar(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.tasks.atualizar(actor, id, parseBody(updateTaskRequest, body, 'Ajuste inválido'));
  }

  @Post(':id/completion')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: TAMANHO_MAXIMO_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        // Lista fechada, e nao `image/*`: SVG e imagem e carrega script.
        if (!TIPOS_ACEITOS.includes(file.mimetype as (typeof TIPOS_ACEITOS)[number])) {
          cb(new BadRequestException(`Tipo de imagem não aceito: ${file.mimetype}`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  concluir(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @UploadedFile() image?: ArquivoEnviado,
  ) {
    return this.tasks.concluir(
      actor,
      id,
      parseBody(submitTaskRequest, body ?? {}, 'Conclusão inválida'),
      image ? { buffer: image.buffer, mimetype: image.mimetype } : undefined,
    );
  }

  @Get('evidences/:id/image')
  async imagemDaEvidencia(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { stream, contentType } = await this.tasks.lerImagemDaEvidencia(actor, id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store, private');
    stream.pipe(res);
  }

  /** Verificacao manual. Credita os pontos quando aprova. */
  @Post(':id/review')
  @Roles(UserRole.PARENT)
  verificar(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.tasks.verificar(actor, id, parseBody(reviewTaskRequest, body, 'Verificação inválida'));
  }

  @Post(':id/cancellation')
  @Roles(UserRole.PARENT)
  cancelar(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.cancelar(actor, id);
  }
}
