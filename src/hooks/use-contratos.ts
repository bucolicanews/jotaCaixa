import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { useSessao } from './use-sessao';
import { useDebounce } from './use-debounce';
import { resolveOwnerContext } from '@/utils/owner';

type ContratoComCliente = ContratoGerado & {
  clientes: { nome: string, razao_social: string | null } | null
  modelos_contratos: { titulo: string } | null
  conta_receber_id?: string | null
}
export type ContratoStatus = ContratoGerado['status'] | 'todos' // EXPORTADO
export type Ordenacao = 'criado_em_desc' | 'vencimento_asc' | 'cliente_asc' // EXPORTADO

interface ContratosHook {
  contratos: ContratoComCliente[]
  contratosAgrupados: {
    meusContratos: ContratoComCliente[]
    contratosClientes: ContratoComCliente[]
    pendentes: ContratoComCliente[]
    ativos: ContratoComCliente[]
    inativos: ContratoComCliente[]
  }
  carregando: boolean
  isAdmin: boolean
  empresaId: string | null
  refetch: () => void

  // Filters/Sorting State
  filtroTexto: string
  setFiltroTexto: (text: string) => void
  filtroStatus: ContratoStatus
  setFiltroStatus: (status: ContratoStatus) => void
  ordenacao: Ordenacao
  setOrdenacao: (order: Ordenacao) => void

  // Mutations
  handleDeleteContract: (contrato: ContratoGerado) => Promise<void>
  handleBlockContract: (contrato: ContratoGerado) => Promise<void>
  handleReactivateContract: (contrato: ContratoGerado) => Promise<void>
}

export function useContratos(): ContratosHook {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao()
  const [contratos, setContratos] = useState<ContratoComCliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Filters/Sorting State
  const [filtroTexto, setFiltroTexto] = useState('')
  const filtroTextoDebounced = useDebounce(filtroTexto, 500)
  const [filtroStatus, setFiltroStatus] = useState<ContratoStatus>('todos')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('criado_em_desc')

  const isAdmin = role === 'Admin'
  const { ownerId: empresaId } = resolveOwnerContext(role, perfil, usuario?.id)

  const refetch = useCallback(() => {
    setRefreshKey((prev) => prev + 1)
  }, [])

  const buscarContratos = useCallback(async () => {
    if (!empresaId && !isAdmin) {
      setContratos([])
      setCarregando(false)
      return
    }

    setCarregando(true)

    let query = supabase.from('contratos_gerados').select(
      `
          id,
          modelo_id,
          cliente_id,
          proprietario_id,
          status,
          valor_total,
          data_inicio,
          numero_parcelas,
          dia_vencimento_parcela,
          valores_tags_preenchidos,
          conteudo_renderizado,
          link_assinatura_externo,
          documento_assinado_url,
          criado_em,
          updated_at,
          assinatura_nome,
          assinatura_selfie_url,
          assinatura_proprietario_nome,
          assinatura_proprietario_url,
          clientes(nome, razao_social),
          modelo_id:modelos_contratos(titulo),
          contas_receber(id)
        `,
    )

    // Se for Cliente/Usuário, filtra apenas pelos seus contratos
    if (!isAdmin && empresaId) {
      query = query.eq('proprietario_id', empresaId)
    }

    // Aplica ordenação
    let ascending = true
    let orderByColumn = 'criado_em'

    if (ordenacao === 'cliente_asc') {
      // Ordenação por cliente será feita no frontend
    } else if (ordenacao === 'criado_em_desc') {
      orderByColumn = 'criado_em'
      ascending = false
    } else if (ordenacao === 'vencimento_asc') {
      orderByColumn = 'data_inicio'
      ascending = true
    }

    query = query.order(orderByColumn, { ascending: ascending })

    const { data, error } = await query

    if (error) {
      showError('Erro ao carregar contratos: ' + error.message)
      setContratos([])
    } else {
      const processedData = data.map((contrato: any) => {
        const cr = contrato.contas_receber
        const conta_receber_id = (Array.isArray(cr) ? cr[0]?.id : cr?.id) ?? null
        return {
          ...contrato,
          conta_receber_id,
        }
      })

      // NOVO: Busca por parcelas pagas em lote
      const contratoIds = processedData.map((c) => c.id)
      let contratosComParcelasPagas: string[] = []

      if (contratoIds.length > 0) {
        const { data: parcelasData, error: parcelasError } = await supabase
          .from('parcelas_contas_receber')
          .select('contas_receber(contrato_id)')
          .in('contas_receber.contrato_id', contratoIds)
          .eq('status', 'paga')
          .not('contas_receber.contrato_id', 'is', null)

        if (parcelasError) {
          console.error('Erro ao buscar parcelas pagas:', parcelasError)
          // Continua mesmo com erro, assumindo que não há parcelas pagas
        } else {
          // Extrai IDs únicos dos contratos que possuem parcelas pagas
          contratosComParcelasPagas = [
            ...new Set(
              parcelasData
                .map((p: any) => p.contas_receber?.contrato_id)
                .filter((id: string | undefined) => id),
            ),
          ] as string[]
        }
      }

      let fetchedContratos = processedData.map((c: any) => ({
        ...c,
        tem_parcelas_pagas: contratosComParcelasPagas.includes(c.id),
      })) as ContratoComCliente[]

      // Filtragem de status (se não for 'todos')
      if (filtroStatus !== 'todos') {
        fetchedContratos = fetchedContratos.filter(
          (c) => c.status === filtroStatus,
        )
      }

      // Filtragem de texto
      const termoBusca = filtroTextoDebounced.toLowerCase()
      if (termoBusca) {
        fetchedContratos = fetchedContratos.filter((c) => {
          const clienteNome = c.clientes?.nome || ''
          return (
            c.conteudo_renderizado?.toLowerCase().includes(termoBusca) ||
            clienteNome.toLowerCase().includes(termoBusca) ||
            c.id.toLowerCase().includes(termoBusca)
          )
        })
      }

      // Ordenação por cliente (se selecionado)
      if (ordenacao === 'cliente_asc') {
        fetchedContratos.sort((a, b) =>
          (a.clientes?.nome || '').localeCompare(b.clientes?.nome || ''),
        )
      }

      setContratos(fetchedContratos)
    }
    setCarregando(false)
  }, [
    empresaId,
    isAdmin,
    filtroStatus,
    filtroTextoDebounced,
    ordenacao,
    refreshKey,
  ])

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || empresaId)) {
      buscarContratos()
    }
  }, [carregandoSessao, isAdmin, empresaId, buscarContratos])

  // --- Mutação de Contratos ---

  const handleBlockContract = useCallback(
    async (contrato: ContratoGerado) => {
      if (
        !window.confirm(
          `Tem certeza que deseja BLOQUEAR o contrato ${contrato.id}? Esta ação irá marcar o contrato como 'bloqueado' e BLOQUEAR todas as parcelas pendentes associadas.`,
        )
      )
        return

      setCarregando(true)

      try {
        const { error: rpcError } = await supabase.rpc(
          'cancel_contract_installments',
          {
            p_contrato_id: contrato.id,
            p_motivo: 'Contrato Bloqueado',
          },
        )

        if (rpcError) throw rpcError

        showSuccess('Contrato bloqueado e parcelas bloqueadas com sucesso.')
        refetch()
      } catch (error: any) {
        console.error('Erro ao bloquear contrato:', error)
        showError('Falha ao bloquear contrato: ' + error.message)
      } finally {
        setCarregando(false)
      }
    },
    [refetch],
  )

  const handleReactivateContract = useCallback(
    async (contrato: ContratoGerado) => {
      if (
        !window.confirm(
          `Tem certeza que deseja DESBLOQUEAR o contrato ${contrato.id}? Isso irá reativar o status do contrato e reabrir as parcelas que foram bloqueadas.`,
        )
      )
        return

      setCarregando(true)

      try {
        const { error: rpcError } = await supabase.rpc(
          'reactivate_contract_installments',
          {
            p_contrato_id: contrato.id,
          },
        )

        if (rpcError) throw rpcError

        showSuccess('Contrato desbloqueado e parcelas reativadas com sucesso.')
        refetch()
      } catch (error: any) {
        console.error('Erro ao desbloquear contrato:', error)
        showError('Falha ao desbloquear contrato: ' + error.message)
      } finally {
        setCarregando(false)
      }
    },
    [refetch],
  )

  // --- Agrupamento para as Tabs ---
  const contratosAgrupados = useMemo(() => {
    const meusContratos = contratos.filter(
      (c) => c.proprietario_id === empresaId,
    )
    const contratosClientes = contratos.filter(
      (c) => c.proprietario_id !== empresaId,
    )

    const pendentes = meusContratos.filter(
      (c) => c.status === 'pendente_assinatura' || c.status === 'rascunho',
    )
    const ativos = meusContratos.filter(
      (c) => c.status === 'ativo' || c.status === 'concluido',
    )
    const inativos = meusContratos.filter(
      (c) => c.status === 'cancelado' || c.status === 'bloqueado',
    )

    return { meusContratos, contratosClientes, pendentes, ativos, inativos }
  }, [contratos, empresaId])

    return {
        contratos,
        contratosAgrupados,
        carregando,
        isAdmin,
        empresaId,
        refetch,

        // Filters/Sorting State
        filtroTexto,
        setFiltroTexto,
        filtroStatus,
        setFiltroStatus,
        ordenacao,
        setOrdenacao,

        // Mutations
        handleBlockContract,
        handleReactivateContract,
    };
}
