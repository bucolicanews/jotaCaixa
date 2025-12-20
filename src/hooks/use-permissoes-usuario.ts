import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSessao } from "@/hooks/use-sessao";
import { PermissoesUsuario } from "@/types/permissoes";

export const usePermissoesUsuario = () => {
  const { usuario, role } = useSessao();
  const [permissoes, setPermissoes] = useState<PermissoesUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const fetchPermissoes = async () => {
      if (!usuario || role !== "Usuario") {
        setCarregando(false);
        return;
      }

      // 1️⃣ tenta buscar como admin_usuario
      const { data: adminUser } = await supabase
        .from("admin_usuarios")
        .select("permissoes")
        .eq("id", usuario.id)
        .single();

      if (adminUser?.permissoes) {
        setPermissoes(adminUser.permissoes);
        setCarregando(false);
        return;
      }

      // 2️⃣ tenta buscar como usuario de cliente
      const { data: clienteUser } = await supabase
        .from("tbl_usuarios")
        .select("permissoes")
        .eq("id", usuario.id)
        .single();

      if (clienteUser?.permissoes) {
        setPermissoes(clienteUser.permissoes);
      }

      setCarregando(false);
    };

    fetchPermissoes();
  }, [usuario, role]);

  return {
    permissoes,
    carregando,
  };
};
