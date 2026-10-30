import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { eventoDeFalha } from './falhas';
import { useTelemetria } from './useTelemetria';

export function RegistroDeFalhas() {
  const { registrar } = useTelemetria();
  const cliente = useQueryClient();

  useEffect(() => {
    const registrarFalha = (erro: unknown) => {
      try {
        const evento = eventoDeFalha(erro);
        if (evento) registrar(evento);
      } catch {
        // A telemetria nao pode ser a causa da proxima falha. Um aplicativo que
        // quebra ao registrar que quebrou nao deixa nem o primeiro registro.
      }
    };

    const consultas = cliente.getQueryCache().subscribe((evento) => {
      if (evento.type === 'updated' && evento.action.type === 'error') {
        registrarFalha(evento.action.error);
      }
    });
    const mutacoes = cliente.getMutationCache().subscribe((evento) => {
      if (evento.type === 'updated' && evento.action.type === 'error') {
        registrarFalha(evento.action.error);
      }
    });

    return () => {
      consultas();
      mutacoes();
    };
  }, [cliente, registrar]);

  return null;
}
