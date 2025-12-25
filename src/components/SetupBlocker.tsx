import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Settings, FileDown, FileUp, BookOpen, History, DollarSign, ArrowRight, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { SetupStepKey } from '@/types/setup';
import { cn } from '@/lib/utils';
import { useCallback, useState } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { triggerContabilSetup } from '@/utils/contabil-setup';
import { showError, showSuccess } from '@/utils/toast';

interface SetupChecklistListProps {
  missingSteps: SetupStepKey[];
  compact?: boolean;
}

// Mapeamento dos passos sequenciais para as chaves de setup
const SEQUENTIAL_STEPS: { key: string; label: string; link: string; icon: React.ElementType; requiredKeys: SetupStepKey[], downloadLink?: string }[] = [
    {
        key: 'import_plano',
        label: '1. Importe o Plano de Contas',
        link: '/plano-contas',
        icon: FileUp,
        requiredKeys: ['plano_contas'],
        downloadLink: '/plano_contas_padrao.csv'
    },
    {
        key: 'import_historicos',
        label: '2. Importe os Históricos',
        link: '/historicos',
        icon: FileUp,
        requiredKeys: ['historicos'],
        downloadLink: '/historicos_padrao.csv'
    },
    {
        key: 'marcar_contas',
        label: '3. Marque as Contas Essenciais',
        link: '/plano-contas',
        icon: BookOpen,
        requiredKeys: [
            'plano_contas_caixa',
            'plano_contas_banco',
            'plano_contas_cliente',
            'plano_contas_fornecedor',
            'plano_contas_capital_social',
            'plano_contas_receita',
            'plano_contas_despesa',
        ],
    },
    {
        key: 'config_contabil',
        label: '4. Configure Mapeamentos Contábeis',
        link: '/configuracoes?tab=contabil',
        icon: Settings,
        requiredKeys: [
            'config_cr',
            'config_cp',
            'config_contratos',
        ],
    },
];

export const SetupChecklistList: React.FC<SetupChecklistListProps> = ({
  missingSteps,
  compact = false,
}) => {
  const navigate = useNavigate();
  if (missingSteps.length === 0) return null;
  
  const missingSet = new Set(missingSteps);
  
  const sequentialStatus = SEQUENTIAL_STEPS.map(step => {
      const isDone = step.requiredKeys.length > 0 && step.requiredKeys.every(key => !missingSet.has(key));
      return { ...step, isDone };
  });
  
  const nextPendingStep = sequentialStatus.find(step => !step.isDone);

  return (
    <div className="space-y-4">
        <h3 className="font-semibold text-lg">Passos de Onboarding:</h3>
        
        {sequentialStatus.map((step) => {
            const Icon = step.icon;
            const isCurrent = !step.isDone && nextPendingStep?.key === step.key;

            return (
                <div 
                    key={step.key}
                    className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        step.isDone ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20" : (isCurrent ? "border-primary/50 bg-secondary/50 cursor-pointer hover:bg-secondary" : "border-muted/50 opacity-60")
                    )}
                    onClick={() => isCurrent && navigate(step.link)}
                >
                    <div className="flex items-center space-x-3">
                        <Icon className={cn("w-5 h-5", step.isDone ? "text-emerald-600" : "text-primary")} />
                        <span className={cn("font-medium", step.isDone && "line-through text-muted-foreground")}>
                            {step.label}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {step.downloadLink && (
                            <Button variant="ghost" size="icon" asChild onClick={(e) => e.stopPropagation()}>
                                <a href={step.downloadLink} download>
                                    <FileDown className="w-4 h-4" />
                                </a>
                            </Button>
                        )}
                        {isCurrent && (
                            <Button variant="default" size="sm" className="pointer-events-none">
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        )}
                        {step.isDone && <CheckCircle className="w-5 h-5 text-emerald-600" />}
                    </div>
                </div>
            );
        })}
        
        <div 
            className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                !missingSet.has('plano_contas') && !missingSet.has('historicos') && !missingSet.has('plano_contas_caixa') && !missingSet.has('plano_contas_capital_social') ? "border-primary/50 bg-secondary/50 cursor-pointer hover:bg-secondary" : "border-muted/50 opacity-60"
            )}
            onClick={() => !missingSet.has('plano_contas') && navigate('/painel')}
        >
            <div className="flex items-center space-x-3">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="font-medium">5. Realizar Primeiro Lançamento (Capital Social)</span>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="default" size="sm" className="pointer-events-none">
                    <ArrowRight className="w-4 h-4" />
                </Button>
            </div>
        </div>
    </div>
  );
};

interface SetupBlockerProps {
  missingSteps: SetupStepKey[];
}

const SetupBlocker: React.FC<SetupBlockerProps> = ({ missingSteps }) => {
  const { ownerId, refetch } = useSessao();
  const [executingSetup, setExecutingSetup] = useState(false);

  const handleRunSetup = useCallback(async () => {
    if (!ownerId) return;
    setExecutingSetup(true);

    try {
      await triggerContabilSetup({ proprietarioId: ownerId });
      showSuccess('Setup contábil executado com sucesso. Atualizando status...');
      await refetch();
    } catch (error: any) {
      console.error('Erro ao executar setup contábil manual:', error);
      showError('Não foi possível executar o setup contábil. Tente novamente.');
    } finally {
      setExecutingSetup(false);
    }
  }, [ownerId, refetch]);

  return (
    <Card className="border-destructive/40 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Configuração Inicial Obrigatória
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          Para lançar contas ou acessar o painel, conclua primeiro as etapas abaixo. Após
          finalizar, os módulos de Contas a Pagar/Receber e o Dashboard serão liberados.
        </p>

        <div className="space-y-1">
          <Button
            variant="secondary"
            className="w-full justify-center"
            onClick={handleRunSetup}
            disabled={!ownerId || executingSetup}
          >
            {executingSetup ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Executando setup contábil...
              </>
            ) : (
              <>
                <Settings className="mr-2 h-4 w-4" />
                Executar Setup Contábil agora
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Gera automaticamente o plano de contas, históricos e mapeamentos obrigatórios.
          </p>
        </div>

        <SetupChecklistList missingSteps={missingSteps} />

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="default" className="flex-1" asChild>
            <Link to="/configuracoes">
              <Settings className="h-4 w-4 mr-2" />
              Abrir Configurações
            </Link>
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <Link to="/plano-contas">
              <BookOpen className="h-4 w-4 mr-2" />
              Abrir Plano de Contas
            </Link>
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <Link to="/historicos">
              <History className="h-4 w-4 mr-2" />
              Abrir Históricos
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SetupBlocker;