import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { paginaInicial } from "@/lib/areas";

export default async function Home() {
  const u = await getSessionUser();
  redirect(u ? paginaInicial(u) : "/login");
}
