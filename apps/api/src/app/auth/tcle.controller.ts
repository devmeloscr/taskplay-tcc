import { Controller, Get } from '@nestjs/common';
import type { TcleDocument } from '@taskplay/shared-types';
import { Public } from './auth.decorators';
import { TCLE_VIGENTE } from './tcle';

@Controller('tcle')
export class TcleController {
  @Get()
  @Public()
  vigente(): TcleDocument {
    return TCLE_VIGENTE;
  }
}
