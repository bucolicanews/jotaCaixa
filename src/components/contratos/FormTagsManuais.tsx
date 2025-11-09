import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContratoTag } from '@/types/contratos';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';

interface FormTagsManuaisProps {
    tagsCustomizadas: ContratoTag[];
    valoresTags: Record<string, string>;
    setValoresTags: (tags: React.SetStateAction<Record<string, string>>) => void;
    clienteSelecionadoId: string;
    valorTotal: number;
    isSubmitting: boolean;
}

const FormTagsManuais: React.FC<FormTagsManuaisProps> = ({
    tagsCustomizadas,
    valoresTags,
    setValoresTags,
    clienteSelecionadoId,
    valorTotal,
    isSubmitting,
}) => {
    
    const handleTagChange = (tag: string, value: string) => {
        setValoresTags(prev => ({ ...prev, [tag]: value }));
    };

    // Combina tags customizadas e tags padrão que não são financeiras
    const tagsCustomizadasECliente = useMemo(() => {
        return [...tagsCustomizadas, ...TAGS_PADRAO.filter(t => t.origem_dado && !t.origem_dado.startsWith('contas_receber'))];
    }, [tagsCustomizadas]);
    
    // Filtra tags que já foram preenchidas automaticamente (para não pedir valor manual)
    const tagsParaPreenchimentoManual = useMemo(() => {
        return tagsCustomizadasECliente.filter(tag => {
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
    }, [tagsCustomizadasECliente, valoresTags]);

    return (
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
                
                {!clienteSelecionadoId || valorTotal <= 0 ? (
                    <p className="text-muted-foreground">Selecione o cliente e o valor total para preencher as tags.</p>
                ) : tagsParaPreenchimentoManual.length === 0 ? (
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
                                disabled={isSubmitting}
                            />
                            {tag.origem_dado && <p className="text-xs text-muted-foreground mt-1">Sugestão de origem: {tag.origem_dado}</p>}
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
};

export default FormTagsManuais;