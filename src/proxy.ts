import { NextResponse, type NextRequest } from "next/server";
import { foraDoEscopo } from "./lib/escopo";

/** Rotas de módulos desligados levam à tela inicial da área correspondente. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!foraDoEscopo(pathname)) return NextResponse.next();
  const destino = pathname.startsWith("/portal") ? "/portal" : ["/verificar", "/obras", "/transparencia"].some((p) => pathname.startsWith(p)) ? "/consulta" : "/painel";
  return NextResponse.redirect(new URL(destino, request.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\..*).*)"],
};
