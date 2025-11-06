import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon, Eye, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, ContratoGerado } from '@/types/contratos';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cliente } from '@/types/cliente';
import { format, addDays, parseISO } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';
type TipoConteudo = 'html' | 'texto';

interface EmpresaLogada {
    nome: string;
    email: string;
    documento?: string | null;
    endereco_completo?: string | null;
}

interface EmpresaContrato {
    id: string;
    nome: string;
}

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [contratoInicial, setContratoInicial] = useState<ContratoGerado | null>(null);
  const [tags, setTags] = useState<ContratoTag[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);
  const [empresaLogada, setEmpresaLogada] = useState<EmpresaLogada | null>(null);
  
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  
  const [tipoConteudo, setTipoConteudo] = useState<TipoConteudo>('html'); 
  
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number>(0); // Inicializado como 0
  
  const [empresaContratoId, setEmpresaContratoId] = useState<string | null>(null); 
  
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(undefined);
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(undefined);
  const [intervaloDias, setIntervaloDias] = useState<number>(30);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const isEditing = !!contratoId;
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (date: Date) => format(date, 'dd/MM/yyyy');

  // --- FUNÇÃO PRINCIPAL DE BUSCA DE DADOS INICIAIS ---
  const buscarDados = useCallback(async () => {
    if (!modeloId || !ownerIdLogado) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    // 1. Buscar Modelo
    const { data: modeloData, error: modeloError } = await supabase
        .from('contrato_modelos')
        .select('*')
        .eq('id', modeloId)
        .single();
        
    if (modeloError) {
        showError('Modelo não encontrado ou acesso negado.');
        navigate('/contratos', { replace: true });
        return;
    }
    setModelo(modeloData as ContratoModelo);
    
    // 2. Configurar Empresa Logada (Contratante)
    let currentEmpresaLogada: EmpresaLogada | null = null;
    if (isAdmin || isCliente) {
        const profile = perfil as ClienteProfile;
        currentEmpresaLogada = {
            nome: profile.nome,
            email: profile.email,
            documento: profile.documento,
            endereco_completo: profile.endereco_completo,
        };
    } else if (role === 'Usuario' && ownerIdLogado) {
        const { data: empresaData } = await supabase.from('tbl_clientes').select('nome, email, documento, endereco_completo').eq('id', ownerIdLogado).single();
        if (empresaData) {
            currentEmpresaLogada = empresaData;
        }
    }
    setEmpresaLogada(currentEmpresaLogada);
    
    // 3. Configurar Empresas Contratantes (Apenas Admin)
    let initialEmpresaContratoId = ownerIdLogado;
    if (isAdmin) {
        const { data: clientesData, error: clientesError } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('aprovado', true)
            .order('nome');
            
        if (clientesError) {
            showError('Erro ao carregar clientes do sistema: ' + clientesError.message);
        } else {
            const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Meus Contratos (Admin)' };
            const allClients = [adminOption, ...(clientesData as EmpresaContrato[])];
            setEmpresasContrato(allClients);
            initialEmpresaContratoId = allClients[0].id;
        }
    }
    
    // 4. Carregar Contrato Inicial (se for edição)
    if (contratoId) {
        const { data: contratoData, error: contratoLoadError } = await supabase
            .from('contratos_gerados')
            .select('*')
            .eq('id', contratoId)
            .single();
            
        if (contratoLoadError) {
            showError('Contrato para edição não encontrado ou acesso negado.');
            navigate('/contratos', { replace: true });
            return;
        }
        
        const contrato = contratoData as ContratoGerado;
        setContratoInicial(contrato);
        initialEmpresaContratoId = contrato.empresa_id; // Sobrescreve o ID inicial
        
        setClienteSelecionadoId(contrato.cliente_id);
        setValorTotal(contrato.valor_total); // Define o valor total
        setValoresTags(contrato.valores_tags_preenchidos || {});
        
        const numParcelas = contrato.numero_parcelas;
        const valorTotalContrato = contrato.valor_total;
        
        const isContractOwnerAdmin = contrato.empresa_id === ownerIdLogado && isAdmin;
        const tabelaContasReceber = isContractOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
        const tabelaParcelas = isContractOwnerAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
        
        // Busca a conta sintética para obter o ID da conta a receber
        const { data: contaReceberData, error: contaReceberError } = await supabase
            .from(tabelaContasReceber)
            .select('id')
            .eq('contrato_gerado_id', contrato.id)
            .limit(1)
            .single();
            
        if (contaReceberError && contaReceberError.code !== 'PGRST116') {
            console.error(`Erro ao buscar conta sintética na tabela ${tabelaContasReceber}:`, contaReceberError);
        }
            
        const contaReceberId = contaReceberData?.id;

        if (contaReceberId) {
            const { data: primeiraParcela, error: parcelaError } = await supabase
                .from(tabelaParcelas)
                .select('valor_parcela, data_vencimento')
                .eq('conta_receber_id', contaReceberId)
                .order('numero_parcela', { ascending: true })
                .limit(1)
                .single();
                
            if (parcelaError && parcelaError.code !== 'PGRST116') {
                console.error(`Erro ao buscar primeira parcela na tabela ${tabelaParcelas}:`, parcelaError);
            }
                
            if (primeiraParcela) {
                if (numParcelas === 1) {
                    setTipoLancamento('unico');
                    setDataVencimentoUnico(primeiraParcela.data_vencimento ? parseISO(primeiraParcela.data_vencimento) : undefined);
                    setNumeroParcelas(1);
                } else {
                    const valorParcela = primeiraParcela.valor_parcela || 0;
                    
                    // Determina se é parcelar ou repetir
                    if (Math.abs(valorTotalContrato - (valorParcela * numParcelas)) < 0.01) {
                        setTipoLancamento('parcelar');
                    } else {
                        setTipoLancamento('repetir');
                    }
                    
                    setNumeroParcelas(numParcelas);
                    setDataPrimeiroVencimento(primeiraParcela.data_vencimento ? parseISO(primeiraParcela.data_vencimento) : undefined);
                    setIntervaloDias(contrato.dia_vencimento_parcela || 30);
                }
            } else {
                // Fallback: Usa os dados do contrato para preencher o formulário
                console.error('LOG: Conta sintética encontrada, mas sem parcelas associadas. Usando dados do contrato.');
                if (numParcelas === 1) {
                    setTipoLancamento('unico');
                    setDataVencimentoUnico(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
                } else {
                    setTipoLancamento('parcelar'); // Assume parcelar como padrão para múltiplos
                    setNumeroParcelas(numParcelas);
                    setDataPrimeiroVencimento(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
                    setIntervaloDias(contrato.dia_vencimento_parcela || 30);
                }
            }
        } else {
            // Fallback: Usa os dados do contrato para preencher o formulário
            console.error('LOG: Conta sintética não encontrada. Usando dados do contrato.');
            if (numParcelas === 1) {
                setTipoLancamento('unico');
                setDataVencimentoUnico(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
            } else {
                setTipoLancamento('parcelar');
                setNumeroParcelas(numParcelas);
                setDataPrimeiroVencimento(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
                setIntervaloDias(contrato.dia_vencimento_parcela || 30);
            }
        }
        
        setTipoConteudo(contrato.valores_tags_preenchidos?.tipo_conteudo || 'html');
    } else {
        // Novo Contrato
        const isHtmlContent = modeloData?.conteudo_template?.trim().startsWith('<') ?? true;
        setTipoConteudo(isHtmlContent ? 'html' : 'texto');
        setValorTotal(0);
    }
    
    setEmpresaContratoId(initialEmpresaContratoId);
    
    // A lista de clientes e tags será carregada no próximo useEffect (monitorando empresaContratoId)
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, navigate, role, perfil, usuario, isAdmin, isCliente, contratoId]);
  
  // --- FUNÇÃO DE BUSCA DE CLIENTES E TAGS DEPENDENTE DO PROPRIETÁRIO ---
  const fetchDependentData = useCallback(async (targetEmpresaId: string) => {
    if (!targetEmpresaId) return;
    
    // 1. Buscar Tags Customizadas
    const { data: tagsData } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', targetEmpresaId)
        .order('nome_tag');
        
    if (tagsData) {
        setTags(tagsData as ContratoTag[]);
    }
    
    // 2. Buscar Clientes (Contratados)
    let combinedClients: Cliente[] = [];
    
    // Regra 1: Se o proprietário do contrato for o Admin logado ('Meus Contratos (Admin)')
    if (isAdmin && targetEmpresaId === ownerIdLogado) {
        // Busca na tbl_clientes onde admin_id é o ID do Admin logado
        const { data: systemClientsData, error: systemClientsError } = await supabase
            .from('tbl_clientes')
            .select('id, nome, email, cpf, rg, nome_mae, nome_pai, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, criado_em')
            .eq('admin_id', ownerIdLogado) // FILTRO CORRIGIDO
            .eq('aprovado', true)
            .order('nome');
            
        if (systemClientsError) {
            showError('Erro ao carregar clientes do sistema: ' + systemClientsError.message);
        } else if (systemClientsData) {
            // Mapeamento para o tipo Cliente[]
            combinedClients = (systemClientsData as any[]).map(sc => ({
                id: sc.id,
                proprietario_id: ownerIdLogado, // AJUSTE AQUI
                nome: sc.nome,
                razao_social: sc.nome, // Usando nome como fallback
                nome_fantasia: sc.nome, // Usando nome como fallback
                documento: sc.cpf || null, 
                email: sc.email || null,
                telefone: sc.telefone || null,
                telefone_fixo: null, 
                cep: sc.cep || null,
                endereco: sc.endereco || null,
                numero: sc.numero || null,
                complemento: sc.complemento || null,
                bairro: sc.bairro || null,
                cidade: sc.cidade || null,
                estado: sc.estado || null,
                created_at: sc.criado_em,
                updated_at: sc.criado_em,
            }));
        }
    } else {
        // Regra 2: Se o proprietário for um Cliente (ou o Admin selecionou um Cliente), os clientes são da tabela 'clientes' (CR)
        const { data: clientesCRData, error: clientesCRError } = await supabase
            .from('clientes')
            .select('*')
            .eq('proprietario_id', targetEmpresaId); // AJUSTE AQUI
        if (clientesCRError) {
            showError('Erro ao carregar clientes de CR: ' + clientesCRError.message);
        } else if (clientesCRData) {
            combinedClients.push(...(clientesCRData as Cliente[]));
        }
    }
    
    combinedClients.sort((a, b) => a.nome.localeCompare(b.nome));
    setClientes(combinedClients);
    
    // Se o cliente selecionado não estiver mais na lista, limpa a seleção
    if (clienteSelecionadoId && !combinedClients.some(c => c.id === clienteSelecionadoId)) {
        setClienteSelecionadoId('');
    }
    
  }, [isAdmin, ownerIdLogado, clienteSelecionadoId]);


  useEffect(() => {
    if (!carregandoSessao && (isAdmin || isCliente || (role === 'Usuario' && ownerIdLogado))) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isCliente) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, isAdmin, isCliente, role, ownerIdLogado, buscarDados, navigate]);
  
  // Efeito para monitorar a mudança do proprietário do contrato (empresaContratoId)
  useEffect(() => {
      if (empresaContratoId) {
          fetchDependentData(empresaContratoId);
      }
  }, [empresaContratoId, fetchDependentData]);


  useEffect(() => {
    const updateTags = () => {
        const newTags: Record<string, string> = {};
        const cliente = clientes.find(c => c.id === clienteSelecionadoId);
        
        const valorNumerico = Number(valorTotal);
        const numParcelas = Number(numeroParcelas);
        
        const valorFinalContrato = tipoLancamento === 'repetir' ? valorNumerico * numParcelas : valorNumerico;
        const valorParcela = tipoLancamento === 'parcelar' ? (valorNumerico / numParcelas) : valorNumerico;
        
        let primeiroVencimento: Date | undefined;
        if (tipoLancamento === 'unico') {
            primeiroVencimento = dataVencimentoUnico;
        } else {
            primeiroVencimento = dataPrimeiroVencimento;
        }

        TAGS_PADRAO.forEach(tag => {
            switch (tag.nome_tag) {
                case '{{EMPRESA_NOME}}':
                    newTags[tag.nome_tag] = empresaLogada?.nome || 'N/A';
                    break;
                case '{{EMPRESA_EMAIL}}':
                    newTags[tag.nome_tag] = empresaLogada?.email || 'N/A';
                    break;
                case '{{EMPRESA_DOCUMENTO}}':
                    newTags[tag.nome_tag] = empresaLogada?.documento || 'N/A';
                    break;
                case '{{EMPRESA_ENDERECO}}':
                    newTags[tag.nome_tag] = empresaLogada?.endereco_completo || 'N/A';
                    break;
                case '{{CLIENTE_NOME}}':
                    newTags[tag.nome_tag] = cliente?.nome_fantasia || cliente?.nome || 'N/A';
                    break;
                case '{{CLIENTE_RAZAO_SOCIAL}}':
                    newTags[tag.nome_tag] = cliente?.razao_social || 'N/A';
                    break;
                case '{{CLIENTE_DOCUMENTO}}':
                    newTags[tag.nome_tag] = cliente?.documento || 'N/A';
                    break;
                case '{{CLIENTE_EMAIL}}':
                    newTags[tag.nome_tag] = cliente?.email || 'N/A';
                    break;
                case '{{CLIENTE_ENDERECO}}':
                    newTags[tag.nome_tag] = cliente?.endereco && cliente?.numero ? `${cliente.endereco}, ${cliente.numero}` : 'N/A';
                    break;
                case '{{CLIENTE_BAIRRO}}':
                    newTags[tag.nome_tag] = cliente?.bairro || 'N/A';
                    break;
                case '{{CLIENTE_CIDADE}}':
                    newTags[tag.nome_tag] = cliente?.cidade || 'N/A';
                    break;
                case '{{CLIENTE_ESTADO}}':
                    newTags[tag.nome_tag] = cliente?.estado || 'N/A';
                    break;
                case '{{VALOR_TOTAL_CONTRATO}}':
                    newTags[tag.nome_tag] = formatCurrency(valorFinalContrato);
                    break;
                case '{{VALOR_PARCELA}}':
                    newTags[tag.nome_tag] = formatCurrency(valorParcela);
                    break;
                case '{{NUMERO_PARCELAS}}':
                    newTags[tag.nome_tag] = String(numParcelas);
                    break;
                case '{{PRIMEIRO_VENCIMENTO}}':
                    newTags[tag.nome_tag] = primeiroVencimento ? formatDate(primeiroVencimento) : 'N/A';
                    break;
                case '{{DATA_EMISSAO}}':
                    newTags[tag.nome_tag] = formatDate(new Date());
                    break;
                default:
                    newTags[tag.nome_tag] = valoresTags[tag.nome_tag] || '';
                    break;
            }
        });
        
        setValoresTags(prev => {
            const customTags = tags.map(t => t.nome_tag).filter(key => !TAGS_PADRAO.some(t => t.nome_tag === key));
            const updatedTags = { ...newTags };
            customTags.forEach(key => {
                updatedTags[key] = prev[key] || '';
            });
            return updatedTags;
        });
    };
    
    updateTags();
  }, [clienteSelecionadoId, valorTotal, tipoLancamento, numeroParcelas, dataVencimentoUnico, dataPrimeiroVencimento, clientes, empresaLogada, intervaloDias, tipoConteudo, tags, valoresTags]);


  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    for (const tag in tags) {
        const regex = new RegExp(tag, 'g');
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[tag]);
    }
    
    return conteudoRenderizado;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
      setConteudoPreview(conteudoRenderizado);
      setPreviewOpen(true);
  };

  const gerarParcelas = (
    valorTotal: number, 
    tipoLancamento: TipoLancamento,
    numParcelas: number, 
    dataVencimentoUnico: Date | undefined,
    dataPrimeiroVencimento: Date | undefined,
    intervaloDias: number,
  ) => {
    const parcelas = [];
    
    if (tipoLancamento === 'unico' && dataVencimentoUnico) {
        parcelas.push({ 
            numero_parcela: 1, 
            valor_parcela: valorTotal, 
            data_vencimento: format(dataVencimentoUnico, 'yyyy-MM-dd'), 
            status: 'aberta' 
        });
    } else if (tipoLancamento !== 'unico' && dataPrimeiroVencimento && numParcelas >= 1 && intervaloDias >= 1) {
        const valorParcela = tipoLancamento === 'parcelar' ? (valorTotal / numParcelas) : valorTotal;
        
        for (let i = 0; i < numParcelas; i++) {
            const dataVencimento = addDays(dataPrimeiroVencimento, i * intervaloDias);
            
            parcelas.push({
                numero_parcela: i + 1,
                valor_parcela: valorParcela,
                data_vencimento: format(dataVencimento, 'yyyy-MM-dd'),
                status: 'aberta'
            });
        }
    }
    return parcelas;
  };

  const handleSalvarContrato = async () => {
    const valorNumerico = Number(valorTotal);
    const numParcelas = Number(numeroParcelas);
    
    if (!modelo || !clienteSelecionadoId || valorNumerico <= 0 || !empresaContratoId) {
        showError('Preencha Cliente, Valor Total e Proprietário.');
        return;
    }
    
    if (tipoLancamento === 'unico' && !dataVencimentoUnico) {
        showError('Selecione a Data de Vencimento para o lançamento único.');
        return;
    }
    
    if (tipoLancamento !== 'unico') {
        if (numParcelas < 1) {
            showError('O número de parcelas deve ser pelo menos 1.');
            return;
        }
        if (!dataPrimeiroVencimento) {
            showError('Selecione a Data do Primeiro Vencimento.');
            return;
        }
        if (intervaloDias < 1) {
            showError('O intervalo de dias deve ser pelo menos 1.');
            return;
        }
    }
    
    setIsSubmitting(true);
    
    try {
        const clienteSelecionado = clientes.find(c => c.id === clienteSelecionadoId);
        if (!clienteSelecionado) throw new Error('Cliente selecionado não foi encontrado na lista.');

        const isContractOwnerAdmin = empresaContratoId === ownerIdLogado && isAdmin;

        // CORREÇÃO: Se for Admin, garantir que o cliente (de tbl_clientes) também exista na tabela 'clientes'
        if (isContractOwnerAdmin) {
            const clienteDataParaUpsert = {
                id: clienteSelecionado.id,
                proprietario_id: empresaContratoId, // AJUSTE AQUI
                nome: clienteSelecionado.nome,
                documento: clienteSelecionado.documento,
                email: clienteSelecionado.email,
                razao_social: clienteSelecionado.razao_social,
                nome_fantasia: clienteSelecionado.nome_fantasia,
                telefone: clienteSelecionado.telefone,
                telefone_fixo: clienteSelecionado.telefone_fixo,
                cep: clienteSelecionado.cep,
                endereco: clienteSelecionado.endereco,
                numero: clienteSelecionado.numero,
                complemento: clienteSelecionado.complemento,
                bairro: clienteSelecionado.bairro,
                cidade: clienteSelecionado.cidade,
                estado: clienteSelecionado.estado,
            };
            const { error: upsertError } = await supabase
                .from('clientes')
                .upsert(clienteDataParaUpsert, { onConflict: 'id' });

            if (upsertError) {
                throw new Error('Falha ao garantir a existência do cliente na tabela CR do admin: ' + upsertError.message);
            }
        }
        
        const parcelasParaInserir = gerarParcelas(
            valorNumerico, 
            tipoLancamento, 
            numParcelas, 
            dataVencimentoUnico, 
            dataPrimeiroVencimento, 
            intervaloDias
        );
        
        if (parcelasParaInserir.length === 0) {
            throw new Error('Falha ao gerar parcelas. Verifique os dados de pagamento.');
        }
        
        const valorFinalContrato = tipoLancamento === 'repetir' ? valorNumerico * numParcelas : valorNumerico;
        
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
        
        const contratoData = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId,
            empresa_id: empresaContratoId,
            status: 'pendente_assinatura',
            valor_total: valorFinalContrato,
            data_inicio: format(new Date(), 'yyyy-MM-dd'), 
            numero_parcelas: numParcelas,
            dia_vencimento_parcela: tipoLancamento === 'unico' ? null : intervaloDias, 
            valores_tags_preenchidos: { ...valoresTags, tipo_conteudo: tipoConteudo }, 
            conteudo_renderizado: conteudoRenderizado,
        };
        
        let contratoGeradoId: string;
        let contaReceberId: string | null = null;
        
        const tabelaContasReceber = isContractOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
        const tabelaParcelasReceber = isContractOwnerAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
        
        if (isEditing && contratoInicial) {
            const { error: updateError } = await supabase
                .from('contratos_gerados')
                .update(contratoData)
                .eq('id', contratoInicial.id);
                
            if (updateError) throw updateError;
            contratoGeradoId = contratoInicial.id;
            
            // 1. Buscar a conta sintética existente
            const { data: existingConta } = await supabase
                .from(tabelaContasReceber)
                .select('id')
                .eq('contrato_gerado_id', contratoGeradoId)
                .limit(1)
                .single();
                
            if (existingConta) {
                contaReceberId = existingConta.id;
                
                // 2. Deletar parcelas antigas
                const { error: deleteParcelasError } = await supabase
                    .from(tabelaParcelasReceber)
                    .delete()
                    .eq('conta_receber_id', contaReceberId);
                if (deleteParcelasError) throw deleteParcelasError;
            }
            
        } else {
            const { data: contratoGerado, error: contratoError } = await supabase
                .from('contratos_gerados')
                .insert(contratoData)
                .select('id')
                .single();
                
            if (contratoError) throw contratoError;
            contratoGeradoId = contratoGerado.id;
        }
        
        const clienteNome = clientes.find(c => c.id === clienteSelecionadoId)?.nome || 'Cliente Desconhecido';
        
        const baseData = isContractOwnerAdmin ? { admin_id: empresaContratoId, cliente_id: clienteSelecionadoId } : { empresa_id: empresaContratoId, cliente_id: clienteSelecionadoId };
        
        const contaReceberPayload = {
            ...baseData,
            descricao: `Contrato: ${modelo.titulo} - ${clienteNome}`,
            valor_total: valorFinalContrato,
            data_emissao: format(new Date(), 'yyyy-MM-dd'),
            data_vencimento: parcelasParaInserir[0].data_vencimento, 
            tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
            status: 'aberta',
            origem: 'contrato',
            contrato_gerado_id: contratoGeradoId,
        };
        
        if (contaReceberId) {
            // Atualiza a conta sintética existente
            const { error: updateContaError } = await supabase
                .from(tabelaContasReceber)
                .update(contaReceberPayload)
                .eq('id', contaReceberId);
            if (updateContaError) throw updateContaError;
        } else {
            // Cria uma nova conta sintética
            const { data: contaReceber, error: contaReceberError } = await supabase
                .from(tabelaContasReceber)
                .insert(contaReceberPayload)
                .select('id')
                .single();
                
            if (contaReceberError) throw contaReceberError;
            contaReceberId = contaReceber.id;
        }
        
        const parcelasComId = parcelasParaInserir.map(p => ({ 
            ...p, 
            conta_receber_id: contaReceberId, 
            ...(isContractOwnerAdmin ? { admin_id: empresaContratoId } : { empresa_id: empresaContratoId })
        }));
        
        const { error: parcelError } = await supabase
            .from(tabelaParcelasReceber)
            .insert(parcelasComId);
            
        if (parcelError) throw parcelError;

        showSuccess(`Contrato ${isEditing ? 'atualizado' : 'gerado'} e contas a receber ${isEditing ? 'reajustadas' : 'criadas'}!`);
        navigate('/contratos');
        
    } catch (error: any) {
        console.error('Erro ao salvar contrato:', error);
        showError('Falha ao salvar contrato e gerar contas: ' + error.message);
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
      return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent><p>Modelo de contrato não encontrado.</p></CardContent></Card></LayoutPrincipal>;
  }

  const isRepetirOuParcelar = tipoLancamento !== 'unico';
  const valorLabel = tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela';
  
  const tagsCustomizadas = tags.filter(tag => !TAGS_PADRAO.some(t => t.nome_tag === tag.nome_tag));

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Button 
            onClick={() => navigate('/contratos')} 
            variant="link" 
            type="button" // Adicionado type="button"
            className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
        >
            <ChevronLeft className="w-5 h-5" />
            Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar Contrato' : 'Preencher Contrato'}: {modelo.titulo}
        </h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle className="text-xl">Dados Financeiros</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                
                {isAdmin && (
                    <div className="space-y-2">
                        <Label htmlFor="empresa-contrato">Empresa Proprietária do Contrato</Label>
                        <Select 
                            value={empresaContratoId || ''} 
                            onValueChange={setEmpresaContratoId}
                            disabled={isEditing}
                        >
                            <SelectTrigger id="empresa-contrato">
                                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Selecione a Empresa" />
                            </SelectTrigger>
                            <SelectContent>
                                {empresasContrato.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                
                <div className="space-y-2">
                    <Label htmlFor="cliente">Cliente</Label>
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId} disabled={!empresaContratoId}>
                        <SelectTrigger id="cliente">
                            <SelectValue placeholder="Selecione o Cliente" />
                        </SelectTrigger>
                        <SelectContent>
                            {clientes.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="space-y-4">
                    <Label className="font-semibold">Forma de Pagamento</Label>
                    <RadioGroup 
                        value={tipoLancamento} 
                        onValueChange={(value: TipoLancamento) => setTipoLancamento(value)} 
                        className="flex space-x-4 pt-2"
                        disabled={isEditing}
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="unico" id="unico" />
                            <Label htmlFor="unico" className="font-normal">Único</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="repetir" id="repetir" />
                            <Label htmlFor="repetir" className="font-normal">Repetir Valor</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="parcelar" id="parcelar" />
                            <Label htmlFor="parcelar" className="font-normal">Parcelar Valor</Label>
                        </div>
                    </RadioGroup>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="valor-total">{valorLabel}</Label>
                    <Input 
                        id="valor-total"
                        type="number"
                        step="0.01"
                        value={valorTotal}
                        onChange={(e) => setValorTotal(Number(e.target.value))}
                        placeholder="0.00"
                    />
                </div>

                {tipoLancamento === 'unico' && (
                    <div className="space-y-2">
                        <Label htmlFor="data-vencimento">Data de Vencimento</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !dataVencimentoUnico && "text-muted-foreground")}>
                                    {dataVencimentoUnico ? format(dataVencimentoUnico, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus />
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
                
                {isRepetirOuParcelar && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="parcelas">Nº de Repetições/Parcelas</Label>
                            <Input 
                                id="parcelas"
                                type="number"
                                min="1"
                                value={numeroParcelas}
                                onChange={(e) => setNumeroParcelas(Number(e.target.value))}
                                disabled={isEditing}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="intervalo-dias">Intervalo (dias)</Label>
                            <Input 
                                id="intervalo-dias"
                                type="number"
                                min="1"
                                value={intervaloDias}
                                onChange={(e) => setIntervaloDias(Number(e.target.value))}
                                placeholder="30"
                                disabled={isEditing}
                            />
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="data-primeiro-vencimento">Data do 1º Vencimento</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !dataPrimeiroVencimento && "text-muted-foreground")}>
                                        {dataPrimeiroVencimento ? format(dataPrimeiroVencimento, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-xl">2. Preenchimento das Tags Dinâmicas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="p-3 bg-secondary rounded-md">
                    <h3 className="font-semibold text-sm mb-1">Tags Padrão (Preenchimento Automático)</h3>
                    <div className="flex flex-wrap gap-2">
                        {TAGS_PADRAO.map(tag => (
                            <span key={tag.id} className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                                {tag.nome_tag}
                            </span>
                        ))}
                    </div>
                </div>
                
                {tagsCustomizadas.length === 0 ? (
                    <p className="text-muted-foreground">Nenhuma tag customizada cadastrada para esta empresa.</p>
                ) : (
                    tagsCustomizadas.map(tag => (
                        <div key={tag.id} className="space-y-1">
                            <Label htmlFor={tag.nome_tag} className="font-semibold">{tag.descricao} ({tag.nome_tag})</Label>
                            <Input 
                                id={tag.nome_tag}
                                value={valoresTags[tag.nome_tag] || ''}
                                onChange={(e) => handleTagChange(tag.nome_tag, e.target.value)}
                                placeholder={`Insira o valor para ${tag.nome_tag}`}
                            />
                            {tag.origem_dado && <p className="text-xs text-muted-foreground mt-1">Sugestão de origem: {tag.origem_dado}</p>}
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
        
        <div className="lg:col-span-3 flex flex-col sm:flex-row gap-4">
            <Button 
                onClick={handlePreview} 
                variant="outline"
                className="flex-1 h-12"
                disabled={!modelo || !clienteSelecionadoId || valorTotal <= 0}
            >
                <Eye className="mr-2 h-4 w-4" />
                Visualizar Contrato
            </Button>
            <Button 
                onClick={handleSalvarContrato} 
                className="flex-1 h-12"
                disabled={isSubmitting || !clienteSelecionadoId || valorTotal <= 0}
            >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditing ? 'Salvar Edição e Reajustar Contas' : 'Salvar e Gerar Contas a Receber'}
            </Button>
        </div>
        
      </div>
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={modelo?.titulo || 'Prévia'}
        isHtml={tipoConteudo === 'html'} 
      />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;