import * as ImagePicker from 'expo-image-picker';

/** O que a API aceita (`TIPOS_ACEITOS` em `storage.config.ts`). */
const TIPO_PADRAO = 'image/jpeg';

export interface FotoEscolhida {
  uri: string;
  tipo: string;
}

const QUALIDADE = 0.6;

const REPRESENTACAO = ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible;

export const GALERIA_LIBERADA = ligada(process.env['EXPO_PUBLIC_ALLOW_GALLERY'], __DEV__);

/** Ausente vale o padrao; presente, so `1` e `true` ligam. */
function ligada(valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined || valor === '') return padrao;
  return valor === '1' || valor.toLowerCase() === 'true';
}

function converter(resultado: ImagePicker.ImagePickerResult): FotoEscolhida | null {
  if (resultado.canceled || resultado.assets.length === 0) return null;
  const escolhida = resultado.assets[0];
  return { uri: escolhida.uri, tipo: escolhida.mimeType ?? TIPO_PADRAO };
}

/** Erro com frase propria: negar permissao nao e falha, e uma escolha. */
export class PermissaoNegada extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'PermissaoNegada';
  }
}

export async function tirarFoto(): Promise<FotoEscolhida | null> {
  const permissao = await ImagePicker.requestCameraPermissionsAsync();
  if (!permissao.granted) {
    throw new PermissaoNegada(
      GALERIA_LIBERADA
        ? 'O TaskPlay precisa da câmera para registrar a foto. Você pode liberar nos ajustes do aparelho, ou escolher uma foto da galeria.'
        : 'O TaskPlay precisa da câmera para registrar a foto. Libere o acesso nos ajustes do aparelho para concluir esta tarefa.',
    );
  }
  return converter(
    await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: QUALIDADE,
      // Sem recorte: um passo a mais entre concluir a tarefa e enviar, e a
      // moldura quadrada nao ajuda a mostrar um comodo arrumado.
      allowsEditing: false,
    }),
  );
}

export async function escolherDaGaleria(): Promise<FotoEscolhida | null> {
  if (!GALERIA_LIBERADA) {
    throw new Error('A escolha pela galeria está desligada nesta versão do aplicativo.');
  }
  const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) {
    throw new PermissaoNegada(
      'O TaskPlay precisa do acesso às fotos para enviar a evidência. Você pode liberar nos ajustes do aparelho.',
    );
  }
  return converter(
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: QUALIDADE,
      allowsEditing: false,
      preferredAssetRepresentationMode: REPRESENTACAO,
    }),
  );
}
