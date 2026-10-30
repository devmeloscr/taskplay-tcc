import { apiTarefas, ErroDaApi, ErroDeTransporte, textoDaFalha } from './cliente';

const mockUpload = jest.fn();
const mockFile = jest.fn();

// `File` do `expo-file-system` e uma classe nativa: sem simular o modulo, o
// teste exercitaria o bridge, que nao existe no Jest.
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class {
    constructor(uri: string) {
      mockFile(uri);
    }
    upload = (...args: unknown[]) => mockUpload(...args);
  },
}));

const FOTO = { uri: 'file:///cache/ImagePicker/abc.jpg', tipo: 'image/jpeg' };

describe('chamar, com arquivo', () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    mockUpload.mockReset();
    mockFile.mockReset();
    global.fetch = jest.fn();
    mockUpload.mockResolvedValue({ status: 201, body: '{"id":"t1"}', headers: {} });
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('sobe a foto pelo upload nativo, e nao pelo fetch', async () => {
    // O `fetch` do Expo nao sabe montar multipart a partir de um caminho local:
    // o conversor dele so aceita `string` e `Blob`.
    await apiTarefas.concluir('token', 't1', { foto: FOTO });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockFile).toHaveBeenCalledWith(FOTO.uri);
  });

  it('declara o campo e o tipo que a API confere', async () => {
    // `fileFilter` recusa o que nao estiver em `TIPOS_ACEITOS`, e le o
    // `Content-Type` da parte - que vem daqui, e nao da extensao do arquivo.
    await apiTarefas.concluir('token', 't1', { note: 'guardei tudo', foto: FOTO });

    const [url, opcoes] = mockUpload.mock.calls[0];
    expect(url).toContain('/tasks/t1/completion');
    expect(opcoes).toMatchObject({
      httpMethod: 'POST',
      uploadType: 1,
      fieldName: 'image',
      mimeType: 'image/jpeg',
      parameters: { note: 'guardei tudo' },
    });
    expect(opcoes.headers.authorization).toBe('Bearer token');
  });

  it('transforma a recusa da API em ErroDaApi, e nao em falha de rede', async () => {
    // O `upload` nativo resolve com 4xx em vez de rejeitar. Sem converter o
    // status aqui, a tela anunciaria sucesso numa conclusao recusada.
    mockUpload.mockResolvedValue({
      status: 400,
      body: '{"message":"Tipo de imagem não aceito: image/heic"}',
      headers: {},
    });

    const erro = await apiTarefas.concluir('token', 't1', { foto: FOTO }).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect((erro as ErroDaApi).status).toBe(400);
    expect(textoDaFalha(erro)).toBe('Tipo de imagem não aceito: image/heic');
  });

  it('sem foto, continua indo pelo fetch com JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      text: async () => '{"id":"t1"}',
    });

    await apiTarefas.concluir('token', 't1', { note: 'so a nota' });

    expect(mockUpload).not.toHaveBeenCalled();
    const [, opcoes] = (global.fetch as jest.Mock).mock.calls[0];
    expect(opcoes.headers['content-type']).toBe('application/json');
    expect(opcoes.body).toBe('{"note":"so a nota"}');
  });
});

describe('falha que a tela mostra', () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  function responderCom(status: number, corpo: string, tipo = 'application/json') {
    global.fetch = jest.fn().mockResolvedValue({
      status,
      text: async () => corpo,
      headers: { get: () => tipo },
    }) as unknown as typeof fetch;
  }

  it('nao chama de falha de rede uma resposta que nao e JSON', async () => {
    // Pagina de aviso de tunel, HTML de proxy, resposta truncada: o servidor
    // respondeu, e dizer "verifique a internet" manda mexer no roteador a toa.
    responderCom(200, '<!DOCTYPE html><html><body>aviso do túnel</body></html>', 'text/html');

    const erro = await apiTarefas.listar('token').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(textoDaFalha(erro)).not.toMatch(/Sem conexão/);
    // O corpo cru fica guardado: e o que permite reconhecer a pagina depois.
    expect((erro as ErroDaApi).detalhe?.respostaCrua).toContain('aviso do túnel');
  });

  it('embrulha a falha de transporte, guardando a causa e o caminho', async () => {
    const causa = new TypeError('Network request failed');
    global.fetch = jest.fn().mockRejectedValue(causa) as unknown as typeof fetch;

    const erro = await apiTarefas.listar('token').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeTransporte);
    expect((erro as ErroDeTransporte).causa).toBe(causa);
    expect((erro as ErroDeTransporte).contexto).toEqual({
      metodo: 'GET',
      caminho: '/tasks',
      comArquivo: false,
      // Gerado por requisicao e enviado no cabecalho `x-request-id`: e o que
      // liga esta falha a linha do log do servidor.
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(textoDaFalha(erro)).toMatch(/Sem conexão com o TaskPlay/);
  });

  it('marca como envio com arquivo a falha que vem do upload', async () => {
    // A distincao importa no registro: falha no envio de foto e outra
    // investigacao que falha ao listar tarefas, e a frase na tela e a mesma.
    mockUpload.mockRejectedValue(new Error('File does not exist'));

    const erro = await apiTarefas
      .concluir('token', 't1', { foto: FOTO })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeTransporte);
    expect((erro as ErroDeTransporte).contexto.comArquivo).toBe(true);
  });

  it('nao anuncia problema de internet para defeito do aplicativo', async () => {
    expect(textoDaFalha(new RangeError('indice invalido'))).toMatch(/Algo deu errado/);
  });
});
