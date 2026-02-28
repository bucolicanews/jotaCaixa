import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ChevronLeft, Save, Eye, Building2, Info, Tag, CalendarIcon, FileSignature, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, ContratoGerado } from '@/types/contratos';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, parseISO, addMonths, setDate, getDaysInMonth, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';
import { ptBR } from 'date-fns/locale';
import { TabelaParcelasEdicao } from '@/components/contratos/TabelaParcelasEdicao';
import { useCapitalSocial } from '@/hooks/use-capital-social';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { v4 as uuidv4 } from 'uuid';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar' | 'semanal';
type ModoVencimento = 'dias' | 'fixo';

interface ClienteCRCompleto {
    id: string;
    proprietario_id?: string | null;
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

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const { temCapitalSocial, carregando: carregandoCapital } = useCapitalSocial();
  
  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;
  const isAdminOrEmployee = isDirectAdmin || isAdminUsuario;

  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number>(0); 
  const [tituloDocumento, setTituloDocumento] = useState('');
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<any[]>([]);
  
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [modoVencimento, setModoVencimento] = useState<ModoVencimento>('dias');
  
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(new Date());
  
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(new Date());
  
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [diaFixo, setDiaFixo] = useState<number>(5);
  const [diaSemana, setDiaSemana] = useState<string>('1');

  const [contratoInicial, setContratoInicial] = useState<ContratoGerado | null>(null);
  const [dadosContratada, setDadosContratada] = useState<any>(null);
  const [parcelasPagas, setParcelasPagas] = useState<any[]>([]);

  const isEditing = !!contratoId;

  const { tabelaContasReceber, tabelaParcelasReceber, ownerKey } = useMemo(() => {
    const tc = isAdminOrEmployee ? 'admin_contas_receber' : 'contas_receber';
    const tp = isAdminOrEmployee ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    const ok = isAdminOrEmployee ? 'admin_id' : 'empresa_id';
    return { tabelaContasReceber: tc, tabelaParcelasReceber: tp, ownerKey: ok };
  }, [isAdminOrEmployee]);

  const [resolvedOwnerId, setResolvedOwnerId] = useState<string | null>(null);
  
  useEffect(() => {
      const resolveOwner = async () => {
          if (carregandoSessao || !usuario) return;
          if (isDirectAdmin) {
              setResolvedOwnerId(usuario.id);
              return;
          }
          const adminIdFromProfile = (perfil as any)?.admin_id;
          if (adminIdFromProfile) {
              setResolvedOwnerId(adminIdFromProfile);
              return;
          }
          const { data, error } = await supabase
              .from('admin_user_lookup')
              .select('admin_id')
              .eq('user_id', usuario.id)
              .single();
          
          if (data && !error) {
              setResolvedOwnerId(data.admin_id);
              return;
          }
      };
      resolveOwner();
  }, [carregandoSessao, usuario, isDirectAdmin, perfil]);

  useEffect(() => {
    const fetchContratadaData = async () => {
        if (!proprietarioContratoId) {
            setDadosContratada(null);
            return;
        };
        const { data, error } = await supabase
            .from('tbl_admins')
            .select('*')
            .eq('id', proprietarioContratoId)
            .single();

        if (data && !error) {
            setDadosContratada(data);
        } else {
            if (isAdminOrEmployee && proprietarioContratoId === resolvedOwnerId) {
                setDadosContratada(perfil);
            } else {
                setDadosContratada(null);
            }
        }
    };
    fetchContratadaData();
  }, [proprietarioContratoId, isAdminOrEmployee, resolvedOwnerId, perfil]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const fetchDependentData = useCallback(async (targetId: string) => {
    if (!targetId || !resolvedOwnerId) return;
    
    const { data: tagsData } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', targetId);
        
    if (tagsData) setTagsCustomizadas(tagsData);

    // 1. Busca Clientes do Sistema (tbl_clientes)
    const { data: clientesSistemaData } = await supabase
        .from('tbl_clientes')
        .select('*')
        .eq('admin_id', targetId)
        .eq('aprovado', true);
        
    // 2. Busca Clientes CR (clientes)
    const { data: clientesCRData } = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetId);
        
    // 3. Lógica de Mesclagem Inteligente (Merge por Documento)
    // Se um documento existe na tabela 'clientes', usamos o ID de lá (o ID que a FK exige)
    const combinedClientsMap = new Map<string, ClienteCRCompleto>();
    const docToClientIdMap = new Map<string, string>(); // Mapeia documento -> ID na tabela 'clientes'
    
    // Processa Clientes CR primeiro para estabelecer os IDs "mestres" do financeiro
    (clientesCRData || []).forEach(c => {
        const doc = (c.documento || '').replace(/\D/g, '');
        if (doc) docToClientIdMap.set(doc, c.id);
        combinedClientsMap.set(c.id, { ...c } as ClienteCRCompleto);
    });
    
    // Processa Clientes do Sistema
    (clientesSistemaData || []).forEach(c => {
        const doc = (c.documento || c.cnpj || c.cpf || '').replace(/\D/g, '');
        
        // Se este cliente do sistema já existe no financeiro (mesmo documento)
        if (doc && docToClientIdMap.has(doc)) {
            const crId = docToClientIdMap.get(doc)!;
            const existing = combinedClientsMap.get(crId)!;
            // Atualiza os dados do mapa mantendo o ID do CR mas usando nomes mais recentes se houver
            combinedClientsMap.set(crId, { ...existing, ...c, id: crId });
        } else {
            // Se não existe, adiciona como novo
            if (!combinedClientsMap.has(c.id)) {
                combinedClientsMap.set(c.id, { ...c } as ClienteCRCompleto);
            }
        }
    });
    
    const sortedClients = Array.from(combinedClientsMap.values()).sort((a, b) => {
        const nameA = (a.razao_social || a.nome || '').toLowerCase();
        const nameB = (b.razao_social || b.nome || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
        
    setClientesCR(sortedClients);
  }, [isAdminOrEmployee, resolvedOwnerId]);

  const buscarDados = useCallback(async () => {
    setCarregandoDados(true);
    
    if (modeloId) {
      const { data } = await supabase.from('contrato_modelos').select('*').eq('id', modeloId).single();
      if (data) {
        setModelo(data);
        setTituloDocumento(data.titulo);
      }
    }
    
    if (isAdminOrEmployee && resolvedOwnerId) {
      const { data } = await supabase
        .from('tbl_clientes')
        .select('id, nome')
        .eq('admin_id', resolvedOwnerId)
        .eq('aprovado', true);
      
      const options = [{ id: resolvedOwnerId, nome: 'Meus Contratos' }, ...(data || [])];
      setEmpresasContrato(options);
    }
    
    let currentProprietarioId = resolvedOwnerId;
    setProprietarioContratoId(currentProprietarioId);
    
    if (contratoId) {
        const { data: contratoExistente } = await supabase
            .from('contratos_gerados')
            .select('*')
            .eq('id', contratoId)
            .single();
            
        if (contratoExistente) {
            setContratoInicial(contratoExistente);
            setClienteSelecionadoId(contratoExistente.cliente_id);
            setProprietarioContratoId(contratoExistente.proprietario_id);
            currentProprietarioId = contratoExistente.proprietario_id;
            
            setValorTotal(contratoExistente.valor_total || 0);
            setNumeroParcelas(contratoExistente.numero_parcelas || 1);
            
            if ((contratoExistente.numero_parcelas || 1) > 1) {
                setTipoLancamento('parcelar');
            } else {
                setTipoLancamento('unico');
            }
            
            if (contratoExistente.data_inicio) {
                const dataInicio = parseISO(contratoExistente.data_inicio);
                setDataVencimentoUnico(dataInicio);
                setDataPrimeiroVencimento(dataInicio);
            }
            
            if (contratoExistente.valores_tags_preenchidos) {
                setValoresTags(contratoExistente.valores_tags_preenchidos as Record<string, string>);
                if ((contratoExistente.valores_tags_preenchidos as any)['titulo']) {
                    setTituloDocumento((contratoExistente.valores_tags_preenchidos as any)['titulo']);
                }
            }
            
            const { data: oldContaSintetica } = await supabase
                .from(tabelaContasReceber)
                .select('id')
                .eq('contrato_gerado_id', contratoExistente.id)
                .single();
                
            if (oldContaSintetica) {
                const { data: existingParcelas, error: parcelasError } = await supabase
                    .from(tabelaParcelasReceber)
                    .select('id, numero_parcela, valor_parcela, data_vencimento, status')
                    .eq('conta_receber_id', oldContaSintetica.id)
                    .neq('status', 'aberta')
                    .order('numero_parcela', { ascending: true });
                    
                if (existingParcelas) {
                    setParcelasPagas(existingParcelas.map(p => ({ ...p, isNew: false })));
                }
            }
        }
    }
    
    if (currentProprietarioId) {
        await fetchDependentData(currentProprietarioId);
    }
    
    setCarregandoDados(false);
  }, [modeloId, resolvedOwnerId, isAdminOrEmployee, fetchDependentData, contratoId, tabelaContasReceber, tabelaParcelasReceber]);

  useEffect(() => {
    if (!carregandoSessao && resolvedOwnerId) buscarDados();
  }, [carregandoSessao, resolvedOwnerId, buscarDados]);

  useEffect(() => {
      if (proprietarioContratoId && !carregandoDados) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData, carregandoDados]);

  useEffect(() => {
      const newTags: Record<string, string> = { ...valoresTags };
      
      const cliente = clientesCR.find(c => c.id === clienteSelecionadoId);
      if (cliente) {
          newTags['{{CLIENTE_NOME}}'] = cliente.nome || '';
          newTags['{{CLIENTE_RAZAO_SOCIAL}}'] = cliente.razao_social || cliente.nome || '';
          newTags['{{CLIENTE_NOME_FANTASIA}}'] = cliente.nome_fantasia || '';
          newTags['{{CLIENTE_DOCUMENTO}}'] = cliente.documento || cliente.cpf || cliente.cnpj || '';
          newTags['{{CLIENTE_CPF}}'] = cliente.cpf || '';
          newTags['{{CLIENTE_CNPJ}}'] = cliente.cnpj || '';
          newTags['{{CLIENTE_RG}}'] = cliente.rg || '';
          newTags['{{CLIENTE_EMAIL}}'] = cliente.email || '';
          newTags['{{CLIENTE_TELEFONE}}'] = cliente.telefone || '';
          newTags['{{CLIENTE_TELEFONE_FIXO}}'] = cliente.telefone_fixo || '';
          newTags['{{CLIENTE_CEP}}'] = cliente.cep || '';
          newTags['{{CLIENTE_ENDERECO}}'] = cliente.endereco || '';
          newTags['{{CLIENTE_NUMERO}}'] = cliente.numero || '';
          newTags['{{CLIENTE_COMPLEMENTO}}'] = cliente.complemento || '';
          newTags['{{CLIENTE_BAIRRO}}'] = cliente.bairro || '';
          newTags['{{CLIENTE_CIDADE}}'] = cliente.cidade || '';
          newTags['{{CLIENTE_ESTADO}}'] = cliente.estado || '';
          newTags['{{CLIENTE_DATA_NASCIMENTO}}'] = cliente.data_nascimento ? format(parseISO(cliente.data_nascimento), 'dd/MM/yyyy') : '';
      }

      if (dadosContratada) {
          newTags['{{EMPRESA_NOME}}'] = dadosContratada.nome || dadosContratada.razao_social || '';
          newTags['{{EMPRESA_DOCUMENTO}}'] = dadosContratada.documento || dadosContratada.cnpj || '';
          newTags['{{EMPRESA_EMAIL}}'] = dadosContratada.email || '';
          newTags['{{EMPRESA_TELEFONE}}'] = dadosContratada.telefone || '';
          newTags['{{EMPRESA_CEP}}'] = dadosContratada.cep || '';
          newTags['{{EMPRESA_ENDERECO}}'] = dadosContratada.endereco || '';
          newTags['{{EMPRESA_NUMERO}}'] = dadosContratada.numero || '';
          newTags['{{EMPRESA_COMPLEMENTO}}'] = dadosContratada.complemento || '';
          newTags['{{EMPRESA_BAIRRO}}'] = dadosContratada.bairro || '';
          newTags['{{EMPRESA_CIDADE}}'] = dadosContratada.cidade || '';
          newTags['{{EMPRESA_ESTADO}}'] = dadosContratada.estado || '';
          newTags['{{EMPRESA_CNPJ}}'] = dadosContratada.cnpj || '';
          newTags['{{EMPRESA_CPF}}'] = dadosContratada.cpf || '';
      }

      let valorFinalContrato = 0;
      let valorParcelaFinal = 0;
      let dataPrimeiroVenc = '';
      let clausulaMensalidades = '';

      if (tipoLancamento === 'unico') {
          valorFinalContrato = valorTotal;
          valorParcelaFinal = valorTotal;
          dataPrimeiroVenc = dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy') : '';
          clausulaMensalidades = `O valor total do contrato é de ${formatCurrency(valorFinalContrato)}, a ser pago em uma única parcela de ${formatCurrency(valorParcelaFinal)}.`;
      } else if (tipoLancamento === 'parcelar' || tipoLancamento === 'repetir') {
          valorFinalContrato = tipoLancamento === 'parcelar' ? valorTotal : valorTotal * numeroParcelas;
          valorParcelaFinal = numeroParcelas > 0 ? valorTotal / (tipoLancamento === 'parcelar' ? numeroParcelas : 1) : 0;
          dataPrimeiroVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';

          let recorrenciaTexto = '';
          if (modoVencimento === 'fixo') {
              recorrenciaTexto = `com vencimento todo dia ${diaFixo}`;
          } else {
              recorrenciaTexto = `com intervalo de ${intervaloDias} dias`;
          }

          const baseText = tipoLancamento === 'parcelar'
              ? `O valor total do contrato é de ${formatCurrency(valorTotal)}, dividido em ${numeroParcelas} parcelas mensais de ${formatCurrency(valorParcelaFinal)}`
              : `O valor total do contrato é de ${formatCurrency(valorFinalContrato)}, correspondente a ${numeroParcelas} mensalidades de ${formatCurrency(valorParcelaFinal)}`;

          clausulaMensalidades = `${baseText} ${recorrenciaTexto} a iniciar da data ${dataPrimeiroVenc}.`;

      } else if (tipoLancamento === 'semanal') {
          valorFinalContrato = valorTotal * numeroParcelas;
          clausulaMensalidades = `O valor total do contrato é de ${formatCurrency(valorFinalContrato)}, correspondente a ${numeroParcelas} meses de serviço. O pagamento será realizado semanalmente, sendo o valor mensal de ${formatCurrency(valorTotal)} dividido pelo número de semanas do mês, resultando em parcelas semanais variáveis, a iniciar da data ${dataPrimeiroVenc}.`;
      }

      newTags['{{VALOR_TOTAL_CONTRATO}}'] = formatCurrency(valorFinalContrato);
      newTags['{{VALOR_PARCELA}}'] = tipoLancamento === 'semanal' ? 'Variável (Semanal)' : formatCurrency(valorParcelaFinal);
      newTags['{{NUMERO_PARCELAS}}'] = tipoLancamento === 'semanal' ? `${numeroParcelas} meses` : numeroParcelas.toString();
      newTags['{{PRIMEIRO_VENCIMENTO}}'] = dataPrimeiroVenc;
      newTags['{{DATA_EMISSAO}}'] = format(new Date(), 'dd/MM/yyyy');
      newTags['{{CLAUSULA_FINANCEIRA_MENSALIDADES}}'] = clausulaMensalidades;
      
      setValoresTags(newTags);

  }, [
      clienteSelecionadoId, 
      clientesCR, 
      dadosContratada, 
      valorTotal, 
      tipoLancamento, 
      numeroParcelas, 
      dataVencimentoUnico, 
      dataPrimeiroVencimento,
      modoVencimento,
      diaFixo,
      intervaloDias,
      diaSemana,
      valoresTags,
      formatCurrency
  ]);

  const tagsParaPreenchimentoManual = useMemo(() => {
    const combined = [...TAGS_PADRAO, ...tagsCustomizadas];
    const uniqueTags = Array.from(new Map(combined.map(item => [item.nome_tag, item])).values());
    
    return uniqueTags
        .filter(tag => 
            !tag.nome_tag.startsWith('{{CLIENTE_') && 
            !tag.nome_tag.startsWith('{{EMPRESA_') &&
            !['{{VALOR_TOTAL_CONTRATO}}', '{{VALOR_PARCELA}}', '{{NUMERO_PARCELAS}}', '{{PRIMEIRO_VENCIMENTO}}', '{{DATA_EMISSAO}}', '{{CLAUSULA_FINANCEIRA_MENSALIDADES}}'].includes(tag.nome_tag)
        )
        .map(t => t.nome_tag);
  }, [tagsCustomizadas]);

  const renderConteudo = () => {
    let html = modelo?.conteudo_template || '';
    Object.keys(valoresTags).forEach(tag => {
      const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(regex, valoresTags[tag] || '');
    });
    return html;
  };

  const handlePreview = () => {
      const finalHtml = renderConteudo();
      setConteudoPreview(finalHtml);
      setPreviewTitle(tituloDocumento || modelo?.titulo || '');
      setPreviewOpen(true);
  };

  const handleSalvarContrato = async (status: string) => {
    if (!temCapitalSocial && status !== 'rascunho') {
        showError('É necessário fazer o lançamento inicial do Capital Social antes de gerar contratos.');
        return;
    }
    
    const dataInicio = tipoLancamento === 'unico' ? dataVencimentoUnico : dataPrimeiroVencimento;
    
    if (!clienteSelecionadoId || !proprietarioContratoId || !dataInicio) {
        showError('Preencha o cliente, proprietário e as datas de vencimento.');
        return;
    }

    setIsSubmitting(true);
    
    try {
        // --- ETAPA CRÍTICA: GARANTIR QUE O CLIENTE EXISTE NA TABELA 'clientes' ---
        const { data: checkCR, error: checkError } = await supabase
            .from('clientes')
            .select('id')
            .eq('id', clienteSelecionadoId)
            .maybeSingle();

        if (checkError) throw checkError;

        if (!checkCR) {
            const { data: sysClient } = await supabase
                .from('tbl_clientes')
                .select('*')
                .eq('id', clienteSelecionadoId)
                .single();

            if (sysClient) {
                const { error: insertCRError } = await supabase
                    .from('clientes')
                    .insert({
                        id: sysClient.id,
                        proprietario_id: proprietarioContratoId,
                        nome: sysClient.nome,
                        razao_social: sysClient.razao_social,
                        email: sysClient.email,
                        documento: sysClient.documento || sysClient.cnpj || sysClient.cpf,
                        is_system_client: true
                    });
                if (insertCRError) throw insertCRError;
            } else {
                throw new Error('Cliente selecionado não encontrado na base de dados.');
            }
        }
        // --- FIM ETAPA CRÍTICA ---

        const { data: configData } = await supabase
            .from('configuracao_contratos')
            .select('id_conta_clientes_receber, id_conta_receita_contrato')
            .eq('proprietario_id', proprietarioContratoId)
            .single();
            
        const contaPatrimonialId = configData?.id_conta_clientes_receber || null;
        const contaReceitaId = configData?.id_conta_receita_contrato || null;
        
        const { data: parcelaConfig } = await supabase
            .from('configuracao_contas_receber')
            .select('conta_contabil_id')
            .eq('proprietario_id', proprietarioContratoId)
            .eq('tipo_registro', 'parcela')
            .single();
            
        const contaParcelaId = parcelaConfig?.conta_contabil_id || null;
        const temConfigContabil = !!contaPatrimonialId && !!contaReceitaId && !!contaParcelaId;

        let currentContratoId = contratoId;
        let contaReceberId: string | null = null;
        let valorTotalAnterior = 0;
        
        if (isEditing && contratoInicial) {
            const { data: oldContaSintetica } = await supabase
                .from(tabelaContasReceber)
                .select('id')
                .eq('contrato_gerado_id', contratoInicial.id)
                .single();
                
            if (oldContaSintetica) {
                contaReceberId = oldContaSintetica.id;
                const { data: existingParcelas } = await supabase
                    .from(tabelaParcelasReceber)
                    .select('id, valor_parcela, status')
                    .eq('conta_receber_id', contaReceberId);
                    
                const parcelasPagasCount = existingParcelas?.filter(p => p.status !== 'aberta').length || 0;
                const valorPagas = (existingParcelas || []).filter(p => p.status !== 'aberta').reduce((sum, p) => sum + Number(p.valor_parcela), 0);
                valorTotalAnterior = valorPagas;

                const parcelasAbertasIds = (existingParcelas || []).filter(p => p.status === 'aberta').map(p => p.id);
                if (parcelasAbertasIds.length > 0) {
                    const { count: lancamentosVinculados } = await supabase
                        .from('lancamentos')
                        .select('id', { count: 'exact', head: true })
                        .in('documento', parcelasAbertasIds)
                        .not('origem', 'ilike', '%estornada%');
                    if (lancamentosVinculados && lancamentosVinculados > 0) {
                        showError('Não é possível reeditar. Existem lançamentos contábeis vinculados às parcelas em aberto. Estorne os pagamentos antes.');
                        setIsSubmitting(false);
                        return;
                    }
                    await supabase.from(tabelaParcelasReceber).delete().in('id', parcelasAbertasIds);
                }
                
                await supabase.from('lancamentos')
                    .delete()
                    .eq('origem', 'lancamento_cr')
                    .eq('conciliado', false)
                    .eq('proprietario_id', proprietarioContratoId)
                    .ilike('descricao', `%CR ID: ${contaReceberId!.substring(0, 8)}%`);
            }
        }
        
        let valorTotalNovasParcelas = 0;
        let parcelasParaInserir = [];

        if (tipoLancamento === 'unico') {
            valorTotalNovasParcelas = valorTotal;
            parcelasParaInserir.push({ numero_parcela: 1, valor_parcela: valorTotal, data_vencimento: format(dataVencimentoUnico!, 'yyyy-MM-dd'), status: 'aberta' });
        } else {
            const valorParcelaBase = tipoLancamento === 'parcelar' ? (valorTotal / numeroParcelas) : valorTotal;
            valorTotalNovasParcelas = tipoLancamento === 'parcelar' ? valorTotal : (valorTotal * numeroParcelas);
            
            for (let i = 0; i < numeroParcelas; i++) {
                let dataVenc: Date;
                if (modoVencimento === 'fixo') {
                    const mesReferencia = addMonths(dataPrimeiroVencimento!, i);
                    dataVenc = setDate(mesReferencia, Math.min(diaFixo, getDaysInMonth(mesReferencia)));
                } else {
                    dataVenc = addDays(dataPrimeiroVencimento!, i * intervaloDias);
                }
                parcelasParaInserir.push({ numero_parcela: i + 1, valor_parcela: valorParcelaBase, data_vencimento: format(dataVenc, 'yyyy-MM-dd'), status: 'aberta' });
            }
        }
        
        const valorTotalFinal = valorTotalAnterior + valorTotalNovasParcelas;
        
        const contratoPayload = {
            modelo_id: modelo?.id,
            cliente_id: clienteSelecionadoId,
            proprietario_id: proprietarioContratoId,
            status: status,
            valor_total: valorTotalFinal,
            data_inicio: format(dataInicio, 'yyyy-MM-dd'),
            numero_parcelas: parcelasParaInserir.length,
            valores_tags_preenchidos: { ...valoresTags, titulo: tituloDocumento, tipo_conteudo: 'html' },
            conteudo_renderizado: renderConteudo(),
        };
        
        if (isEditing) {
            const { data } = await supabase.from('contratos_gerados').update(contratoPayload).eq('id', contratoId).select('id').single();
            currentContratoId = data.id;
        } else {
            const { data } = await supabase.from('contratos_gerados').insert(contratoPayload).select('id').single();
            currentContratoId = data.id;
        }
        
        const contaReceberPayload = {
            [ownerKey]: proprietarioContratoId,
            cliente_id: clienteSelecionadoId,
            descricao: `Contrato: ${tituloDocumento}`,
            valor_total: valorTotalFinal,
            data_emissao: format(new Date(), 'yyyy-MM-dd'),
            data_vencimento: parcelasParaInserir[0].data_vencimento,
            tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
            status: 'aberta',
            origem: 'contrato',
            contrato_gerado_id: currentContratoId,
            id_conta_patrimonial: contaPatrimonialId,
            id_conta_resultado: contaReceitaId,
        };
        
        if (isEditing && contaReceberId) {
            await supabase.from(tabelaContasReceber).update(contaReceberPayload).eq('id', contaReceberId);
        } else {
            const { data } = await supabase.from(tabelaContasReceber).insert(contaReceberPayload).select('id').single();
            contaReceberId = data.id;
        }
        
        const validContaReceberId = contaReceberId!;
        const parcelasComId = parcelasParaInserir.map(p => ({
            ...p,
            conta_receber_id: validContaReceberId,
            [ownerKey]: proprietarioContratoId,
            ...(temConfigContabil && { id_conta_contabil: contaParcelaId })
        }));
        
        if (parcelasComId.length > 0) {
            await supabase.from(tabelaParcelasReceber).insert(parcelasComId);
        }
        
        if (temConfigContabil && status !== 'rascunho') {
            const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
            const launchDesc = `Contrato: ${tituloDocumento}`;
            const crIdShort = validContaReceberId.substring(0, 8);
            
            const idPatrimonial = uuidv4();
            const idReceita = uuidv4();
            
            await supabase.from('lancamentos').insert([
                { id: idPatrimonial, proprietario_id: proprietarioContratoId, data_movimentacao, valor: valorTotalFinal, tipo: 'Entrada', conta_contabil_id: contaPatrimonialId, origem: 'lancamento_cr', conta_resultado_id: idReceita, descricao: `Lançamento Inicial CR: ${launchDesc} (CR ID: ${crIdShort})` },
                { id: idReceita, proprietario_id: proprietarioContratoId, data_movimentacao, valor: valorTotalFinal, tipo: 'Saida', conta_contabil_id: contaReceitaId, origem: 'lancamento_cr', conta_resultado_id: idPatrimonial, descricao: `Receita: ${launchDesc} (CR ID: ${crIdShort})` }
            ]);
        }

        showSuccess(`Contrato ${isEditing ? 'atualizado' : 'salvo'} e financeiro gerado!`);
        navigate('/contratos');
    } catch (e: any) {
        showError(e.message);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const renderActionButtons = () => (
      <div className="flex space-x-4">
        <Button variant="secondary" onClick={() => handleSalvarContrato('rascunho')} disabled={isSubmitting || carregandoCapital}>
            <Save className="mr-2 h-4 w-4"/> Rascunho
        </Button>
        <Button onClick={() => handleSalvarContrato('pendente_assinatura')} disabled={isSubmitting || carregandoCapital || !temCapitalSocial}>
            Gerar e Enviar
        </Button>
      </div>
  );

  if (carregandoSessao || carregandoDados || carregandoCapital) {
    return <LayoutPrincipal><div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center">
            <Button onClick={() => navigate('/contratos')} variant="link" className="p-0 mr-4"><ChevronLeft /> Voltar</Button>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center">
              <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar Contrato' : 'Gerar Contrato'}: {modelo?.titulo}
            </h1>
        </div>
        {renderActionButtons()}
      </div>
      
      {!temCapitalSocial && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lançamento Inicial Obrigatório</AlertTitle>
          <AlertDescription>
            É necessário fazer o lançamento inicial do Capital Social antes de gerar contratos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>1. Identificação e Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isAdminOrEmployee && (
                <div className="space-y-2">
                  <Label>Empresa Contratante</Label>
                  <Select value={proprietarioContratoId || ''} onValueChange={setProprietarioContratoId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{empresasContrato.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Título do Documento</Label>
                <Input value={tituloDocumento} onChange={e => setTituloDocumento(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cliente (Contratado)</Label>
                <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o Cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientesCR.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.razao_social || c.nome} {c.documento ? `(${c.documento})` : ''}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Detalhes Financeiros</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isEditing && parcelasPagas.length > 0 && (
                <Alert variant="default">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Contrato em Edição</AlertTitle>
                  <AlertDescription>
                    Este contrato possui **{parcelasPagas.length} parcela(s) já paga(s)**. Ao salvar, apenas as parcelas em aberto serão recalculadas/substituídas. O valor total do contrato será ajustado.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{tipoLancamento === 'semanal' ? 'Valor Mensal (R$)' : 'Valor Base (R$)'}</Label>
                  <Input type="number" value={valorTotal} onChange={e => setValorTotal(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Lançamento</Label>
                  <RadioGroup value={tipoLancamento} onValueChange={(v: any) => setTipoLancamento(v)} className="flex flex-wrap gap-2 pt-2">
                    <div className="flex items-center space-x-1"><RadioGroupItem value="unico" id="u"/><Label htmlFor="u">Único</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="parcelar" id="p"/><Label htmlFor="p">Parcelar</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="repetir" id="r"/><Label htmlFor="r">Repetir</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="semanal" id="s"/><Label htmlFor="s">Semanal</Label></div>
                  </RadioGroup>
                </div>
              </div>

              {tipoLancamento === 'unico' ? (
                <div className="space-y-2">
                  <Label>Data de Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus locale={ptBR} /></PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="space-y-4 border-t pt-4 mt-2">
                   <div className="grid grid-cols-2 gap-4">
                      {tipoLancamento === 'semanal' ? (
                          <>
                            <div className="space-y-2">
                                <Label>Duração (Meses)</Label>
                                <Input type="number" min={1} value={numeroParcelas} onChange={e => setNumeroParcelas(Number(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Dia da Semana</Label>
                                <Select value={diaSemana} onValueChange={setDiaSemana}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">Domingo</SelectItem>
                                        <SelectItem value="1">Segunda-feira</SelectItem>
                                        <SelectItem value="2">Terça-feira</SelectItem>
                                        <SelectItem value="3">Quarta-feira</SelectItem>
                                        <SelectItem value="4">Quinta-feira</SelectItem>
                                        <SelectItem value="5">Sexta-feira</SelectItem>
                                        <SelectItem value="6">Sábado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                          </>
                      ) : (
                          <>
                            <div className="space-y-2">
                                <Label>Parcelas</Label>
                                <Input type="number" min={1} value={numeroParcelas} onChange={e => setNumeroParcelas(Number(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Frequência</Label>
                                <Select value={modoVencimento} onValueChange={(v: any) => setModoVencimento(v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dias">Intervalo de Dias</SelectItem>
                                        <SelectItem value="fixo">Dia Fixo Mensal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                          </>
                      )}
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      {tipoLancamento !== 'semanal' && (
                          <div className="space-y-2">
                            <Label>{modoVencimento === 'fixo' ? 'Dia do Vencimento' : 'Intervalo (Dias)'}</Label>
                            {modoVencimento === 'fixo' ? (
                                <Input type="number" min={1} max={31} value={diaFixo} onChange={e => setDiaFixo(Number(e.target.value))} />
                            ) : (
                                <Input type="number" min={1} value={intervaloDias} onChange={e => setIntervaloDias(Number(e.target.value))} />
                            )}
                          </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label>1º Vencimento (Início)</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !dataPrimeiroVencimento && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecione</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus locale={ptBR} /></PopoverContent>
                        </Popover>
                      </div>
                   </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Tags Manuais (Outras)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {tagsParaPreenchimentoManual.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag manual extra detectada.</p>}
              {tagsParaPreenchimentoManual.map(tag => (
                <div key={tag} className="space-y-1">
                  <Label className="text-xs">{tag}</Label>
                  <Input placeholder={`Valor para ${tag}`} value={valoresTags[tag] || ''} onChange={e => setValoresTags(prev => ({...prev, [tag]: e.target.value}))} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit sticky top-6">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Prévia do Documento
              <Button variant="ghost" size="sm" onClick={handlePreview}><Eye className="h-4 w-4 mr-2" /> Ampliar</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border p-6 rounded bg-slate-50 dark:bg-white text-zinc-900 min-h-[400px] text-sm overflow-y-auto max-h-[600px] ql-editor" 
                 dangerouslySetInnerHTML={{ __html: renderConteudo() }} />
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-6 flex justify-end space-x-4">
        {renderActionButtons()}
      </div>

      <ContratoPreviewDialog 
        open={previewOpen} 
        onOpenChange={setPreviewOpen} 
        conteudoHtml={renderConteudo()} 
        titulo={tituloDocumento} 
        isHtml={true} 
      />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;