import { escolherDaGaleria, tirarFoto, PermissaoNegada } from './foto';

const mockGaleria = jest.fn();
const mockCamera = jest.fn();
const mockPermissaoGaleria = jest.fn();
const mockPermissaoCamera = jest.fn();

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: {
    Automatic: 'automatic',
    Compatible: 'compatible',
    Current: 'current',
  },
  launchImageLibraryAsync: (...args: unknown[]) => mockGaleria(...args),
  launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
  requestMediaLibraryPermissionsAsync: () => mockPermissaoGaleria(),
  requestCameraPermissionsAsync: () => mockPermissaoCamera(),
}));

const escolhaDe = (mimeType: string) => ({
  canceled: false,
  assets: [{ uri: 'file:///cache/ImagePicker/abc.jpg', mimeType }],
});

describe('foto da evidencia', () => {
  beforeEach(() => {
    mockGaleria.mockReset().mockResolvedValue(escolhaDe('image/jpeg'));
    mockCamera.mockReset().mockResolvedValue(escolhaDe('image/jpeg'));
    mockPermissaoGaleria.mockReset().mockResolvedValue({ granted: true });
    mockPermissaoCamera.mockReset().mockResolvedValue({ granted: true });
  });

  it('pede a representacao compativel na galeria, e nao a original', async () => {
    await escolherDaGaleria();

    expect(mockGaleria).toHaveBeenCalledWith(
      expect.objectContaining({ preferredAssetRepresentationMode: 'compatible', quality: 0.6 }),
    );
  });

  it('devolve so o caminho e o tipo declarado pelo seletor', async () => {
    // O tipo vira o `Content-Type` da parte, e e o que o `fileFilter` da API
    // confere. O nome do arquivo nao entra: o upload nativo o monta sozinho.
    mockGaleria.mockResolvedValue(escolhaDe('image/png'));

    await expect(escolherDaGaleria()).resolves.toEqual({
      uri: 'file:///cache/ImagePicker/abc.jpg',
      tipo: 'image/png',
    });
  });

  it('devolve nulo quando a pessoa desiste', async () => {
    mockGaleria.mockResolvedValue({ canceled: true, assets: [] });
    await expect(escolherDaGaleria()).resolves.toBeNull();
  });

  it('recusar a permissao e escolha, e por isso tem frase propria', async () => {
    // Negar no iOS e definitivo pelo dialogo do sistema - a frase precisa dizer
    // que o caminho de volta e pelos ajustes.
    mockPermissaoCamera.mockResolvedValue({ granted: false });

    await expect(tirarFoto()).rejects.toBeInstanceOf(PermissaoNegada);
    expect(mockCamera).not.toHaveBeenCalled();
  });
});

describe('chave da galeria', () => {
  const original = process.env['EXPO_PUBLIC_ALLOW_GALLERY'];

  afterEach(() => {
    if (original === undefined) delete process.env['EXPO_PUBLIC_ALLOW_GALLERY'];
    else process.env['EXPO_PUBLIC_ALLOW_GALLERY'] = original;
  });

  function importar(valor?: string) {
    if (valor === undefined) delete process.env['EXPO_PUBLIC_ALLOW_GALLERY'];
    else process.env['EXPO_PUBLIC_ALLOW_GALLERY'] = valor;
    let modulo!: typeof import('./foto');
    jest.isolateModules(() => {
      modulo = require('./foto');
    });
    return modulo;
  }

  it('sem a variavel, acompanha o modo de desenvolvimento', () => {
    expect(importar().GALERIA_LIBERADA).toBe(true);
  });

  it('a variavel contraria o padrao nos dois sentidos', () => {
    expect(importar('false').GALERIA_LIBERADA).toBe(false);
    expect(importar('0').GALERIA_LIBERADA).toBe(false);
    expect(importar('true').GALERIA_LIBERADA).toBe(true);
    expect(importar('1').GALERIA_LIBERADA).toBe(true);
  });

  it('desligada, a galeria estoura em vez de abrir em silencio', async () => {
    // Guarda, e nao confianca na tela: abrir a galeria porque alguem chamou a
    // funcao seria reabrir sem alarde a porta que a decisao fechou.
    const modulo = importar('false');
    await expect(modulo.escolherDaGaleria()).rejects.toThrow(/desligada/);
    expect(mockPermissaoGaleria).not.toHaveBeenCalled();
  });

  it('desligada, a camera negada nao oferece a galeria como saida', async () => {
    // Mandar a pessoa "escolher uma foto da galeria" quando o botao nao existe
    // e um beco sem saida - e com a camera negada no iOS, o unico que sobraria.
    const modulo = importar('false');
    mockPermissaoCamera.mockResolvedValue({ granted: false });

    const erro = await modulo.tirarFoto().catch((e: Error) => e);

    expect((erro as Error).message).not.toMatch(/galeria/);
    expect((erro as Error).message).toMatch(/ajustes do aparelho/);
  });
});
