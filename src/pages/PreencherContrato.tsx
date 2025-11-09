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
import { ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cliente } from '@/types/cliente';
import { format, addDays, parseISO } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';
type TipoConteudo = 'html' | 'texto';

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

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [contratoInicial, setContratoInicial] = useState<ContratoGerado | null>(null);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
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
  const [valorTotal, setValorTotal] = useState<number>(0);
  
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  
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

  // --- FUNÇÃO DE BUSCA DE CLIENTES E TAGS DEPENDENTE DO PROPRIETÁRIO ---
  const fetchDependentData = useCallback(async (targetEmpresaId: string) => {
    if (!targetEmpresaId) return;
    
    // 1. Buscar Tags Customizadas ATIVAS
    const { data: tagsData } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', targetEmpresaId)
        .order('nome_tag', { ascending: true });
        
    if (tagsData) {
        setTagsCustomizadas(tagsData as ContratoTag[]);
    }
    
    // 2. Buscar Clientes (Contratados) - Sempre da tabela 'clientes' (CR)
    const { data: clientesCRData, error: clientesCRError } = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetEmpresaId)
        .order('nome');
        
    if (clientesCRError) {
        showError('Erro ao carregar clientes de Contas a Receber: ' + clientesCRError.message);
        setClientes([]);
        return;
    }
    
    let combinedClients = clientesCRData as Cliente[];
    
    // NOVO: Incluir clientes do sistema (tbl_clientes) que são aprovados e não estão na lista CR
    const { data: systemClientsData, error: systemClientsError } = await supabase
        .from('tbl_clientes')
        .select('id, nome, email, cpf, rg, telefone, cep, endereco, numero, complemento, bairro, cidade, estado')
        .eq('aprovado', true)
        .order('nome');
        
    if (systemClientsError) {
        console.error('Erro ao carregar clientes do sistema:', systemClientsError);
    } else {
        const existingCrIds = new Set(combinedClients.map(c => c.id));
        
        // Filtra clientes do sistema que ainda não estão na lista CR
        const newSystemClients = (systemClientsData as ClienteProfile[]).filter(sc => !existingCrIds.has(sc.id));
        
        const mappedSystemClients: Cliente[] = newSystemClients.map(sc => ({
            id: sc.id,
            proprietario_id: targetEmpresaId, // Define o proprietário do contrato como proprietário
            nome: sc.nome,
            email: sc.email,
            documento: sc.cpf || sc.rg,
            // Mapeamento de endereço
            cep: sc.cep,
            endereco: sc.endereco,
            numero: sc.numero,
            complemento: sc.complemento,
            bairro: sc.bairro,
            cidade: sc.cidade,
            estado: sc.estado,
            // Campos opcionais da interface Cliente (para evitar TS errors)
            razao_social: sc.nome,
            nome_fantasia: sc.nome,
            telefone_fixo: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }));
        
        combinedClients = [...combinedClients, ...mappedSystemClients];
    }
    
    combinedClients.sort((a, b) => a.nome.localeCompare(b.nome));
    setClientes(combinedClients);
    
  }, [setTagsCustomizadas, setClientes, showError]);


  // --- FUNÇÃO PRINCIPAL DE BUSCA DE DADOS INICIAIS ---
  const buscarDados = useCallback(async () => {
    if (!modeloId || !ownerIdLogado) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    try {
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
        if (isAdmin) {
            const profile = perfil as AdminProfile;
            currentEmpresaLogada = {
                nome: profile.nome, email: profile.email, documento: profile.cnpj || profile.cpf,
                endereco_completo: `${profile.endereco || ''}, ${profile.numero || ''} ${profile.complemento || ''} - ${profile.bairro || ''}, ${profile.cidade || ''}/${profile.estado || ''}`,
                cpf: profile.cpf, cnpj: profile.cnpj, rg: profile.rg, telefone: profile.telefone, cep: profile.cep, endereco: profile.endereco, numero: profile.numero, complemento: profile.complemento, bairro: profile.bairro, cidade: profile.cidade, estado: profile.estado,
            };
        } else if (isCliente) {
            const profile = perfil as ClienteProfile;
            currentEmpresaLogada = {
                nome: profile.nome, email: profile.email, documento: profile.documento || profile.cpf,
                endereco_completo: `${profile.endereco || ''}, ${profile.numero || ''} ${profile.complemento || ''} - ${profile.bairro || ''}, ${profile.cidade || ''}/${profile.estado || ''}`,
                cpf: profile.cpf, cnpj: null, rg: profile.rg, telefone: profile.telefone, cep: profile.cep, endereco: profile.endereco, numero: profile.numero, complemento: profile.complemento, bairro: profile.bairro, cidade: profile.cidade, estado: profile.estado,
            };
        } else if (role === 'Usuario' && ownerIdLogado) {
            const { data: empresaData } = await supabase.from('tbl_clientes').select('nome, email, documento, cpf, rg, telefone, cep, endereco, numero, complemento, bairro, cidade, estado').eq('id', ownerIdLogado).single();
            if (empresaData) {
                currentEmpresaLogada = {
                    ...empresaData,
                    documento: empresaData.documento || empresaData.cpf,
                    endereco_completo: `${empresaData.endereco || ''}, ${empresaData.numero || ''} ${empresaData.complemento || ''} - ${empresaData.bairro || ''}, ${empresaData.cidade || ''}/${empresaData.estado || ''}`,
                    cnpj: null,
                };
            }
        }
        setEmpresaLogada(currentEmpresaLogada);
        
        // 3. Configurar Empresas Contratantes (Apenas Admin)
        let initialProprietarioContratoId = ownerIdLogado;
        if (isAdmin) {
            const { data: clientesData } = await supabase
                .from('tbl_clientes')
                .select('id, nome')
                .eq('aprovado', true)
                .order('nome');
                
            if (clientesData) {
                const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Meus Contratos (Admin)' };
                const allClients = [adminOption, ...(clientesData as EmpresaContrato[])];
                setEmpresasContrato(allClients);
                initialProprietarioContratoId = allClients[0].id;
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
            initialProprietarioContratoId = contrato.proprietario_id;
            
            setClienteSelecionadoId(contrato.cliente_id);
            setValorTotal(contrato.valor_total);
            setValoresTags(contrato.valores_tags_preenchidos || {});
            
            const numParcelas = contrato.numero_parcelas;
            const valorTotalContrato = contrato.valor_total;
            
            const isContractOwnerAdmin = contrato.proprietario_id === ownerIdLogado && isAdmin;
            const tabelaContasReceber = isContractOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
            const tabelaParcelas = isContractOwnerAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
            
            // Busca a conta sintética para obter o ID da conta a receber
            const { data: existingConta } = await supabase
                .from(tabelaContasReceber)
                .select('id')
                .eq('contrato_gerado_id', contrato.id)
                .limit(1)
                .single();
                
            const contaReceberId = existingConta?.id;

            if (contaReceberId) {
                const { data: primeiraParcela } = await supabase
                    .from(tabelaParcelas)
                    .select('valor_parcela, data_vencimento')
                    .eq('conta_receber_id', contaReceberId)
                    .order('numero_parcela', { ascending: true })
                    .limit(1)
                    .single();
                    
                if (primeiraParcela) {
                    if (numParcelas === 1) {
                        setTipoLancamento('unico');
                        setDataVencimentoUnico(primeiraParcela.data_vencimento ? parseISO(primeiraParcela.data_vencimento) : undefined);
                        setNumeroParcelas(1);
                    } else {
                        const valorParcela = primeiraParcela.valor_parcela || 0;
                        
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
            } else {
                // Fallback: Usa os dados do contrato para preencher o formulário
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
        
        setProprietarioContratoId(initialProprietarioContratoId);
        
    } catch (error) {
        console.error('Erro fatal em buscarDados:', error);
        showError('Erro fatal ao carregar dados iniciais.');
    } finally {
        setCarregandoDados(false);
    }
  }, [modeloId, ownerIdLogado, navigate, role, perfil, usuario, isAdmin, isCliente, contratoId]);
  
  // Efeito 1: Carregamento inicial e verificação de permissão (CORRIGIDO)
useEffect(() => {
  if (carregandoSessao || role === undefined) return;

  const allowedRoles = ['Admin', 'Cliente', 'Usuario'];

  if (role === null || !allowedRoles.includes(role)) {
    navigate('/painel', { replace: true });
    return;
  }

  buscarDados();
}, [carregandoSessao, role, navigate, buscarDados]);

  
  // Efeito 2: Monitorar a mudança do proprietário do contrato (proprietarioContratoId)
  useEffect(() => {
      if (proprietarioContratoId) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData]);


  const updateTags = useCallback(() => {
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
    
    // Combina tags padrão e customizadas ativas
    const allActiveTags = [...TAGS_PADRAO, ...tagsCustomizadas];

    allActiveTags.forEach(tag => {
        const tagKey = tag.nome_tag;
        let tagValue: string | null = null;
        
        // 1. Tenta preencher tags financeiras (TAGS_PADRAO)
        switch (tagKey) {
            case '{{VALOR_TOTAL_CONTRATO}}':
                tagValue = formatCurrency(valorFinalContrato);
                break;
            case '{{VALOR_PARCELA}}':
                tagValue = formatCurrency(valorParcela);
                break;
            case '{{NUMERO_PARCELAS}}':
                tagValue = String(numParcelas);
                break;
            case '{{PRIMEIRO_VENCIMENTO}}':
                tagValue = primeiroVencimento ? formatDate(primeiroVencimento) : 'N/A';
                break;
            case '{{DATA_EMISSAO}}':
                tagValue = formatDate(new Date());
                break;
        }
        
        // 2. Tenta preencher tags de sistema (EMPRESA_NOME, CLIENTE_NOME, USUARIO_NOME, etc.)
        if (tag.origem_dado) {
            const [sourceTable, sourceField] = tag.origem_dado.split('.');
            
            // Mapeamento de dados da Empresa Logada (Contratada) - tbl_clientes / tbl_admins
            if (sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') {
                const empresaData = empresaLogada as any;
                if (empresaData && empresaData[sourceField]) {
                    tagValue = String(empresaData[sourceField]);
                }
            } 
            
            // Mapeamento de dados do Cliente Selecionado (Contratante) - clientes
            else if (sourceTable === 'clientes' && cliente) {
                const clienteData = cliente as any;
                if (clienteData && clienteData[sourceField]) {
                    tagValue = String(clienteData[sourceField]);
                }
            } 
            
            // Mapeamento de dados do Usuário (Funcionário) - tbl_usuarios
            else if (sourceTable === 'tbl_usuarios' && perfil && 'cliente_id' in perfil) {
                const usuarioData = perfil as UsuarioProfile;
                if (usuarioData && (usuarioData as any)[sourceField]) {
                    // Formatação especial para valores numéricos/data
                    if (sourceField.includes('salario') || sourceField.includes('horas')) {
                        tagValue = String((usuarioData as any)[sourceField] || 'N/A');
                    } else if (sourceField.includes('data')) {
                        const dateValue = (usuarioData as any)[sourceField];
                        tagValue = dateValue ? formatDate(parseISO(dateValue)) : 'N/A';
                    } else {
                        tagValue = String((usuarioData as any)[sourceField] || 'N/A');
                    }
                }
            }
        }
        
        // 3. Se o valor foi preenchido automaticamente, usa-o.
        if (tagValue !== null) {
            newTags[tagKey] = tagValue;
        } else {
            // 4. Caso contrário, usa o valor salvo anteriormente (se edição) ou o valor digitado.
            newTags[tagKey] = valoresTags[tagKey] || '';
        }
    });
    
    setValoresTags(newTags);
  }, [clienteSelecionadoId, valorTotal, tipoLancamento, numeroParcelas, dataVencimentoUnico, dataPrimeiroVencimento, clientes, empresaLogada, tagsCustomizadas, valoresTags, intervaloDias, tipoConteudo, perfil]);


  useEffect(() => {
    // Este efeito agora só chama a função de atualização
    updateTags();
  }, [updateTags]);


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
    
    if (!modelo || !clienteSelecionadoId || valorNumerico <= 0 || !proprietarioContratoId) {
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

        const isContractOwnerAdmin = proprietarioContratoId === ownerIdLogado && isAdmin;

        // CORREÇÃO: Se for Admin, garantir que o cliente (de tbl_clientes) também exista na tabela 'clientes'
        if (isContractOwnerAdmin) {
            const clienteDataParaUpsert = {
                id: clienteSelecionado.id,
                proprietario_id: proprietarioContratoId, // AJUSTE AQUI
                nome: clienteSelecionado.nome,
                razao_social: clienteSelecionado.razao_social,
                nome_fantasia: clienteSelecionado.nome_fantasia,
                documento: clienteSelecionado.documento,
                email: clienteSelecionado.email,
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
            proprietario_id: proprietarioContratoId, // RENOMEADO: empresa_id -> proprietario_id
            status: 'pendente_assinatura',
            data_inicio: format(new Date(), 'yyyy-MM-dd'), 
            numero_parcelas: numParcelas,
            dia_vencimento_parcela: tipoLancamento === 'unico' ? null : intervaloDias, 
            valores_tags_preenchidos: { ...valoresTags, tipo_conteudo: tipoConteudo }, 
            conteudo_renderizado: conteudoRenderizado,
            valor_total: valorFinalContrato, // Movido para o final
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
                .eq('contrato_gerado_id', contratoInicial.id)
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
        
        const baseData = isContractOwnerAdmin ? { admin_id: proprietarioContratoId, cliente_id: clienteSelecionadoId } : { empresa_id: proprietarioContratoId, cliente_id: clienteSelecionadoId };
        
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
            ...(isContractOwnerAdmin ? { admin_id: proprietarioContratoId } : { empresa_id: proprietarioContratoId })
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
  
  // Combina tags customizadas e tags padrão que não são financeiras
  const tagsCustomizadasECliente = [...tagsCustomizadas, ...TAGS_PADRAO.filter(t => t.origem_dado && !t.origem_dado.startsWith('contas_receber'))];
  
  // Filtra tags que já foram preenchidas automaticamente (para não pedir valor manual)
  const tagsParaPreenchimentoManual = tagsCustomizadasECliente.filter(tag => {
      // Tags financeiras e tags de empresa logada (EMPRESA_*) são sempre preenchidas automaticamente
      if (TAGS_PADRAO.some(t => t.nome_tag === tag.nome_tag && t.origem_dado?.startsWith('contas_receber'))) {
          return false;
      }
      if (TAGS_PADRAO.some(t => t.nome_tag === tag.nome_tag && t.origem_dado?.startsWith('tbl_clientes'))) {
          return false;
      }
      if (TAGS_PADRAO.some(t => t.nome_tag === tag.nome_tag && t.origem_dado?.startsWith('tbl_admins'))) {
          return false;
      }
      
      // Se a tag tem origem de dado e o valor foi preenchido automaticamente, não precisa de input manual
      if (tag.origem_dado && valoresTags[tag.nome_tag]) {
          return false;
      }
      
      // Se a tag é customizada ou de cliente (CLIENTE_*) e não foi preenchida, precisa de input manual
      if (tag.nome_tag.startsWith('{{CLIENTE_') || tag.nome_tag.startsWith('{{USUARIO_') || !tag.origem_dado) {
          return true;
      }
      
      return false;
  });
  
  const isReadyToSave = clienteSelecionadoId && valorTotal > 0 && (
      (tipoLancamento === 'unico' && dataVencimentoUnico) ||
      (isRepetirOuParcelar && numeroParcelas >= 1 && dataPrimeiroVencimento && intervaloDias >= 1)
  );

  return (
    <LayoutPrincipal>
       <div className="flex items-center mb-6">
        <Button 
            onClick={() => navigate('/contratos/novo')} 
            variant="link" 
            type="button"
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
                            value={proprietarioContratoId || ''} 
                            onValueChange={setProprietarioContratoId}
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
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId} disabled={!proprietarioContratoId}>
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
                
                {/* BOTÕES DUPLICADOS AQUI (AJUSTADOS) */}
                <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                    <Button 
                        onClick={handlePreview} 
                        variant="outline"
                        size="sm" // Tamanho menor
                        className="flex-1 h-8" // Altura menor
                        disabled={!modelo || !clienteSelecionadoId || valorTotal <= 0}
                    >
                        <Eye className="mr-1 h-3 w-3" />
                        Pré-visualizar Template
                    </Button>
                    <Button 
                        onClick={handleSalvarContrato} 
                        size="sm" // Tamanho menor
                        className="flex-1 h-8" // Altura menor
                        disabled={isSubmitting || !isReadyToSave}
                    >
                        {isSubmitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                        {isEditing ? 'Salvar Edição' : 'Salvar e Gerar'}
                    </Button>
                </div>
                {/* FIM BOTÕES DUPLICADOS */}
                
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
                
                {tagsParaPreenchimentoManual.length === 0 ? (
                    <p className="text-muted-foreground">Nenhuma tag customizada ou de cliente requer preenchimento manual.</p>
                ) : (
                    tagsParaPreenchimentoManual.map(tag => (
                        <div key={tag.id} className="space-y-1">
                            <Label htmlFor={tag.nome_tag} className="font-semibold">{tag.descricao || tag.nome_tag} ({tag.nome_tag})</Label>
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
        
        {/* BOTÕES ORIGINAIS NO RODAPÉ (MANTIDOS GRANDES) */}
        <div className="lg:col-span-3 flex flex-col sm:flex-row gap-4 pt-4 border-t">
            <Button 
                onClick={handlePreview} 
                variant="outline"
                className="flex-1 h-12"
                disabled={!modelo || !clienteSelecionadoId || valorTotal <= 0}
            >
                <Eye className="mr-2 h-4 w-4" />
                Pré-visualizar Contrato
            </Button>
            <Button 
                onClick={handleSalvarContrato} 
                className="flex-1 h-12"
                disabled={isSubmitting || !isReadyToSave}
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