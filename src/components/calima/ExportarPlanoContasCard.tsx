import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, FileDown } from 'lucide-react';
import ExportarPlanoContasButton from '@/components/contabilidade/ExportarPlanoContasButton';

const ExportarPlanoContasCard: React.FC = () => {
    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center"><BookOpen className="w-5 h-5 mr-2" /> Exportar Plano de Contas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Exporta o Plano de Contas completo no formato CSV (Conta;Código reduzido;Descrição;Analítica).
                </p>
                <ExportarPlanoContasButton />
            </CardContent>
        </Card>
    );
};

export default ExportarPlanoContasCard;