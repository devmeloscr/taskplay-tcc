import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ProvedorDeTelemetria } from './useTelemetria';

const mockEnfileirar = jest.fn();
const mockEsvaziarFilas = jest.fn().mockResolvedValue({ perfis: 0, eventos: 0 });

jest.mock('./fila', () => ({
  enfileirar: (...args: unknown[]) => mockEnfileirar(...args),
}));
jest.mock('./envio', () => ({
  esvaziarFilas: () => mockEsvaziarFilas(),
}));

let mockSessao: { perfilAtivo: { id: string } | null; aparelhoConhecido: boolean };
jest.mock('../auth/sessao', () => ({ useSessao: () => mockSessao }));

function montar() {
  return render(
    <ProvedorDeTelemetria>
      <Text>conteudo</Text>
    </ProvedorDeTelemetria>,
  );
}

/** So os `app.opened`, com o perfil a que cada um foi atribuido. */
function aberturasRegistradas(): { perfil: string; quando: string }[] {
  return mockEnfileirar.mock.calls
    .filter(([, evento]) => evento.type === 'app.opened')
    .map(([perfil, evento]) => ({ perfil, quando: evento.occurredAt }));
}

describe('ProvedorDeTelemetria', () => {
  beforeEach(() => {
    mockEnfileirar.mockReset();
    mockEsvaziarFilas.mockClear();
    mockSessao = { perfilAtivo: null, aparelhoConhecido: true };
  });

  it('nao registra abertura enquanto nao ha perfil ativo', () => {
    montar();
    expect(aberturasRegistradas()).toEqual([]);
  });

  it('registra a abertura na selecao do perfil, e nao na do processo', () => {
    mockSessao = { perfilAtivo: { id: 'pedro' }, aparelhoConhecido: true };
    montar();

    const aberturas = aberturasRegistradas();
    expect(aberturas).toHaveLength(1);
    expect(aberturas[0].perfil).toBe('pedro');
  });

  it('registra uma abertura por perfil quando a familia troca de perfil', () => {
    mockSessao = { perfilAtivo: { id: 'pedro' }, aparelhoConhecido: true };
    const tela = montar();

    mockSessao = { perfilAtivo: { id: 'julia' }, aparelhoConhecido: true };
    act(() => {
      tela.rerender(
        <ProvedorDeTelemetria>
          <Text>conteudo</Text>
        </ProvedorDeTelemetria>,
      );
    });

    expect(aberturasRegistradas().map((a) => a.perfil)).toEqual(['pedro', 'julia']);
  });

  it('nao conta um acesso novo quando o mesmo perfil volta dentro da janela', () => {
    mockSessao = { perfilAtivo: { id: 'pedro' }, aparelhoConhecido: true };
    const tela = montar();
    expect(aberturasRegistradas()).toHaveLength(1);

    act(() => {
      tela.rerender(
        <ProvedorDeTelemetria>
          <Text>conteudo</Text>
        </ProvedorDeTelemetria>,
      );
    });

    expect(aberturasRegistradas()).toHaveLength(1);
  });

  it('tenta esvaziar as filas na abertura, antes de haver perfil escolhido', () => {
    // E quando as filas acumuladas offline tem mais chance de sair: as dos tres
    // filhos saem enquanto o seletor ainda esta na tela.
    montar();
    expect(mockEsvaziarFilas).toHaveBeenCalled();
  });

  it('nao tenta esvaziar num aparelho ainda desconhecido', () => {
    // Sem aparelho conhecido nao ha token guardado, e a passagem nao teria com
    // que autenticar nada.
    mockSessao = { perfilAtivo: null, aparelhoConhecido: false };
    montar();
    expect(mockEsvaziarFilas).not.toHaveBeenCalled();
  });
});
