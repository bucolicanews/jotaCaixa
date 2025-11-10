import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, Eye, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ModeloSocietario, BlocoSocietario } from '@/types/documentos-societarios';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { ContratoTag } from '@/types/contratos';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import BlocoSocietarioCard from '@/components/modelos-societarios/BlocoSocietarioCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

// FIX TS2304: Definindo o tipo EmpresaLogada (copiado de PreencherContrato.tsx)
interface EmpresaLogada {
    nome: string;
    email: string;
    documento?: string | null;
    endereco_completo?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    rg?: string | null;
    telefone?: string | null;
    cep?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
}

interface EmpresaContrato {
    id: string;
    nome: string;
}

// NOVO TIPO: Cliente CR com todos os campos de tag
interface ClienteCRCompleto {
    id: string;
    proprietario_id?: string | null; // Adicionado para compatibilidade com a tabela 'clientes'
    nome: string;
    razao_social?: string | null;
    nome_fantasia?: string | null;
    documento?: string | null;
    email?: string | null;
    telefone?: string | null;
    telefone_fixo?: string | null;
    cep?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    rg?: string | null;
    data_nascimento?: string | null;
}

const GerarDocumentoSocietario: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ModeloSocietario | null>(null);
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]); // Alterado para clientesCR
  
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [tituloDocumento, setTituloDocumento] = useState('');
  
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);
  const [empresaLogada, setEmpresaLogada] = useState<EmpresaLogada | null>(null);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();
  
  // Dados da Empresa Logada (para preenchimento de tags {{EMPRESA_*}})
  const empresaLogadaMemo = useMemo(() => {
    if (!perfil) return null;
    const profile = perfil as AdminProfile | ClienteProfile;
    
    // CORREÇÃO: Acessando 'documento' diretamente do ClienteProfile
    const documentoCliente = (profile as ClienteProfile).documento || (profile as ClienteProfile).cpf;
    const documentoAdmin = (profile as AdminProfile).cnpj || (profile as AdminProfile).cpf;
    
    return {
        nome: profile.nome, 
        email: profile.email, 
        documento: isAdmin ? documentoAdmin : documentoCliente,
        cpf: (profile as AdminProfile).cpf || (profile as ClienteProfile).cpf, 
        cnpj: (profile as AdminProfile).cnpj, 
        rg: profile.rg, 
        telefone: profile.telefone,
        cep: profile.cep, 
        endereco: profile.endereco, 
        numero: profile.numero, 
        complemento: profile.complemento,
        bairro: profile.bairro, 
        cidade: profile.cidade, 
        estado: profile.estado,
    };
  }, [perfil, isAdmin, isCliente]);
  
  // Cliente selecionado (para preenchimento de tags)
  const clienteSelecionado = useMemo(() => {
      return clientesCR.find(c => c.id === clienteSelecionadoId);
  }, [clientesCR, clienteSelecionadoId]);


  // --- FUNÇÃO DE BUSCA DE CLIENTES E TAGS DEPENDENTE DO PROPRIETÁRIO ---
  const fetchDependentData = useCallback(async (targetEmpresaId: string) => {
    if (!targetEmpresaId) return;
    
    // 1. Buscar Blocos Reutilizáveis
    const { data: blocosData } = await supabase
        .from('blocos_societarios')
        .select('*')
        .eq('proprietario_id', targetEmpresaId)
        .order('titulo');
    setBlocos(blocosData as BlocoSocietario[] || []);
    
    // 2. Buscar Clientes (Contratados) - AGORA BUSCA APENAS NA TABELA 'clientes' (Clientes CR)
    const { data: clientesCRData, error: errorCR } = await supabase
        .from('clientes')
        .select('*') // Seleciona todos os campos para preenchimento de tags
        .eq('proprietario_id', targetEmpresaId)
        .order('nome');
        
    if (errorCR) {
        showError('Erro ao carregar clientes CR: ' + errorCR.message);
        setClientesCR([]);
    } else {
        const mappedClients = (clientesCRData as ClienteCRCompleto[]).filter(c => c.id !== targetEmpresaId); // Filtra o próprio proprietário
        setClientesCR(mappedClients);
        
        // Se o cliente selecionado não estiver mais na lista, limpa a seleção
        if (clienteSelecionadoId && !mappedClients.some(c => c.id === clienteSelecionadoId)) {
            setClienteSelecionadoId('');
        }
    }
    
  }, [clienteSelecionadoId]);


  // --- FUNÇÃO PRINCIPAL DE BUSCA DE DADOS INICIAIS ---
  const buscarDados = useCallback(async () => {
    if (!modeloId || !ownerIdLogado) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    // 1. Buscar Modelo
    const { data: modeloData, error: modeloError } = await supabase
        .from('modelos_societarios')
        .select('*')
        .eq('proprietario_id', ownerIdLogado)
        .eq('id', modeloId)
        .single();
        
    if (modeloError) {
        showError('Modelo não encontrado ou acesso negado.');
        navigate('/documentos-societarios', { replace: true });
        return;
    }
    setModelo(modeloData as ModeloSocietario);
    setTituloDocumento(modeloData.titulo);
    
    // 2. Configurar Empresa Logada (Contratante)
    setEmpresaLogada(empresaLogadaMemo);
    
    // 3. Configurar Empresas Contratantes (Apenas Admin)
    let initialProprietarioContratoId = ownerIdLogado;
    if (isAdmin) {
        // Busca todos os clientes do sistema para o dropdown de proprietário
        const { data: clientesData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('aprovado', true)
            .order('nome');
            
        const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Meus Documentos (Admin)' };
        const allClients = [adminOption, ...(clientesData as EmpresaContrato[])];
        setEmpresasContrato(allClients);
        initialProprietarioContratoId = allClients[0].id;
    }
    
    setProprietarioContratoId(initialProprietarioContratoId);
    
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, navigate, isAdmin, empresaLogadaMemo]);
  
  // Efeito para monitorar a mudança do proprietário do contrato (proprietarioContratoId)
  useEffect(() => {
      if (proprietarioContratoId) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData]);


  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isCliente) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, ownerIdLogado, buscarDados, navigate, isAdmin, isCliente]);

  // --- Lógica de Preenchimento de Tags ---
  const allAvailableTags = useMemo(() => {
      // Combina tags padrão (apenas as de Cliente/Usuário/Empresa) e tags de blocos
      const allTags = TAGS_PADRAO.filter(t => 
          !t.origem_dado?.startsWith('contas_receber')
      );
      
      const blocoTags = blocos.map(b => ({
          id: b.id,
          nome_tag: `{{BLOCO_${b.id}}}`,
          descricao: `Bloco: ${b.titulo}`,
          origem_dado: 'blocos_societarios',
      } as ContratoTag));
      
      const combined = [...allTags, ...blocoTags];
      
      // Remove duplicatas e ordena
      const customTagsMap = combined.reduce((acc, tag) => {
          acc[tag.nome_tag] = tag;
          return acc;
      }, {} as Record<string, ContratoTag>);
      
      const uniqueTags = Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => customTagsMap[tagKey])
          .filter((t): t is ContratoTag => !!t)
          .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
          
      return uniqueTags;
  }, [blocos]); // FIX TS2304: Declarando allAvailableTags aqui

  const updateTags = useCallback(() => {
    const newTags: Record<string, string> = {};
    
    allAvailableTags.forEach(tag => {
        const tagKey = tag.nome_tag;
        let tagValue: string | null = null;
        
        // 1. Tenta preencher tags de sistema (EMPRESA_NOME, CLIENTE_NOME, etc.)
        if (tag.origem_dado) {
            const [sourceTable, sourceField] = tag.origem_dado.split('.');
            
            // Mapeamento de dados da Empresa Logada (Contratada) - tbl_clientes / tbl_admins
            if ((sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') && empresaLogada) {
                const empresaData = empresaLogada as any;
                if (empresaData && empresaData[sourceField]) {
                    tagValue = String(empresaData[sourceField]);
                }
            } 
            
            // Mapeamento de dados do Cliente Selecionado (Contratado) - clientes
            else if (sourceTable === 'clientes' && clienteSelecionado) {
                const clienteData = clienteSelecionado as any;
                
                // Busca o valor diretamente no objeto clienteSelecionado (que agora é ClienteCRCompleto)
                if (clienteData && clienteData[sourceField]) {
                    tagValue = String(clienteData[sourceField]);
                }
            } 
            
            // Mapeamento de Blocos
            else if (sourceTable === 'blocos_societarios' && tagKey.startsWith('{{BLOCO_')) {
                const blocoId = tagKey.replace('{{BLOCO_', '').replace('}}', '');
                const bloco = blocos.find(b => b.id === blocoId);
                tagValue = bloco?.conteudo || `[BLOCO ${blocoId} NÃO ENCONTRADO]`;
            }
        }
        
        // 2. Se o valor foi preenchido automaticamente, usa-o.
        if (tagValue !== null && tagValue !== undefined && tagValue !== 'N/A') {
            newTags[tagKey] = tagValue;
        } else {
            // 3. Caso contrário, usa o valor salvo anteriormente ou o valor digitado.
            newTags[tagKey] = valoresTags[tagKey] || '';
        }
    });
    
    setValoresTags(newTags);
  }, [clienteSelecionado, blocos, empresaLogada, valoresTags, allAvailableTags]);

  useEffect(() => {
    updateTags();
  }, [updateTags]);

  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    
    // 1. Substituição de Blocos (Primeira Passagem)
    const blocoTags = Object.keys(tags).filter(tag => tag.startsWith('{{BLOCO_'));
    
    blocoTags.forEach(blocoTag => {
        const regex = new RegExp(blocoTag, 'g');
        // O valor da tag de bloco já contém o conteúdo do bloco (que pode ter tags de dados)
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[blocoTag]);
    });
    
    // 2. Substituição de Tags de Dados (Segunda Passagem)
    const dataTags = Object.keys(tags).filter(tag => !tag.startsWith('{{BLOCO_'));
    
    dataTags.forEach(dataTag => {
        const regex = new RegExp(dataTag, 'g');
        // Substitui a tag de dados pelo seu valor
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[dataTag]);
    });
    
    return conteudoRenderizado;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
      setConteudoPreview(conteudoRenderizado);
      setPreviewTitle(tituloDocumento || modelo.titulo);
      setPreviewOpen(true);
  };

  const handleSalvarDocumento = async () => {
    if (!modelo || !clienteSelecionadoId || !ownerIdLogado || !tituloDocumento || !proprietarioContratoId) {
        showError('Preencha Título, Cliente e Proprietário.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 0. GARANTIR QUE O CLIENTE EXISTA NA TABELA 'clientes' (para FK)
        const clienteSelecionado = clientesCR.find(c => c.id === clienteSelecionadoId);
        if (!clienteSelecionado) throw new Error('Cliente selecionado não encontrado.');
        
        // Não precisamos mais fazer upsert na tabela 'clientes' aqui, pois a lista
        // já vem da tabela 'clientes' e a FK será validada.
        
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
        
        const documentoData = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId, // Agora referencia tbl_clientes(id)
            proprietario_id: proprietarioContratoId, // Usando o proprietário selecionado
            status: 'finalizado',
            valores_tags_preenchidos: { ...valoresTags, titulo: tituloDocumento },
            conteudo_renderizado: conteudoRenderizado,
            data_registro: format(new Date(), 'yyyy-MM-dd'),
        };
        
        const { error } = await supabase
            .from('documentos_societarios_gerados')
            .insert(documentoData);
            
        if (error) throw error;

        showSuccess(`Documento '${tituloDocumento}' gerado e salvo com sucesso!`);
        // ALTERAÇÃO AQUI: Usando window.location.href
        window.location.href = '/documentos-societarios';
        
    } catch (error: any) {
        console.error('Erro ao salvar documento:', error);
        showError('Falha ao salvar documento: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (carregandoSessao || carregandoDados) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!modelo) {
      return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent><p>Modelo de documento não encontrado.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  // Filtra tags que já foram preenchidas automaticamente (para não pedir valor manual)
  const tagsParaPreenchimentoManual = Object.keys(valoresTags).filter(tagKey => {
      // Exclui tags de bloco (que são preenchidas com o conteúdo do bloco)
      if (tagKey.startsWith('{{BLOCO_')) return false;
      
      // Exclui tags de sistema (EMPRESA_*) que foram preenchidas
      if (tagKey.startsWith('{{EMPRESA_') && valoresTags[tagKey]) return false;
      
      // Inclui tags que não têm valor preenchido
      return !valoresTags[tagKey];
  });

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Button 
            onClick={() => { window.location.href = '/documentos-societarios';  }} 
            variant="link" 
            type="button"
            className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
        >
            <ChevronLeft className="w-5 h-5" />
            Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Gerar Documento: {modelo.titulo}
        </h1>
      </div>
      
      {/* DUPLICATE BUTTONS FOR TOP NAVIGATION */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button 
              onClick={handlePreview} 
              variant="outline"
              className="flex-1 h-12"
              disabled={!modelo || !clienteSelecionadoId || !tituloDocumento}
          >
              <Eye className="mr-2 h-4 w-4" />
              Pré-visualizar Documento
          </Button>
          <Button 
              onClick={handleSalvarDocumento} 
              className="flex-1 h-12"
              disabled={isSubmitting || !clienteSelecionadoId || !tituloDocumento}
          >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Documento Finalizado
<dyad-problem-report summary="6 problems">
<problem file="src/hooks/use-ticket-status.ts" line="97" column="41" code="1005">',' expected.</problem>
<problem file="src/hooks/use-ticket-status.ts" line="21" column="10" code="6133">'mensagensNaoLidas' is declared but its value is never read.</problem>
<problem file="src/hooks/use-ticket-status.ts" line="97" column="28" code="2353">Object literal may only specify known properties, and 'mensagensNao' does not exist in type 'TicketStatus'.</problem>
<problem file="src/hooks/use-ticket-status.ts" line="97" column="28" code="18004">No value exists in scope for the shorthand property 'mensagensNao'. Either declare one or provide an initializer.</problem>
<problem file="src/hooks/use-ticket-status.ts" line="97" column="41" code="18004">No value exists in scope for the shorthand property 'Lidas'. Either declare one or provide an initializer.</problem>
<problem file="src/components/formularios/FormContasReceber.tsx" line="232" column="11" code="6133">'ownerKey' is declared but its value is never read.</problem>
</dyad-problem-report>Olá! Obrigado por me alertar sobre esses erros. Parece que houve um erro de digitação no nome da variável no `useTicketStatus.ts` e um erro de variável não utilizada no `FormContasReceber.tsx`.

Vou corrigir os 6 erros de forma concisa:

1.  **`src/hooks/use-ticket-status.ts` (TS1005, TS2353, TS18004 x 2):** O nome da variável `mensagensNaoLidas` foi digitado incorretamente como `mensagensNao Lidas` no objeto de retorno. Vou corrigir o nome da variável no retorno.
2.  **`src/hooks/use-ticket-status.ts` (TS6133):** A variável `mensagensNaoLidas` está sendo usada no retorno, então o erro `TS6133` é um falso positivo que será resolvido pela correção do erro 1.
3.  **`src/components/formularios/FormContasReceber.tsx` (TS6133):** A variável `ownerKey` está sendo declarada dentro do `onSubmit` mas não está sendo usada no escopo onde foi declarada. Vou garantir que ela seja usada corretamente.

Aqui estão as correções:

<dyad-write path="src/hooks/use-ticket-status.ts" description="Fixing variable name typo in return statement (TS1005, TS2353, TS18004).">
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';

interface TicketStatus {
  ticketsAbertos: number;
  mensagensNaoLidas: number;
  carregando: boolean;
  refetch: () => void;
}

/**
 * Hook para buscar o status dos tickets de suporte para o usuário logado.
 * - Admin: Conta todos os tickets com status 'aberto' ou 'em_progresso'.
 * - Cliente: Conta tickets com status 'aberto' ou 'em_progresso' onde ele é o proprietário.
 * - Mensagens Não Lidas: Conta mensagens onde o destinatário é o usuário logado e 'lido' é false.
 */
export function useTicketStatus(): TicketStatus {
  const { usuario, role, carregando: carregandoSessao } = useSessao();
  const [ticketsAbertos, setTicketsAbertos] = useState(0);
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!usuario?.id || carregandoSessao) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const userId = usuario.id;
    
    try {
      // --- 1. Contagem de Tickets Abertos/Em Progresso ---
      let ticketsQuery = supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['aberto', 'em_progresso', 'pausado']);

      if (role === 'Cliente') {
        // Cliente só vê os tickets que ele criou
        ticketsQuery = ticketsQuery.eq('proprietario_id', userId);
      } else if (role === 'Admin') {
        // Admin vê todos os tickets onde ele é o destinatário (empresa_id)
        ticketsQuery = ticketsQuery.eq('empresa_id', userId);
      }
      
      const { count: openCount, error: openError } = await ticketsQuery;
      if (openError) throw openError;
      setTicketsAbertos(openCount || 0);

      // --- 2. Contagem de Mensagens Não Lidas ---
      const { count: unreadCount, error: unreadError } = await supabase
        .from('mensagens_ticket')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', userId)
        .eq('lido', false);
        
      if (unreadError) throw unreadError;
      setMensagensNaoLidas(unreadCount || 0);

    } catch (error) {
      console.error('Erro ao buscar status do ticket:', error);
      setTicketsAbertos(0);
      setMensagensNaoLidas(0);
    } finally {
      setCarregando(false);
    }
  }, [usuario, role, carregandoSessao, refreshKey]);

  useEffect(() => {
    fetchStatus();
    
    // Opcional: Adicionar listener de tempo real para novas mensagens
    const channel = supabase.channel('ticket_status_changes')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'mensagens_ticket',
            filter: `destinatario_id=eq.${usuario?.id}`,
        }, () => {
            // Força o refetch quando uma nova mensagem chega para o usuário logado
            refetch();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [fetchStatus, usuario?.id, refetch]);

  return { ticketsAbertos, mensagensNaoLidas, carregando, refetch };
}