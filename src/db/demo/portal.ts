import type { ModuloDemo } from "./contexto";

/** Pedidos feitos pelos portais: um requerimento da empresa do Carlos com pendência aberta, outro da Ana já em análise. */
export const portalDemo: ModuloDemo = {
  nome: "Portais",
  async aplicar(ctx) {
    const engine = await import("../../lib/engine");
    const { db } = await import("../index");
    const { eq } = await import("drizzle-orm");
    const { usuarios } = await import("../schema");
    const p1 = await engine.abrirProcessoExterno(
      ctx.municipioId,
      { pessoaId: ctx.pessoas.carlos, empresaId: ctx.empresas.mendes, nomeExibicao: "Mendes Materiais de Construção Ltda" },
      {
        tipoChave: "REQUERIMENTO",
        assunto: "Autorização para caçamba de entulho na via pública",
        descricao: "Solicitamos autorização para manter uma caçamba de entulho em frente à obra da Rua Pinheiro Machado, 455, por 10 dias.",
      },
    );
    const prot = await db.query.usuarios.findFirst({ where: eq(usuarios.cpf, "22222222222"), with: { setor: true, municipio: true } });
    if (prot) {
      const u = {
        id: prot.id, nome: prot.nome, cpf: prot.cpf, email: prot.email, cargo: prot.cargo, papeis: prot.papeis as never, setorId: prot.setorId,
        setor: prot.setor ? { id: prot.setor.id, sigla: prot.setor.sigla, nome: prot.setor.nome } : null,
        municipioId: prot.municipioId, municipio: { id: prot.municipio.id, nome: prot.municipio.nome, uf: prot.municipio.uf, slug: prot.municipio.slug },
      };
      await engine.abrirExigencia(u, p1.id, "Envie a ART ou o alvará da obra e informe a empresa que fornece a caçamba.", 5);
    }
    await engine.abrirProcessoExterno(
      ctx.municipioId,
      { pessoaId: ctx.pessoas.ana, empresaId: null, nomeExibicao: "Ana Beatriz Souza" },
      { tipoChave: "REQUERIMENTO", assunto: "Segunda via de certidão de numeração predial", descricao: "Preciso da certidão de numeração do imóvel da Rua das Hortênsias, 212, para o financiamento." },
    );
  },
};
