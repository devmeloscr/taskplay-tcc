import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import type { TelemetryEvent } from '@taskplay/shared-telemetry';
import { useSessao } from '../auth/sessao';
import { esvaziarFilas } from './envio';
import { enfileirar } from './fila';

export const JANELA_DE_ACESSO_MS = 30 * 60_000;

interface Telemetria {
  registrar: (evento: TelemetryEvent) => void;
}

const Contexto = createContext<Telemetria | null>(null);

export function ProvedorDeTelemetria({ children }: { children: React.ReactNode }) {
  const { perfilAtivo, aparelhoConhecido } = useSessao();

  const perfilRef = useRef<string | null>(null);
  const ultimoAcesso = useRef<Record<string, number>>({});
  perfilRef.current = perfilAtivo?.id ?? null;

  const registrar = useCallback<Telemetria['registrar']>((evento) => {
    const perfilId = perfilRef.current;
    if (!perfilId) return;
    void enfileirar(perfilId, evento);
    // Tenta sair na hora; se nao houver rede, fica na fila. Sem `await`: quem
    // chamou esta no meio de um toque.
    void esvaziarFilas();
  }, []);

  useEffect(() => {
    const perfilId = perfilAtivo?.id;
    if (!perfilId) return;

    const agora = Date.now();
    const anterior = ultimoAcesso.current[perfilId] ?? 0;
    if (agora - anterior < JANELA_DE_ACESSO_MS) return;

    ultimoAcesso.current[perfilId] = agora;
    registrar({ type: 'app.opened', occurredAt: new Date(agora).toISOString() });
  }, [perfilAtivo?.id, registrar]);

  useEffect(() => {
    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;

      const perfilId = perfilRef.current;
      if (perfilId) {
        const agora = Date.now();
        if (agora - (ultimoAcesso.current[perfilId] ?? 0) >= JANELA_DE_ACESSO_MS) {
          ultimoAcesso.current[perfilId] = agora;
          void enfileirar(perfilId, {
            type: 'app.opened',
            occurredAt: new Date(agora).toISOString(),
          });
        }
      }
      void esvaziarFilas();
    });
    return () => inscricao.remove();
  }, []);

  useEffect(() => {
    if (aparelhoConhecido) void esvaziarFilas();
  }, [aparelhoConhecido]);

  const valor = useMemo<Telemetria>(() => ({ registrar }), [registrar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTelemetria(): Telemetria {
  return useContext(Contexto) ?? INERTE;
}

const INERTE: Telemetria = { registrar: () => undefined };
