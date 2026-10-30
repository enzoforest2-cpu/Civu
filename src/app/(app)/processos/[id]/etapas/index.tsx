import { PainelModalidade } from "./modalidade";
import { PainelPesquisaPrecos } from "./pesquisa-precos";
import { PainelEdital } from "./edital";
import { PainelImpugnacoes } from "./impugnacoes";
import { PainelSessao } from "./sessao";
import { PainelRecursos } from "./recursos";
import { PainelAvisoDispensa } from "./aviso-dispensa";
import { PainelRetornoBancario } from "./retorno-bancario";
import { metaDe, type PropsEtapa } from "./util";

/** Painel da etapa atual do processo de compra. Etapas sem painel próprio (ou etapa antiga) não mostram nada. */
export function PainelDaEtapa(props: PropsEtapa) {
  const { p } = props;
  if (p.encerradoEm || p.tipo.chave !== "COMPRA") return null;
  const modalidade = metaDe(p).modalidade;
  switch (p.estadoAtual) {
    case "INSTRUCAO":
      return (
        <>
          <PainelModalidade {...props} />
          <PainelPesquisaPrecos {...props} />
        </>
      );
    case "PUBLICACAO_EDITAL":
      return <PainelEdital {...props} />;
    case "IMPUGNACOES":
      return <PainelImpugnacoes {...props} />;
    case "SESSAO_DISPUTA":
      return <PainelSessao {...props} />;
    case "RECURSOS":
      return <PainelRecursos {...props} />;
    case "INSTRUCAO_DIRETA":
      return modalidade === "DISPENSA_VALOR" ? <PainelAvisoDispensa {...props} /> : null;
    case "PAGAMENTO_ENVIADO":
      return <PainelRetornoBancario {...props} />;
    default:
      return null;
  }
}
