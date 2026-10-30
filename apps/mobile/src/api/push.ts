import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

export class PermissaoDePushNegada extends Error {
  constructor() {
    super('As notificações estão desligadas. Ative nos ajustes do aparelho para receber lembretes.');
    this.name = 'PermissaoDePushNegada';
  }
}

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.['eas']?.['projectId'] ??
    Constants.easConfig?.['projectId'] ??
    undefined
  );
}

export async function obterTokenDePush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const atual = await Notifications.getPermissionsAsync();
  let concedida = atual.granted;

  // `canAskAgain: false` significa que a pessoa ja negou de vez - no iOS o
  // dialogo do sistema so aparece uma vez, e pedir de novo nao mostra nada.
  if (!concedida && atual.canAskAgain) {
    const pedida = await Notifications.requestPermissionsAsync();
    concedida = pedida.granted;
  }

  if (!concedida) throw new PermissaoDePushNegada();

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  return data;
}

export async function prepararCanalDoAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Tarefas e lembretes',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}
