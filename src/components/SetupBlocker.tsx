import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SETUP_STEPS_META } from '@/utils/setup-status';
import { SetupStepKey } from '@/types/setup';
import { cn } from '@/lib/utils';

interface SetupChecklistListProps {
  missingSteps: SetupStepKey[];
  compact?: boolean;
}

export const SetupChecklistList: React.FC<SetupChecklistListProps> = ({
  missingSteps,
  compact = false,
}) => {
  if (missingSteps.length === 0) return null;

  return (
    <ul className={cn('space-y-2', compact && 'text-sm space-y-1')}>
      {missingSteps.map((step) => {
        const meta = SETUP_STEPS_META[step];
        
        // Determina o link de destino
        let targetPath = meta.link;
        if (step === 'config_cp' || step === 'config_cr' || step === 'config_contratos') {
            targetPath = `/configuracoes?tab=${step.replace('config_', '')}`;
        }

        return (
          <li
            key={step}
            className="flex flex-col rounded-lg border border-dashed border-destructive/50 bg-destructive/5 p-3"
          >
            <Link to={targetPath} className="flex flex-col w-full">
                <span className="font-medium text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {meta.label}
                </span>
                <span className="text-muted-foreground text-sm">{meta.description}</span>
            </Link>
          </li>
        );
      })}
    </ul>
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
              Ir para Configurações
            </Link>
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <Link to="/plano-contas">
              <CheckCircle className="h-4 w-4 mr-2" />
              Abrir Plano de Contas
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SetupBlocker;