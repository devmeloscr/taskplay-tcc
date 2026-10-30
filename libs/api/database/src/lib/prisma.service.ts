import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL não definida: a API não pode iniciar sem banco de dados.');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conexão com o banco de dados estabelecida');
  }

  async onModuleDestroy(): Promise<void> {
    // Encerra o pool de conexoes no shutdown, evitando que conexoes fiquem
    // penduradas no PostgreSQL a cada reinicio em desenvolvimento.
    await this.$disconnect();
    this.logger.log('Conexão com o banco de dados encerrada');
  }
}
