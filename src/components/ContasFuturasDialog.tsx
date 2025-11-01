// ... (cerca da linha 95, dentro de fetchContasFuturas)
    } else if (data) {
      // O Supabase retorna o objeto aninhado como um array (mesmo em N:1).
      // Mapeamos para extrair o objeto único esperado pelo tipo ParcelaFutura.
      const mappedData = (data as any[]).map(parcela => ({
        ...parcela,
        // Extrai o primeiro elemento do array (a conta sintética)
        admin_contas_receber: parcela.admin_contas_receber?.[0] || { descricao: 'N/A' }
      })) as ParcelaFutura[];
      
      setParcelas(mappedData);
    }
// ...