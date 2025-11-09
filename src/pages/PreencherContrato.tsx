import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, ContratoGerado } from '@/types/contratos';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { Cliente } from '@/types/cliente';
import { format, addDays, parseISO } from 'date-fns';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';

// Componentes Modulares
import ContratoHeader from '@/components/contratos/ContratoHeader';
import FormFinanceiro from '@/components/contratos/FormFinanceiro';
import FormTagsManuais from '@/components/contratos/FormTagsManuais';
import ContratoAcoesRodape from '@/components/contratos/ContratoAcoesRodape';

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
    if (isAdmin) {
        const profile = perfil as AdminProfile;
        currentEmpresaLogada = {
            nome: profile.nome,
            email: profile.email,
            documento: profile.cnpj || profile.cpf,
            endereco_completo: `${profile.endereco || ''}, ${profile.numero || ''} ${profile.complemento || ''} - ${profile.bairro || ''}, ${profile.cidade || ''}/${profile.estado || ''}`,
            cpf: profile.cpf,
            cnpj: profile.cnpj,
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
    } else if (isCliente) {
        const profile = perfil as ClienteProfile;
        currentEmpresaLogada = {
            nome: profile.nome,
            email: profile.email,
            documento: profile.documento || profile.cpf,
            endereco_completo: `${profile.endereco || ''}, ${profile.numero || ''} ${profile.complemento || ''} - ${profile.bairro || ''}, ${profile.cidade || ''}/${profile.estado || ''}`,
            cpf: profile.cpf,
            cnpj: null,
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
                console.error('LOG: Conta sintética encontrada, mas sem parcelas associadas. Usando dados do contrato.');
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
    
    setProprietarioContratoId(initialProprietarioContratoId);
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, navigate, role, perfil, usuario, isAdmin, isCliente, contratoId]);
  
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
    
    // 2. Buscar Clientes (Contratados)
    let combinedClients: Cliente[] = [];
    
    if (isAdmin && targetEmpresaId === ownerIdLogado) {
        const { data: systemClientsData, error: systemClientsError } = await supabase
            .from('tbl_clientes')
            .select('id, nome, email, cpf, rg, nome_mae, nome_pai, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, criado_em')
            .eq('admin_id', ownerIdLogado)
            .eq('aprovado', true)
            .order('nome');
            
        if (systemClientsError) {
            showError('Erro ao carregar clientes do sistema: ' + systemClientsError.message);
        } else if (systemClientsData) {
            combinedClients = (systemClientsData as any[]).map(sc => ({
                id: sc.id,
                proprietario_id: ownerIdLogado,
                nome: sc.nome,
                razao_social: sc.nome,
                nome_fantasia: sc.nome,
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
        const { data: clientesCRData, error: _ } = await supabase
            .from('clientes')
            .select('*')
            .eq('proprietario_id', targetEmpresaId);
        if (clientesCRData) {
            combinedClients.push(...(clientesCRData as Cliente[]));
        }
    }
    
    combinedClients.sort((a, b) => a.nome.localeCompare(b.nome));
    setClientes(combinedClients);
    
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
            
            if (sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') {
                const empresaData = empresaLogada as any;
                if (empresaData && empresaData[sourceField]) {
                    tagValue = String(empresaData[sourceField]);
                }
            } 
            
            else if (sourceTable === 'clientes' && cliente) {
                const clienteData = cliente as any;
                if (clienteData && clienteData[sourceField]) {
                    tagValue = String(clienteData[sourceField]);
                }
            } 
            
            else if (sourceTable === 'tbl_usuarios' && perfil && 'cliente_id' in perfil) {
                const usuarioData = perfil as UsuarioProfile;
                if (usuarioData && (usuarioData as any)[sourceField]) {
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
        
        if (tagValue !== null) {
            newTags[tagKey] = tagValue;
        } else {
            newTags[tagKey] = valoresTags[tagKey] || '';
        }
    });
    
    setValoresTags(newTags);
  }, [clienteSelecionadoId, valorTotal, tipoLancamento, numeroParcelas, dataVencimentoUnico, dataPrimeiroVencimento, clientes, empresaLogada, tagsCustomizadas, valoresTags, intervaloDias, tipoConteudo, perfil]);


  useEffect(() => {
    updateTags();
  }, [updateTags]);


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

        if (isContractOwnerAdmin) {
            const clienteDataParaUpsert = {
                id: clienteSelecionado.id,
                proprietario_id: proprietarioContratoId,
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
            proprietario_id: proprietarioContratoId,
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
            
            const { data: existingConta } = await supabase
                .from(tabelaContasReceber)
                .select('id')
                .eq('contrato_gerado_id', contratoGeradoId)
                .limit(1)
                .single();
                
            if (existingConta) {
                contaReceberId = existingConta.id;
                
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
            const { error: updateContaError } = await supabase
                .from(tabelaContasReceber)
                .update(contaReceberPayload)
                .eq('id', contaReceberId);
            if (updateContaError) throw updateContaError;
        } else {
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
        
        navigate('/contratos', { replace: true });
        
    } catch (error: any) {
        console.error('Erro ao salvar contrato:', error);
        showError('Falha ao salvar contrato e gerar contas: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  const isReadyToSave = !!modelo && !!clienteSelecionadoId && valorTotal > 0 && (
      (tipoLancamento === 'unico' && !!dataVencimentoUnico) ||
      (tipoLancamento !== 'unico' && numeroParcelas >= 1 && !!dataPrimeiroVencimento && intervaloDias >= 1)
  );

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

  return (
    <LayoutPrincipal>
      
      <ContratoHeader title={modelo.titulo} isEditing={isEditing} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <FormFinanceiro
            isAdmin={isAdmin}
            isEditing={isEditing}
            proprietarioContratoId={proprietarioContratoId}
            setProprietarioContratoId={setProprietarioContratoId}
            empresasContrato={empresasContrato}
            clienteSelecionadoId={clienteSelecionadoId}
            setClienteSelecionadoId={setClienteSelecionadoId}
            clientes={clientes}
            valorTotal={valorTotal}
            setValorTotal={setValorTotal}
            tipoLancamento={tipoLancamento}
            setTipoLancamento={setTipoLancamento}
            dataVencimentoUnico={dataVencimentoUnico}
            setDataVencimentoUnico={setDataVencimentoUnico}
            numeroParcelas={numeroParcelas}
            setNumeroParcelas={setNumeroParcelas}
            dataPrimeiroVencimento={dataPrimeiroVencimento}
            setDataPrimeiroVencimento={setDataPrimeiroVencimento}
            intervaloDias={intervaloDias}
            setIntervaloDias={setIntervaloDias}
        />
        
        <FormTagsManuais
            tagsCustomizadas={tagsCustomizadas}
            valoresTags={valoresTags}
            setValoresTags={setValoresTags}
            clienteSelecionadoId={clienteSelecionadoId}
            valorTotal={valorTotal}
            isSubmitting={isSubmitting}
        />
        
        <ContratoAcoesRodape
            isEditing={isEditing}
            isSubmitting={isSubmitting}
            isReadyToSave={isReadyToSave}
            handlePreview={handlePreview}
            handleSalvarContrato={handleSalvarContrato}
        />
        
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