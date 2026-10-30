import type { TcleDocument } from '@taskplay/shared-types';

const VERSAO = '2026-09-25';

type SecaoDoTcle = TcleDocument['sections'][number];

const RESUMO: string[] = [
  'O TaskPlay faz parte de uma pesquisa de Trabalho de Curso em Ciência da Computação (UNIP). A família usa o aplicativo por 30 dias.',
  'A participação é voluntária. A família pode sair a qualquer momento, pelo próprio aplicativo, e todos os dados dela são apagados.',
  'Coletamos o nome e a data de nascimento dos participantes, as tarefas, os pontos e as fotos de comprovação. Não coletamos e-mail, telefone, endereço ou localização das crianças.',
  'Os registros de uso usados na pesquisa não trazem o nome de ninguém: cada pessoa vira um código irreversível.',
  'As fotos ficam em servidor do pesquisador, não vão para terceiros e são apagadas automaticamente em até 30 dias.',
  'As notificações levam o primeiro nome e a tarefa, e passam pelos serviços de notificação da Expo, do Google e da Apple.',
];

const SECOES: SecaoDoTcle[] = [
  {
    title: 'Sobre a pesquisa',
    paragraphs: [
      'Você está sendo convidado a participar, com a sua família, da pesquisa "TaskPlay: aplicativo mobile com gamificação para gestão de tarefas domésticas e estímulo à responsabilidade infantil", Trabalho de Curso de Ciência da Computação da Universidade Paulista (UNIP), Polo Afogados da Ingazeira.',
      'Pesquisador responsável: Júlio César Pereira de Melo. Orientadora: profa. Sandra Bozolan.',
    ],
  },
  {
    title: 'Objetivo',
    paragraphs: [
      'Avaliar se um aplicativo com elementos de jogos (pontos, loja de recompensas e itens especiais) ajuda famílias a organizar as tarefas domésticas e estimula a responsabilidade de crianças e adolescentes de 6 a 16 anos.',
    ],
  },
  {
    title: 'Como é a participação',
    paragraphs: [
      'A família usa o TaskPlay por pelo menos 30 dias. O responsável cadastra os filhos, cria as tarefas e acompanha a conclusão delas; os filhos concluem as tarefas, acumulam pontos e os trocam na loja.',
      'Além do uso do aplicativo, a pesquisa inclui um questionário inicial sobre o perfil da família e, ao final, uma entrevista com o responsável e com os filhos. A entrevista só é gravada com a sua autorização.',
    ],
  },
  {
    title: 'Participação voluntária',
    paragraphs: [
      'A participação é voluntária. Não há custo e não há pagamento. Você pode recusar o convite ou sair a qualquer momento, sem justificativa e sem nenhum prejuízo.',
      'A participação das crianças e dos adolescentes também depende da vontade deles: se um filho não quiser participar, a vontade dele é respeitada.',
    ],
  },
  {
    title: 'Riscos e benefícios',
    paragraphs: [
      'Os riscos são mínimos. Pode haver desconforto com lembretes, com a perda de pontos por atraso ou com a comparação entre irmãos. Existe também o risco de exposição das fotos tiradas dentro de casa, reduzido pelas medidas descritas nas seções sobre fotos e sobre o acesso aos dados.',
      'O benefício esperado é uma organização mais clara das tarefas da casa. A pesquisa também contribui para o conhecimento sobre o uso de jogos na educação das crianças. Não há benefício financeiro.',
    ],
  },
  {
    title: 'Que dados o aplicativo coleta',
    paragraphs: [
      'O aplicativo registra o nome e a data de nascimento de cada participante, as tarefas domésticas combinadas na família, os pontos ganhos e gastos, e as fotos que a criança ou o adolescente enviar para comprovar uma tarefa.',
      'Não são coletados e-mail, telefone, endereço, documento ou qualquer dado de localização das crianças e adolescentes. Apenas o responsável cadastra um e-mail, usado para entrar no aplicativo.',
    ],
  },
  {
    title: 'Registros automáticos de uso',
    paragraphs: [
      'Enquanto o aplicativo é usado, o sistema registra automaticamente eventos como a abertura do aplicativo, a conclusão de tarefas, a variação de pontos e as compras na loja. Esses registros são o principal instrumento de avaliação da pesquisa.',
      'O identificador de cada participante é substituído por um código irreversível antes de qualquer registro ser gravado. O código é sempre o mesmo para a mesma pessoa, o que permite acompanhar a evolução ao longo dos 30 dias, mas não permite chegar de volta ao nome de ninguém.',
    ],
  },
  {
    title: 'Fotos de comprovação',
    paragraphs: [
      'Quando uma tarefa exige comprovação por foto, a imagem fica armazenada em servidor sob responsabilidade do pesquisador. Ela não é enviada a nenhum serviço de terceiros.',
      'A foto é excluída automaticamente sete dias depois de o responsável verificar a tarefa, ou trinta dias depois do envio caso ninguém a verifique, o que ocorrer primeiro. A exclusão é definitiva e feita pelo próprio sistema, sem depender de solicitação. O resultado da verificação (aprovada ou recusada) continua registrado, porque é ele que explica a pontuação recebida.',
      'A foto é sempre tirada na hora, pela câmera. O aplicativo não lê a galeria do aparelho: só é enviado o que a criança ou o adolescente fotografar no momento de concluir a tarefa.',
    ],
  },
  {
    title: 'Notificações no celular',
    paragraphs: [
      'O aplicativo envia notificações ao celular: lembretes de prazo, avisos de aprovação e cobranças de tarefas em atraso.',
      'Essas notificações contêm o primeiro nome do participante e a descrição da tarefa. Para chegarem ao celular, elas passam pelos serviços de notificação da Expo, do Google (Android) e da Apple (iOS), que as transmitem sem armazená-las de forma permanente. Nenhuma foto e nenhum dado de pontuação passa por esse canal.',
      'O responsável pode desligar as notificações a qualquer momento, e o aplicativo continua funcionando normalmente.',
    ],
  },
  {
    title: 'Quem tem acesso aos dados',
    paragraphs: [
      'Dentro do aplicativo, cada família acessa apenas os próprios dados. Não há como uma família ver as tarefas, as fotos ou a pontuação de outra.',
      'O pesquisador tem acesso aos registros automáticos de uso, já com os identificadores substituídos por códigos, para a análise dos resultados.',
    ],
  },
  {
    title: 'Registro da administração dos perfis',
    paragraphs: [
      'O responsável administra os perfis da família pelo aplicativo: cadastra um filho, corrige o nome, define ou retira o PIN de acesso ao perfil, e pode retirar um filho da família.',
      'Cada uma dessas ações fica registrada, com quem fez, quem foi afetado, o que mudou, o valor anterior, o valor novo e a data e hora. Esse registro fica visível apenas ao responsável da própria família, dentro do aplicativo. O PIN nunca é registrado.',
      'Retirar um filho da família não apaga as tarefas, a pontuação e as fotos dele: a retirada pode ser desfeita. A remoção definitiva dos dados é a da seção seguinte, e leva a família inteira.',
    ],
  },
  {
    title: 'Saída do estudo e exclusão dos dados',
    paragraphs: [
      'A família pode sair do estudo a qualquer momento, sem justificativa e sem prejuízo.',
      'A saída pode ser feita pelo próprio aplicativo, no perfil do responsável, em "Excluir a conta", e remove de uma vez todos os dados da família: perfis, tarefas, pontuação, compras e fotos. A remoção é imediata e definitiva.',
      'Por não ter como ser desfeita, a operação pede a senha e o PIN do responsável e a digitação do texto REMOVER TUDO. Se o responsável não tiver mais esses dados, a saída pode ser solicitada ao pesquisador.',
      'Permanece registrado apenas que uma família saiu do estudo, sem nenhuma informação que permita identificar qual. Essa informação é necessária para relatar, no trabalho, quantas famílias concluíram os 30 dias.',
    ],
  },
  {
    title: 'Guarda dos dados de pesquisa',
    paragraphs: [
      'Concluído o teste de campo, os registros automáticos de uso, sempre com os identificadores substituídos por códigos, são conservados pelo tempo necessário à análise e à defesa do trabalho.',
    ],
  },
  {
    title: 'Seu aceite',
    paragraphs: [
      'Ao tocar em "Li e concordo", você declara que leu este termo, que entendeu como os dados da sua família serão tratados e que concorda em participar da pesquisa com a sua família. O aplicativo registra a versão do termo aceita e a data do aceite.',
      'Você pode reler este termo a qualquer momento no perfil do responsável.',
    ],
  },
];

export const TCLE_VIGENTE: TcleDocument = {
  version: VERSAO,
  title: 'Termo de Consentimento Livre e Esclarecido',
  summary: RESUMO,
  sections: SECOES,
};
