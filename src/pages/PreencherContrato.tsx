import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon, Eye, Building2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, ContratoGerado } from '@/types/contratos';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, AdminProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, parseISO } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';
import { Separator } from '@/components/ui/separator';
import { ptBR } from 'date-fns/locale';
import { useContabilConfig } from '@/hooks/use-contabil-config'; // NOVO IMPORT
import { useCapitalSocial } from '@/hooks/use-capital-social'; // NOVO IMPORT
import { useOwner } from '@/hooks/use-owner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { v4 as uuidv4 } from 'uuid';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const { configMap } = useContabilConfig(); // NOVO HOOK
  const { temCapitalSocial, carregando: carregandoCapital } = useCapitalSocial(); // NOVO HOOK
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente'; 

  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<any[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  // Estados do Formulário
  const [clienteSelecionadoId, setClienteSelecionadoId, ] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number>(0); 
  const [tituloDocumento, setTituloDocumento] = useState('');
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<any[]>([]);
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(new Date());
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(new Date());
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [contratoInicial, setContratoInicial] = useState<ContratoGerado | null>(null); // NOVO ESTADO PARA EDIÇÃO

  const isEditing = !!contratoId;

  const { ownerId, ownerType } = useOwner();

  // Função auxiliar de formatação de moeda
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const fetchDependentData = useCallback(async (targetOwnerId: string) => {
    if (!targetOwnerId) return;

    // 1. Busca Tags
    const { data: tagsData } = await supabase
      .from('contrato_tags')
      .select('*')
      .eq('proprietario_id', targetOwnerId);
    setTagsCustomizadas(tagsData || []);

    // 2. Busca Clientes (Contratados)
    // Para determinar de onde buscar os clientes, precisamos saber se o 'targetOwnerId' é de um Admin ou de um Cliente.
    const { data: ownerProfile } = await supabase
        .from('tbl_admins')
        .select('id')
        .eq('id', targetOwnerId)
        .maybeSingle();

    const isTargetAdmin = !!ownerProfile;

    let clientesDataSource;
    if (isTargetAdmin) {
      clientesDataSource = await supabase
        .from('tbl_clientes')
        .select('*')
        .eq('admin_id', targetOwnerId)
        .eq('aprovado', true)
        .order('nome');
    } else {
      clientesDataSource = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetOwnerId)
        .order('nome');
    }
    
    const { data: clientesData } = clientesDataSource;
    const uniqueClients = clientesData ? Array.from(new Map(clientesData.map(item => [item.id, item])).values()) : [];
    setClientesCR(uniqueClients);
  }, []);

  const buscarDados = useCallback(async () => {
    if (!ownerId) return;

    setCarregandoDados(true);
    
    // 1. Carregar Modelo
    if (modeloId) {
      const { data } = await supabase.from('contrato_modelos').select('*').eq('id', modeloId).single();
      if (data) {
        setModelo(data);
        setTituloDocumento(data.titulo);
      }
    }
    
    // 2. Carregar Empresas (Se Admin/Supervisão)
    if (ownerType === 'Admin' || ownerType === 'AdminUsuario') {
      const { data } = await supabase.from('tbl_clientes').select('id, nome').eq('aprovado', true);
      const options = [{ id: ownerId, nome: 'Meus Contratos (Admin)' }, ...(data || [])];
      setEmpresasContrato(options);
    }
    
    let currentProprietarioId = ownerId;
    
    // 3. SE FOR EDIÇÃO: Carregar dados do contrato existente
    if (contratoId) {
        const { data: contratoExistente, error: contratoError } = await supabase
            .from('contratos_gerados')
            .select('*')
            .eq('id', contratoId)
            .single();
            
        if (contratoError) {
            showError('Erro ao carregar contrato para edição: ' + contratoError.message);
        } else if (contratoExistente) {
            setContratoInicial(contratoExistente);
            setClienteSelecionadoId(contratoExistente.cliente_id);
            setProprietarioContratoId(contratoExistente.proprietario_id);
            currentProprietarioId = contratoExistente.proprietario_id;
            setValorTotal(contratoExistente.valor_total || 0);
            setNumeroParcelas(contratoExistente.numero_parcelas || 1);
            setTipoLancamento((contratoExistente.numero_parcelas || 1) > 1 ? 'parcelar' : 'unico');
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
        }
    }
    
    setProprietarioContratoId(currentProprietarioId);
    await fetchDependentData(currentProprietarioId);
    setCarregandoDados(false);
  }, [modeloId, ownerId, ownerType, fetchDependentData, contratoId]);

  // Carregamento inicial
  useEffect(() => {
    if (!carregandoSessao && ownerId) buscarDados();
  }, [carregandoSessao, ownerId, buscarDados]);

  // Se o proprietário mudar manualmente (no select do Admin), recarrega clientes
  // Adicionamos uma verificação para não recarregar se já estiver carregando (evita loop na inicialização)
  useEffect(() => {
      if (proprietarioContratoId && !carregandoDados) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData, carregandoDados]);

  // Dados da Empresa (Contratante) para preenchimento de tags
  const empresaLogadaData = useMemo(() => {
    if (!perfil) return null;
    
    const p = perfil as ClienteProfile | AdminProfile | UsuarioProfile | AdminUsuarioProfile;
    const safeGet = (obj: any, key: string) => obj && obj[key] ? obj[key] : '';
    
    return {
        nome: safeGet(p, 'nome') || safeGet(p, 'razao_social'),
        documento: safeGet(p, 'documento') || safeGet(p, 'cnpj') || safeGet(p, 'cpf'),
        email: safeGet(p, 'email'),
        telefone: safeGet(p, 'telefone'),
        cep: safeGet(p, 'cep'),
        endereco: safeGet(p, 'endereco'),
        numero: safeGet(p, 'numero'),
        complemento: safeGet(p, 'complemento'),
        bairro: safeGet(p, 'bairro'),
        cidade: safeGet(p, 'cidade'),
        estado: safeGet(p, 'estado'),
        cnpj: safeGet(p, 'cnpj'),
        cpf: safeGet(p, 'cpf'),
        rg: safeGet(p, 'rg'),
    };
  }, [perfil]);

  // --- LÓGICA DE PREENCHIMENTO AUTOMÁTICO DAS TAGS ---
  useEffect(() => {
      // Se estiver editando e os dados acabaram de carregar, não sobrescreve imediatamente
      // a menos que o usuário mude algo. Porém, para garantir reatividade, mesclamos.
      
      const newTags: Record<string, string> = { ...valoresTags };
      
      // 1. Dados do Cliente Selecionado
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

      // 2. Dados da Empresa
      if (empresaLogadaData) {
          newTags['{{EMPRESA_NOME}}'] = empresaLogadaData.nome || '';
          newTags['{{EMPRESA_DOCUMENTO}}'] = empresaLogadaData.documento || '';
          newTags['{{EMPRESA_EMAIL}}'] = empresaLogadaData.email || '';
          newTags['{{EMPRESA_TELEFONE}}'] = empresaLogadaData.telefone || '';
          newTags['{{EMPRESA_CEP}}'] = empresaLogadaData.cep || '';
          newTags['{{EMPRESA_ENDERECO}}'] = empresaLogadaData.endereco || '';
          newTags['{{EMPRESA_NUMERO}}'] = empresaLogadaData.numero || '';
          newTags['{{EMPRESA_COMPLEMENTO}}'] = empresaLogadaData.complemento || '';
          newTags['{{EMPRESA_BAIRRO}}'] = empresaLogadaData.bairro || '';
          newTags['{{EMPRESA_CIDADE}}'] = empresaLogadaData.cidade || '';
          newTags['{{EMPRESA_ESTADO}}'] = empresaLogadaData.estado || '';
          newTags['{{EMPRESA_CNPJ}}'] = empresaLogadaData.cnpj || '';
          newTags['{{EMPRESA_CPF}}'] = empresaLogadaData.cpf || '';
      }

      // 3. Dados Financeiros
      let valorFinalContrato = 0;
      let valorParcelaFinal = 0;
      let dataPrimeiroVenc = '';

      if (tipoLancamento === 'unico') {
          valorFinalContrato = valorTotal;
          valorParcelaFinal = valorTotal;
          dataPrimeiroVenc = dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'parcelar') {
          valorFinalContrato = valorTotal;
          valorParcelaFinal = numeroParcelas > 0 ? valorTotal / numeroParcelas : 0;
          dataPrimeiroVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'repetir') {
          valorFinalContrato = valorTotal * numeroParcelas;
          valorParcelaFinal = valorTotal;
          dataPrimeiroVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      }

      newTags['{{VALOR_TOTAL_CONTRATO}}'] = formatCurrency(valorFinalContrato);
      newTags['{{VALOR_PARCELA}}'] = formatCurrency(valorParcelaFinal);
      newTags['{{NUMERO_PARCELAS}}'] = numeroParcelas.toString();
      newTags['{{PRIMEIRO_VENCIMENTO}}'] = dataPrimeiroVenc;
      newTags['{{DATA_EMISSAO}}'] = format(new Date(), 'dd/MM/yyyy');
      
      setValoresTags(newTags);

  }, [
      clienteSelecionadoId, 
      clientesCR, 
      empresaLogadaData, 
      valorTotal, 
      tipoLancamento, 
      numeroParcelas, 
      dataVencimentoUnico, 
      dataPrimeiroVencimento,
  ]);

  // Filtro para mostrar tags manuais na UI
  const tagsParaPreenchimentoManual = useMemo(() => {
    const combined = [...TAGS_PADRAO, ...tagsCustomizadas];
    return combined
        .filter(tag => 
            !tag.nome_tag.startsWith('{{CLIENTE_') && 
            !tag.nome_tag.startsWith('{{EMPRESA_') &&
            !['{{VALOR_TOTAL_CONTRATO}}', '{{VALOR_PARCELA}}', '{{NUMERO_PARCELAS}}', '{{PRIMEIRO_VENCIMENTO}}', '{{DATA_EMISSAO}}'].includes(tag.nome_tag)
        )
        .map(t => t.nome_tag);
  }, [tagsCustomizadas]);

  const renderConteudo = useCallback(() => {
    let html = modelo?.conteudo_template || '';
    Object.keys(valoresTags).forEach(tag => {
      const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(regex, valoresTags[tag] || '');
    });
    return html;
  }, [modelo, valoresTags]);

  const handleSalvarContrato = async (status: 'rascunho' | 'pendente_assinatura') => {
    if (!modelo || !clienteSelecionadoId || !proprietarioContratoId) {
      showError('Preencha todos os campos obrigatórios: Cliente, Título e Proprietário.');
      return;
    }

    if (valorTotal <= 0 && status === 'pendente_assinatura') {
        const confirm = await new Promise((resolve) => {
            const userConfirmed = window.confirm(
                "O valor do contrato é R$ 0,00. Deseja continuar e gerar o contrato sem criar um Contas a Receber?"
            );
            resolve(userConfirmed);
        });

        if (!confirm) {
            return;
        }
    }

    setIsSubmitting(true);

    try {
        const conteudoFinal = renderConteudo();
        const valoresTagsFinais = { ...valoresTags, titulo: tituloDocumento };

        let dataInicio = tipoLancamento === 'unico' ? dataVencimentoUnico : dataPrimeiroVencimento;
        if (!dataInicio) dataInicio = new Date();

        const numParcelasFinal = tipoLancamento === 'unico' ? 1 : numeroParcelas;
        
        const payload: Partial<ContratoGerado> = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId,
            proprietario_id: proprietarioContratoId,
            status: status,
            valores_tags_preenchidos: valoresTagsFinais,
            conteudo_renderizado: conteudoFinal,
            valor_total: valorTotal,
            numero_parcelas: numParcelasFinal,
            data_inicio: format(dataInicio, 'yyyy-MM-dd'),
            intervalo_cobranca_dias: intervaloDias
        };

        if (isEditing && contratoId) {
            // Se estiver editando, chama a RPC para atualizar e recriar os lançamentos se necessário
             const { error } = await supabase.rpc('update_contrato_e_lancamentos', {
                p_contrato_id: contratoId,
                p_cliente_id: payload.cliente_id!,
                p_proprietario_id: payload.proprietario_id!,
                p_status: payload.status!,
                p_valores_tags: payload.valores_tags_preenchidos,
                p_conteudo_renderizado: payload.conteudo_renderizado!,
                p_valor_total: payload.valor_total!,
                p_numero_parcelas: payload.numero_parcelas!,
                p_data_inicio: payload.data_inicio!,
                p_intervalo_dias: payload.intervalo_cobranca_dias!,
                p_modelo_id: payload.modelo_id!,
                p_titulo_documento: tituloDocumento,
             });


            if (error) throw error;
        } else {
            // Se for novo, apenas insere
            const { data: insertedData, error } = await supabase
                .from('contratos_gerados')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            
            // A criação do CR e lançamentos contábeis é feita por uma TRIGGER no Supabase (`tg_criar_cr_e_lancamentos_from_contrato`)
        }

        showSuccess(`Contrato ${isEditing ? 'atualizado' : 'salvo'} com sucesso!`);
        navigate('/contratos');

    } catch (error: any) {
        console.error("Erro ao salvar contrato:", error);
        showError('Falha ao salvar contrato: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };


  if (carregandoSessao || carregandoDados || carregandoCapital) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (!modelo) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Modelo não encontrado</CardTitle></CardHeader><CardContent><p>O modelo de contrato que você está tentando usar não foi encontrado.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
        <div className="flex items-center mb-6">
            <Button onClick={() => navigate('/contratos')} variant="link" className="p-0 h-auto mr-4"><ChevronLeft className="w-5 h-5" /> Voltar</Button>
            <h1 className="text-2xl font-bold flex items-center"><FileSignature className="w-6 h-6 mr-3" />{isEditing ? `Editando Contrato: ${tituloDocumento}` : `Novo Contrato: ${modelo.titulo}`}</h1>
        </div>

        {/* ALERTA DE CAPITAL SOCIAL */}
        {!isEditing && !temCapitalSocial && (
             <Alert variant="destructive" className="mb-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Lançamento Inicial Obrigatório</AlertTitle>
                <AlertDescription>
                    É necessário fazer o lançamento inicial do Capital Social antes de gerar contratos que criam Contas a Receber. 
                    Vá para <a href="/contabilidade/lancamentos" className="font-bold underline">Lançamentos Contábeis</a> e adicione o Capital Social.
                </AlertDescription>
            </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Coluna de Dados */}
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader><CardTitle>1. Detalhes do Contrato</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {(isAdmin || ownerType === 'AdminUsuario') && (
                             <div className="space-y-2">
                                <Label htmlFor="empresa-contrato">Contratante (Dono do Contrato)</Label>
                                <Select onValueChange={setProprietarioContratoId} value={proprietarioContratoId || ''}>
                                    <SelectTrigger id="empresa-contrato"><SelectValue placeholder="Selecione o Contratante" /></SelectTrigger>
                                    <SelectContent>
                                        {empresasContrato.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="cliente">Contratado (Cliente)</Label>
                            <Select onValueChange={setClienteSelecionadoId} value={clienteSelecionadoId} disabled={!proprietarioContratoId}>
                                <SelectTrigger id="cliente"><SelectValue placeholder="Selecione o Cliente" /></SelectTrigger>
                                <SelectContent>
                                    {clientesCR.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="titulo-documento">Título do Documento</Label>
                           <Input id="titulo-documento" placeholder="Ex: Contrato de Prestação de Serviços" value={tituloDocumento} onChange={(e) => setTituloDocumento(e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>2. Condições Financeiras</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="valor">Valor</Label>
                            <Input id="valor" type="number" placeholder="0.00" value={valorTotal} onChange={(e) => setValorTotal(parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Forma de Lançamento no Contas a Receber</Label>
                            <RadioGroup value={tipoLancamento} onValueChange={(v) => setTipoLancamento(v as TipoLancamento)} className="flex space-x-4">
                               <div className="flex items-center space-x-2"><RadioGroupItem value="unico" id="r-unico" /><Label htmlFor="r-unico">Único</Label></div>
                               <div className="flex items-center space-x-2"><RadioGroupItem value="parcelar" id="r-parcelar" /><Label htmlFor="r-parcelar">Parcelar</Label></div>
                               <div className="flex items-center space-x-2"><RadioGroupItem value="repetir" id="r-repetir" /><Label htmlFor="r-repetir">Repetir</Label></div>
                            </RadioGroup>
                        </div>

                        {tipoLancamento === 'unico' && (
                             <div className="space-y-2">
                                <Label>Data de Vencimento</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dataVencimentoUnico && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />{dataVencimentoUnico ? format(dataVencimentoUnico, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus /></PopoverContent>
                                </Popover>
                            </div>
                        )}

                        {(tipoLancamento === 'parcelar' || tipoLancamento === 'repetir') && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="numero-parcelas">Número de Parcelas</Label>
                                    <Input id="numero-parcelas" type="number" value={numeroParcelas} onChange={e => setNumeroParcelas(parseInt(e.target.value) || 1)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Data do Primeiro Vencimento</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                           <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dataPrimeiroVencimento && "text-muted-foreground")}>
                                               <CalendarIcon className="mr-2 h-4 w-4" />{dataPrimeiroVencimento ? format(dataPrimeiroVencimento, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}
                                           </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus /></PopoverContent>
                                    </Popover>
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="intervalo-dias">Intervalo entre Parcelas (dias)</Label>
                                    <Input id="intervalo-dias" type="number" value={intervaloDias} onChange={e => setIntervaloDias(parseInt(e.target.value) || 30)} />
                                </div>
                                 <div className="text-sm text-muted-foreground bg-muted p-2 rounded-md">
                                    {tipoLancamento === 'parcelar' ? `Serão criadas ${numeroParcelas} parcelas de ${formatCurrency(valorTotal/numeroParcelas)} cada.` : `Serão criadas ${numeroParcelas} cobranças recorrentes de ${formatCurrency(valorTotal)} cada.`}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>3. Tags Personalizadas</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {tagsParaPreenchimentoManual.map(tag => (
                            <div key={tag} className="space-y-2">
                                <Label htmlFor={tag}>{tag}</Label>
                                <Input id={tag} value={valoresTags[tag] || ''} onChange={e => setValoresTags(v => ({...v, [tag]: e.target.value}))} />
                            </div>
                        ))}
                        {tagsParaPreenchimentoManual.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag manual para este modelo.</p>}
                    </CardContent>
                </Card>
            </div>

            {/* Coluna da Prévia */}
            <div className="lg:col-span-2">
                <Card className="sticky top-4">
                    <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle>Prévia do Contrato</CardTitle>
                        <Button onClick={() => setPreviewOpen(true)} variant="outline" size="sm" disabled={!clienteSelecionadoId}><Eye className="w-4 h-4 mr-2" /> Visualizar em Tela Cheia</Button>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md p-6 bg-white shadow-lg h-[80vh] overflow-y-auto prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderConteudo() }} />
                    </CardContent>
                </Card>
            </div>
        </div>

        <div className="mt-8 flex justify-end gap-4">
            <Button onClick={() => handleSalvarContrato('rascunho')} variant="outline" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar como Rascunho
            </Button>
            <Button onClick={() => handleSalvarContrato('pendente_assinatura')} disabled={isSubmitting || !clienteSelecionadoId || (!isEditing && !temCapitalSocial)}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
                {isEditing ? 'Atualizar e Gerar Contrato' : 'Salvar e Gerar Contrato'}
            </Button>
        </div>

        <ContratoPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            conteudoHtml={renderConteudo()}
            titulo={tituloDocumento}
        />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;