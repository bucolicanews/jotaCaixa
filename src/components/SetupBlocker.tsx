import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Settings, FileDown, FileUp, BookOpen, History, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SETUP_STEPS_META } from '@/utils/setup-status';
import { SetupStepKey } from '@/types/setup';
import { cn } from '@/lib/utils';

interface SetupChecklistListProps {
  missingSteps: SetupStepKey[];
  compact?: boolean;
}

// Mapeamento dos passos sequenciais para as chaves de setup
const SEQUENTIAL_STEPS: { key: string, label: string, link: string, icon: React.ElementType, requiredKeys: SetupStepKey[] }[] = [
    {
        key: 'download_plano',
        label: '1. Baixe o Plano de Contas Padrão',
        link: '/exportar',
        icon: FileDown,
        requiredKeys: [],
    },
    {
        key: 'import_plano',
        label: '2. Importe o Plano de Contas',
        link: '/plano-contas',
        icon: FileUp,
        requiredKeys: ['plano_contas'],
    },
    {
        key: 'download_historicos',
        label: '3. Baixe os Históricos Padrão',
        link: '/exportar',
        icon: FileDown,
        requiredKeys: [],
    },
    {
        key: 'import_historicos',
        label: '4. Importe os Históricos',
        link: '/historicos',
        icon: FileUp,
        requiredKeys: ['historicos'],
    },
    {
        key: 'marcar_contas',
        label: '5. Marque as Contas Essenciais (Caixa, Capital, Receita, Despesa)',
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
        label: '6. Configure Mapeamentos (CR, CP, Contratos)',
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
  if (missingSteps.length === 0) return null;
  
  // Mapeia as chaves ausentes para fácil consulta
  const missingSet = new Set(missingSteps);
  
  // Determina o status de cada passo sequencial
  const sequentialStatus = SEQUENTIAL_STEPS.map(step => {
      const isDone = step.requiredKeys.length > 0 && step.requiredKeys.every(key => !missingSet.has(key));
      return { ...step, isDone };
  });
  
  // Determina o próximo passo pendente
  const nextPendingStep = sequentialStatus.find(step => !step.isDone);
  
  // Se o próximo passo for a importação, o link de download é o anterior
  const isImportStep = nextPendingStep?.key.includes('import');
  const downloadStep = isImportStep ? sequentialStatus.find(s => s.key === nextPendingStep.key.replace('import', 'download')) : null;
  
  // Se o próximo passo for marcar contas, o link é para o Plano de Contas
  const isMarkingStep = nextPendingStep?.key === 'marcar_contas';
  const isConfigStep = nextPendingStep?.key === 'config_contabil';
  
  // Se o próximo passo for a importação de históricos, o link de download é o anterior
  const isImportHistoricos = nextPendingStep?.key === 'import_historicos';
  const downloadHistoricosStep = isImportHistoricos ? sequentialStatus.find(s => s.key === 'download_historicos') : null;


  return (
    <div className="space-y-4">
        <h3 className="font-semibold text-lg">Passos de Onboarding:</h3>
        
        {sequentialStatus.map((step, index) => {
            const Icon = step.icon;
            const isCurrent = !step.isDone && nextPendingStep?.key === step.key;
            
            // Lógica para o botão de ação
            let actionButton = null;
            let actionLink = step.link;
            
            if (step.key === 'download_plano' || step.key === 'download_historicos') {
                actionButton = (
                    <Button variant="outline" size="sm" asChild>
                        <a href={step.link === '/exportar' ? (step.key === 'download_plano' ? '/plano_contas_padrao.csv' : '/historicos_padrao.csv') : step.link} download>
                            <FileDown className="w-4 h-4 mr-2" /> Baixar
                        </a>
                    </Button>
                );
            } else if (step.key === 'import_plano' || step.key === 'import_historicos') {
                actionButton = (
                    <Button variant="default" size="sm" asChild>
                        <Link to={step.link}>
                            <FileUp className="w-4 h-4 mr-2" /> Importar
                        </Link>
                    </Button>
                );
            } else if (isMarkingStep || isConfigStep) {
                actionButton = (
                    <Button variant="default" size="sm" asChild>
                        <Link to={step.link}>
                            <ArrowRight className="w-4 h-4 mr-2" /> Configurar
                        </Link>
                    </Button>
                );
            }

            return (
                <div 
                    key={step.key} 
                    className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        step.isDone ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20" : (isCurrent ? "border-primary/50 bg-secondary/50" : "border-muted/50 opacity-60")
                    )}
                >
                    <div className="flex items-center space-x-3">
                        <Icon className={cn("w-5 h-5", step.isDone ? "text-emerald-600" : "text-primary")} />
                        <span className={cn("font-medium", step.isDone && "line-through text-muted-foreground")}>
                            {step.label}
                        </span>
                    </div>
                    {isCurrent && actionButton}
                    {step.isDone && <CheckCircle className="w-5 h-5 text-emerald-600" />}
                </div>
            );
        })}
        
        {/* PASSO FINAL: PRIMEIRO LANÇAMENTO */}
        <div 
            className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                !missingSet.has('plano_contas') && !missingSet.has('historicos') && !missingSet.has('plano_contas_caixa') && !missingSet.has('plano_contas_capital_social') ? "border-primary/50 bg-secondary/50" : "border-muted/50 opacity-60"
            )}
        >
            <div className="flex items-center space-x-3">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="font-medium">7. Realizar Primeiro Lançamento (Capital Social)</span>
            </div>
            <Button variant="default" size="sm" asChild>
                <Link to="/painel">
                    <ArrowRight className="w-4 h-4 mr-2" /> Ir para Painel
                </Link>
            </Button>
        </div>
    </div>
  );
};

interface SetupBlockerProps {
  missingSteps: SetupStepKey[];
}

const SetupBlocker: React.FC<SetupBlockerProps> = ({ missingSteps }) => {
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