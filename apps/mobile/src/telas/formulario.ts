import { useCallback, useState } from 'react';
import { separarErros } from '../api/cliente';

export function useErrosDoFormulario(campos: readonly string[]) {
  const [porCampo, setPorCampo] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState<string | null>(null);

  const limpar = useCallback(() => {
    setPorCampo({});
    setGeral(null);
  }, []);

  const registrar = useCallback(
    (erro: unknown) => {
      const reparticao = separarErros(erro, campos);
      setPorCampo(reparticao.porCampo);
      setGeral(reparticao.geral);
      return reparticao;
    },
    [campos],
  );

  const marcar = useCallback(
    (issues: readonly { path: readonly PropertyKey[]; message: string }[]) => {
      const novos: Record<string, string> = {};
      for (const issue of issues) {
        const caminho = issue.path.map(String).join('.');
        if (campos.includes(caminho)) novos[caminho] ??= issue.message;
      }
      setPorCampo(novos);
      setGeral(null);
    },
    [campos],
  );

  const aoEditar = useCallback(
    (campo: string, definir: (valor: string) => void) => (valor: string) => {
      definir(valor);
      setPorCampo((atuais) => {
        if (!(campo in atuais)) return atuais;
        const resto = { ...atuais };
        delete resto[campo];
        return resto;
      });
    },
    [],
  );

  return { porCampo, geral, registrar, marcar, limpar, aoEditar };
}
