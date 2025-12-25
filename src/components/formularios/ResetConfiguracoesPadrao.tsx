import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ResetConfiguracoesPadraoProps {
    proprietarioId: string;
    onResetComplete: () => void;
}

const ResetConfiguracoesPadrao: React.FC<ResetConfiguracoesPadraoProps> = ({ proprietarioId, onResetComplete }) => {
    const [loading, setLoading] = useState(false);
    const { refetch: refetchSessao } = useSessao();

    const handleReset = async () => {
        setLoading(true);

        try {
            // 1) Reset total (remove plano/historicos/configs contabil)
            const { data: resetData, error: resetError } = await supabase.functions.invoke('contabil-reset', {
                body: { proprietarioId },
            });
            if (resetError) throw resetError;
            if (resetData?.error) throw new Error(resetData.error);

            // 2) Recriar defaults
            const { data: setupData, error: setupError } = await supabase.functions.invoke('contabil-setup', {
                body: { proprietarioId },
            });
            if (setupError) throw setupError;
            if (setupData?.error) throw new Error(setupData.error);

            showSuccess('Configurações resetadas para o padrão com sucesso!');
            onResetComplete();
            refetchSessao(); // Força o recálculo do setupStatus
        } catch (error: any) {
            console.error('Erro ao resetar configuracoes:', error);
            showError('Falha ao resetar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border-l-4 border-destructive/50">
            <CardHeader>
                <CardTitle className="text-lg flex items-center text-destructive">
                    <RotateCcw className="w-5 h-5 mr-2" /> Resetar Configurações
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Esta ação irá **DELETAR** seu Plano de Contas e Históricos atuais e substituí-los pelos padrões do sistema. Todas as configurações de mapeamento (CR/CP/Contábil) serão redefinidas.
                </p>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={loading} className="w-full">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            Resetar para Configuração Padrão
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-red-600">Confirmação de Reset Crítico</AlertDialogTitle>
                            <AlertDialogDescription>
                                Você tem certeza que deseja resetar? Esta ação é irreversível e pode causar perda de dados se você não tiver um backup do seu Plano de Contas.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleReset} disabled={loading} className="bg-red-600 hover:bg-red-700">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Reset'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
};

export default ResetConfiguracoesPadrao;
