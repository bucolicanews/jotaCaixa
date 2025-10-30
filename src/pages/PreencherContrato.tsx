import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag } from '@/types/contratos';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cliente } from '@/types/cliente';

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const navigate = useNavigate();
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [tags, setTags] = useState<ContratoTag[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Campos obrigatórios para o contrato
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number | ''>('');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [diaVencimentoParcela, setDiaVencimentoParcela] = useState<number | ''>('');

  const isCliente = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const empresaId = isCliente ? (perfil as ClienteProfile)?.id : (role === 'Usuario' ? (perfil as UsuarioProfile)?.cliente_id : null);

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };

  const buscarDados = useCallback(async () => {
    if (!modeloId || !empresaId) {
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
    
    // 2. Buscar Tags (apenas as da empresa ou globais)
    const { data: tagsData, error: tagsError } = await supabase
        .from('contrato_tags')
        .select('*')
        .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
        .order('nome_tag');
        
    if (tagsError) {
        showError('Erro ao carregar tags: ' + tagsError.message);
        setTags([]);
    } else {
        setTags(tagsData as ContratoTag[]);
    }
    
    // 3. Buscar Clientes
    const ownerId = getOwnerId();
    if (ownerId) {
        const { data: clientesData, error: clientesError } = await supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', ownerId)
            .order('nome');
            
        if (clientesError) {
            showError('Erro ao carregar clientes: ' + clientesError.message);
            setClientes([]);
        } else {
            setClientes(clientesData as Cliente[]);
        }
    }

    setCarregandoDados(false);
  }, [modeloId, empresaId, navigate, role, perfil]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || isCliente || (role === 'Usuario' && empresaId))) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isCliente) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, isAdmin, isCliente, role, empresaId, buscarDados, navigate]);
  
  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    for (const tag in tags) {
        // Substitui a tag {{nome_tag}} pelo valor preenchido
        const regex = new RegExp(tag, 'g');
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[tag]);
    }
    return conteudoRenderizado;
  };

  const handleSalvarContrato = async () => {
    if (!modelo || !clienteSelecionadoId || valorTotal === '' || !dataInicio || !empresaId) {
        showError('Preencha todos os campos obrigatórios (Cliente, Valor Total e Data de Início).');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 1. Renderizar o conteúdo final
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
        
        // 2. Inserir o Contrato Gerado
        const contratoData = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId,
            empresa_id: empresaId,
            status: 'rascunho',
            valor_total: valorTotal,
            data_inicio: dataInicio,
            numero_parcelas: numeroParcelas,
            dia_vencimento_parcela: diaVencimentoParcela || null,
            valores_tags_preenchidos: valoresTags,
            conteudo_renderizado: conteudoRenderizado,
        };
        
        const { error } = await supabase
            .from('contratos_gerados')
            .insert(contratoData);
            
        if (error) throw error;
        
        showSuccess('Contrato salvo como rascunho com sucesso!');
        navigate('/contratos');
        
    } catch (error: any) {
        console.error('Erro ao salvar contrato:', error);
        showError('Falha ao salvar contrato: ' + error.message);
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

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Link to="/contratos" className="text-muted-foreground hover:text-primary flex items-center mr-4">
            <ChevronLeft className="w-5 h-5" />
            Voltar
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Preencher Contrato: {modelo.titulo}
        </h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna 1: Dados Principais */}
        <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle className="text-xl">Dados do Contrato</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="cliente">Cliente</Label>
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId}>
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
                <div className="space-y-2">
                    <Label htmlFor="valor-total">Valor Total (R$)</Label>
                    <Input 
                        id="valor-total"
                        type="number"
                        step="0.01"
                        value={valorTotal}
                        onChange={(e) => setValorTotal(Number(e.target.value))}
                        placeholder="0.00"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="data-inicio">Data de Início</Label>
                    <Input 
                        id="data-inicio"
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="parcelas">Nº Parcelas</Label>
                        <Input 
                            id="parcelas"
                            type="number"
                            min="1"
                            value={numeroParcelas}
                            onChange={(e) => setNumeroParcelas(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="dia-vencimento">Dia Vencimento</Label>
                        <Input 
                            id="dia-vencimento"
                            type="number"
                            min="1"
                            max="31"
                            value={diaVencimentoParcela}
                            onChange={(e) => setDiaVencimentoParcela(Number(e.target.value))}
                            placeholder="Ex: 5"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
        
        {/* Coluna 2: Preenchimento das Tags */}
        <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-xl">2. Preenchimento das Tags Dinâmicas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {tags.length === 0 ? (
                    <p className="text-muted-foreground">Nenhuma tag dinâmica cadastrada para esta empresa.</p>
                ) : (
                    tags.map(tag => (
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
        
        {/* Botão de Salvar */}
        <div className="lg:col-span-3">
            <Button 
                onClick={handleSalvarContrato} 
                className="w-full h-12"
                disabled={isSubmitting || !clienteSelecionadoId || valorTotal === '' || !dataInicio}
            >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Contrato como Rascunho
            </Button>
        </div>
        
        {/* Coluna 3: Pré-visualização (Opcional, pode ser adicionada depois) */}
        {/* <Card className="lg:col-span-3">
            <CardHeader><CardTitle>3. Pré-visualização</CardTitle></CardHeader>
            <CardContent>
                <div className="p-4 border rounded-md bg-background whitespace-pre-wrap">
                    {renderizarConteudo(modelo.conteudo_template, valoresTags)}
                </div>
            </CardContent>
        </Card> */}
        
      </div>
    </LayoutPrincipal>
  );
};

export default PreencherContrato;