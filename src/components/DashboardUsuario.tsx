import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpCircle, ArrowDownCircle, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

const DashboardUsuario: React.FC = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold">Seu Resumo Financeiro</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-l-4 border-green-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" /> Contas a Receber</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            R$ 15.000,00
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Próximos 30 dias</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-red-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" /> Contas a Pagar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            R$ 5.000,00
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Próximos 30 dias</p>
                    </CardContent>
                </Card>
                <Card className={cn("border-l-4 border-primary")}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center"><DollarSign className="w-4 h-4 mr-2" /> Saldo Projetado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">
                            R$ 10.000,00
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Resultado do mês</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default DashboardUsuario;