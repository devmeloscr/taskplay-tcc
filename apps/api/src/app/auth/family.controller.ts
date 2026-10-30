import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@taskplay/api-database';
import {
  createMemberRequest,
  revokeConsentRequest,
  updateMemberRequest,
} from '@taskplay/shared-types';
import { AuthService } from './auth.service';
import { ConsentimentoService } from './consentimento.service';
import { MembrosService } from './membros.service';
import { RegistroDaFamiliaService } from './registro-da-familia.service';
import { CurrentUser, Roles } from './auth.decorators';
import type { Actor } from './auth.types';
import { parseBody } from './zod-validation';

@Controller('family')
export class FamilyController {
  constructor(
    private readonly auth: AuthService,
    private readonly membros: MembrosService,
    private readonly registro: RegistroDaFamiliaService,
    private readonly consentimento: ConsentimentoService,
  ) {}

  @Get('me')
  me(@CurrentUser() actor: Actor) {
    return this.auth.me(actor);
  }

  @Get('members')
  listMembers(@CurrentUser() actor: Actor) {
    return this.auth.listMembers(actor);
  }

  @Get('members/managed')
  @Roles(UserRole.PARENT)
  listManagedMembers(@CurrentUser() actor: Actor) {
    return this.membros.listar(actor);
  }

  @Post('members')
  @Roles(UserRole.PARENT)
  createMember(@CurrentUser() actor: Actor, @Body() body: unknown) {
    return this.membros.criar(
      actor,
      parseBody(createMemberRequest, body, 'Cadastro inválido'),
    );
  }

  @Patch('members/:id')
  @Roles(UserRole.PARENT)
  updateMember(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.membros.atualizar(
      actor,
      id,
      parseBody(updateMemberRequest, body, 'Alteração inválida'),
    );
  }

  @Post('members/:id/enrollment')
  @Roles(UserRole.PARENT)
  createEnrollment(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.createEnrollment(actor, id);
  }

  @Delete('members/:id')
  @Roles(UserRole.PARENT)
  removeMember(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.membros.remover(actor, id);
  }

  @Post('members/:id/restoration')
  @Roles(UserRole.PARENT)
  @HttpCode(200)
  restoreMember(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.membros.restaurar(actor, id);
  }

  @Get('audit')
  @Roles(UserRole.PARENT)
  listAudit(@CurrentUser() actor: Actor) {
    return this.registro.listar(actor);
  }

  @Delete()
  @Roles(UserRole.PARENT)
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  revogarConsentimento(@CurrentUser() actor: Actor, @Body() body: unknown) {
    const { password, pin } = parseBody(
      revokeConsentRequest,
      body,
      'Revogação inválida: confirme com a senha, o PIN e o texto exato',
    );
    return this.consentimento.revogar(actor, password, pin);
  }
}
