import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { carregarCertidaoPublica, carregarLicencaPublica } from "@/modulos/tributos/dados";

/** Verificação pública: qualquer pessoa confere um alvará ou certidão pelo código impresso no documento. */
export default async function Verificar({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const sp = await searchParams;
  const codigo = sp.codigo?.trim().toUpperCase();
  let naoEncontrado = false;
  if (codigo) {
    if (await carregarLicencaPublica(codigo)) redirect(`/verificar/alvara/${codigo}`);
    if (await carregarCertidaoPublica(codigo)) redirect(`/verificar/certidao/${codigo}`);
    naoEncontrado = true;
  }
  return (
    <>
      <h1 className="display text-[32px] leading-[1.1] font-semibold text-ink sm:text-[38px]">Confira se um documento é autêntico</h1>
      <p className="mt-2 text-[15px] text-ink-2">Digite o código de verificação impresso no alvará ou na certidão, ou leia o QR Code com a câmera do celular.</p>
      <form method="get" className="panel mt-7 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="codigo">
            Código de verificação
          </label>
          <input id="codigo" name="codigo" className="input tnum uppercase" placeholder="XXXX-XXXX-XXXX" defaultValue={codigo ?? ""} required />
        </div>
        <button className="btn btn-primary btn-lg">
          <Search size={17} /> Verificar
        </button>
      </form>
      {naoEncontrado && (
        <div role="alert" className="mt-5 rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-[14.5px] text-bad">
          Nenhum documento com o código {codigo}. Confira as letras e números; se o código estiver certo, o documento não foi emitido por esta prefeitura.
        </div>
      )}
    </>
  );
}
