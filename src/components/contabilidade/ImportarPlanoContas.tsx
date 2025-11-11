import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, AlertTriangle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { parseFile } from '@/utils/file-parser';
import { supabase } from '@/integrations/supabase/client';
import { PlanoContas } from '@/types/plano-contas';
import MapearTodasFKsDialog from './MapearTodasFKsDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ImportarPlanoContasProps {
    proprietarioId: string;
    onImportComplete: () => void;
}

// Tipos de dados que precisam de remapeamento (copiado de MapearTodasFKsDialog.tsx)
interface OldFKData {
    id: string;
    nome: string;
    tabela: 'saldo_contas' | 'config_cr' | 'config_cp' | 'config_stripe_sintetica' | 'config_stripe_receber';
    old_conta_contabil_id: string;
    old_conta_contabil_nome: string;
    saldo_inicial?: number;
    tipo_registro?: string;
    is_conta_caixa_banco?: boolean;
    is_conta_patrimonial?: boolean;
    is_conta_resultado?: boolean;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ proprietarioId, onImportComplete }) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newPlanoContas, setNewPlanoContas] = useState<PlanoContas[]>([]);
    const [oldFKs, setOldFKs] = useState<OldFKData[]>([]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setFile(event.target.files[0]);
        } else {
            setFile(null);
        }
    };

    const handleImport = useCallback(async () => {
        if (!file || !proprietarioId) {
            showError('Selecione um arquivo e garanta que o proprietário esteja definido.');
            return;
        }
        setLoading(true);

        try {
            // 1. Parse do arquivo
            const parsedData = await parseFile(file);

            if (parsedData.length === 0 || !('Conta' in parsedData[0])) {
                throw new Error('O arquivo está vazio ou não é um Plano de Contas válido. Verifique as colunas.');
            }
            
            // 2. Mapear para o formato PlanoContas (incluindo campos booleanos padrão)
            const newContas: PlanoContas[] = (parsedData as any[]).map(row => ({
                proprietario_id: proprietarioId,
                Conta: String(row.Conta).trim(),
                Descricao: String(row.Descrição).trim(),
                codigo_reduzido: String(row['Código reduzido'] || '').trim() || null,
                Analitica: row.Analítica === 'Sim' ? 'Sim' : 'Não',
                is_conta_caixa_banco: false, // Padrão
                is_conta_patrimonial: false, // Padrão
                is_conta_resultado: false, // Padrão
            })).filter(c => c.Conta.length > 0);

            if (newContas.length === 0) {
                throw new Error('Nenhuma conta válida encontrada para importação.');
            }
            
            // 3. Buscar referências antigas (FKs)
            const { data: oldFKsData, error: fkError } = await supabase.functions.invoke('get-plano-contas-fks', {
                body: { proprietarioId },
            });
            
            if (fkError) throw fkError;
            if (oldFKsData?.error) throw new Error(oldFKsData.error);
            
            const oldFKsList = (oldFKsData?.oldFKs || []) as OldFKData[];
            
            if (oldFKsList.length > 0) {
                // 4. Se houver FKs antigas, abre o diálogo de remapeamento
                setNewPlanoContas(newContas);
                setOldFKs(oldFKsList);
                setDialogOpen(true);
            } else {
                // 5. Se não houver FKs antigas, insere diretamente (chama a Edge Function)
                const { data, error: invokeError } = await supabase.functions.invoke('manage-plano-contas', {
                    body: { proprietarioId, newPlanoContas: newContas },
                });
                
                if (invokeError) throw invokeError;
                if (data?.error) throw new Error(data.error);
                
                showSuccess('Plano de Contas importado com sucesso!');
                onImportComplete();
            }

        } catch (error: any) {
            console.error('Erro durante a importação:', error);
            showError('Falha na importação: ' + error.message);
        } finally {
            setLoading(false);
            setFile(null); // Limpa o arquivo após o processamento
        }
    }, [file, proprietarioId, onImportComplete]);

    return (
        <>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 gap-1" disabled={loading}>
                        <Upload className="h-4 w-4" />
                        <span className="hidden sm:inline">Importar</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Importar Plano de Contas</Dialogação>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Selecione um arquivo CSV ou JSON contendo o Plano de Contas.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="plano-contas-file">Arquivo CSV/JSON</Label>
                            <Input 
                                id="plano-contas-file" 
                                type="file" 
                                accept=".csv,.json" 
                                onChange={handleFileChange} 
                                disabled={loading}
                            />
                        </div>
                        <Button 
                            onClick={handleImport} 
                            disabled={!file || loading} 
                            className="w-full"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Processar Arquivo
                        </Button>
                        
                        {oldFKs.length > 0 && (
                            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md flex items-center text-sm text-yellow-700 dark:text-yellow-300">
                                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                                {oldFKs.length} referências contábeis antigas encontradas. Clique em "Processar Arquivo" para remapear.
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
            
            {/* Diálogo de Mapeamento de FKs (Abre se houver oldFKs) */}
            {oldFKs.length > 0 && (
                <MapearTodasFKsDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    oldFKs={oldFKs}
                    newPlanoContas={newPlanoContas}
                    proprietarioId={proprietarioId}
                    onSaveComplete={onImportComplete}
                />
            )}
        </>
    );
};

export default ImportarPlanoContas;