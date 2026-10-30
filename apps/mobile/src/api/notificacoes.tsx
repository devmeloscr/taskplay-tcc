import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { apiNotificacoes } from './cliente';
import { obterTokenDePush, prepararCanalDoAndroid } from './push';
import { useSessao } from '../auth/sessao';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useRegistroDePush(): void {
  const { accessToken, perfilAtivo } = useSessao();
  const jaRegistrado = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken || !perfilAtivo) return;
    if (jaRegistrado.current === perfilAtivo.id) return;
    jaRegistrado.current = perfilAtivo.id;

    void (async () => {
      try {
        await prepararCanalDoAndroid();
        const token = await obterTokenDePush();
        // `null` e o emulador ou o navegador: nao ha push de verdade ali, e
        // mandar `null` para a API seria recusado pelo formato do contrato.
        if (token) await apiNotificacoes.registrarToken(accessToken, token);
      } catch {
        // Ver acima: push e reforco, e nao pode derrubar a abertura.
        jaRegistrado.current = null;
      }
    })();
  }, [accessToken, perfilAtivo]);
}

export function useAberturaPorNotificacao(irParaTarefa: (id: string) => void): void {
  const { perfilAtivo } = useSessao();
  const tratados = useRef(new Set<string>());

  useEffect(() => {
    if (!perfilAtivo) return;

    function tratar(resposta: Notifications.NotificationResponse | null) {
      if (!resposta) return;
      const { identifier } = resposta.notification.request;
      // O mesmo toque pode chegar pelos dois caminhos - o `getLast` devolve a
      // ultima resposta mesmo depois de o ouvinte ja te-la entregue.
      if (tratados.current.has(identifier)) return;
      tratados.current.add(identifier);

      const dados = resposta.notification.request.content.data as { taskId?: unknown } | undefined;
      if (typeof dados?.taskId === 'string') irParaTarefa(dados.taskId);
    }

    void Notifications.getLastNotificationResponseAsync().then(tratar);
    const inscricao = Notifications.addNotificationResponseReceivedListener(tratar);
    return () => inscricao.remove();
  }, [perfilAtivo, irParaTarefa]);
}

export function useAoReceberPush(aoReceber: () => void): void {
  useEffect(() => {
    const inscricao = Notifications.addNotificationReceivedListener(() => aoReceber());
    return () => inscricao.remove();
  }, [aoReceber]);
}
