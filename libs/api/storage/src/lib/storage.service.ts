import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import { loadStorageConfig, type StorageConfig } from './storage.config';
import { montarChave, prefixoDaFamilia } from './chave';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly config: StorageConfig;
  private readonly client: Client;

  constructor() {
    this.config = loadStorageConfig();
    this.client = new Client({
      endPoint: this.config.endPoint,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    });
  }

  async onModuleInit(): Promise<void> {
    const existe = await this.client.bucketExists(this.config.bucket);
    if (!existe) {
      await this.client.makeBucket(this.config.bucket);
    }
  }

  get retencao(): { aposVerificacaoDias: number; maximaDias: number } {
    return {
      aposVerificacaoDias: this.config.retencaoAposVerificacaoDias,
      maximaDias: this.config.retencaoMaximaDias,
    };
  }

  /** Guarda a foto e devolve a chave sob a qual ela ficou. */
  async guardarEvidencia(
    familyId: string,
    taskId: string,
    conteudo: Buffer,
    contentType: string,
  ): Promise<string> {
    const chave = montarChave(familyId, taskId, contentType);
    await this.client.putObject(this.config.bucket, chave, conteudo, conteudo.length, {
      'Content-Type': contentType,
    });
    return chave;
  }

  /** Le a foto. Quem chama ja verificou que o ator pode ve-la. */
  async lerEvidencia(chave: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    const info = await this.client.statObject(this.config.bucket, chave);
    const stream = await this.client.getObject(this.config.bucket, chave);
    return {
      stream,
      contentType: info.metaData?.['content-type'] ?? 'application/octet-stream',
    };
  }

  async apagarEvidencia(chave: string): Promise<void> {
    await this.client.removeObject(this.config.bucket, chave);
  }

  async apagarFamilia(familyId: string): Promise<number> {
    const prefixo = prefixoDaFamilia(familyId);
    const chaves: string[] = [];

    const fluxo = this.client.listObjectsV2(this.config.bucket, prefixo, true);
    for await (const objeto of fluxo) {
      if (objeto.name) chaves.push(objeto.name);
    }

    if (chaves.length > 0) {
      await this.client.removeObjects(this.config.bucket, chaves);
    }
    return chaves.length;
  }
}
