import { telemetryEvent } from '@taskplay/shared-telemetry';
import { ErroDaApi, ErroDeTransporte } from '../api/cliente';
import { eventoDeFalha, rotaGenerica } from './falhas';

const REQUEST_ID = '3f1a6f6c-2b9d-4c0e-9a4e-1a2b3c4d5e6f';
const TAREFA = '9f3e6c2a-1b4d-4a7e-8c5f-2d6b7a8c9e0f';

describe('eventoDeFalha', () => {
  it('registra a recusa da API com rota, metodo e status', () => {
    const erro = new ErroDaApi(413, 'File too large', undefined, {
      requestId: REQUEST_ID,
      caminho: `/tasks/${TAREFA}/completion`,
      metodo: 'POST',
      comArquivo: true,
    });

    expect(eventoDeFalha(erro)).toMatchObject({
      type: 'app.failed',
      origin: 'api',
      status: 413,
      route: '/tasks/:id/completion',
      method: 'POST',
      withFile: true,
      requestId: REQUEST_ID,
    });
  });

  it('registra a falha de transporte como transporte, e nao como recusa', () => {
    // A diferenca decide onde procurar: recusa tem linha no log do servidor, e
    // falha de transporte nao chegou a ter.
    const erro = new ErroDeTransporte(new TypeError('Network request failed'), {
      metodo: 'POST',
      caminho: `/tasks/${TAREFA}/completion`,
      comArquivo: true,
      requestId: REQUEST_ID,
    });

    expect(eventoDeFalha(erro)).toMatchObject({
      origin: 'transporte',
      route: '/tasks/:id/completion',
      withFile: true,
    });
    expect(eventoDeFalha(erro)).not.toHaveProperty('status');
  });

  it('nao registra 401', () => {
    expect(eventoDeFalha(new ErroDaApi(401, 'Token inválido ou expirado'))).toBeNull();
  });

  it('nao deixa vazar mensagem nem corpo da resposta', () => {
    // O evento tem campos fechados de proposito. Se um dia alguem acrescentar
    // um campo de texto livre aqui, este teste quebra - que e o ponto.
    const erro = new ErroDaApi(422, 'Pontos insuficientes para Pedro comprar o sorvete', {
      message: 'Pontos insuficientes para Pedro comprar o sorvete',
    });

    const evento = JSON.stringify(eventoDeFalha(erro));

    expect(evento).not.toMatch(/Pedro/);
    expect(evento).not.toMatch(/sorvete/);
  });

  it('nao carrega a mensagem de um defeito do proprio aplicativo', () => {
    const evento = eventoDeFalha(new RangeError('indice invalido em Pedro'));

    expect(evento).toMatchObject({ origin: 'aplicativo' });
    expect(JSON.stringify(evento)).not.toMatch(/Pedro/);
  });

  it('produz evento que o contrato compartilhado aceita', () => {
    // O catalogo e validado no servidor: um evento fora do formato seria
    // recusado no lote inteiro, e o registro se perderia calado.
    const erro = new ErroDeTransporte(new TypeError('falhou'), {
      metodo: 'GET',
      caminho: '/tasks',
      comArquivo: false,
      requestId: REQUEST_ID,
    });

    expect(telemetryEvent.safeParse(eventoDeFalha(erro)).success).toBe(true);
    expect(telemetryEvent.safeParse(eventoDeFalha(new Error('x'))).success).toBe(true);
  });
});

describe('rotaGenerica', () => {
  it('troca identificadores por marcador', () => {
    // Sem isso o log teria uma rota por tarefa, e contar quantas vezes o envio
    // de evidencia falhou viraria trabalho de expressao regular na analise.
    expect(rotaGenerica(`/tasks/${TAREFA}/completion`)).toBe('/tasks/:id/completion');
    expect(rotaGenerica(`/wallet/members/${TAREFA}`)).toBe('/wallet/members/:id');
  });

  it('descarta a query string', () => {
    expect(rotaGenerica('/tasks?status=SUBMITTED')).toBe('/tasks');
  });
});
