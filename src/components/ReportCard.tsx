import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  link: string;
  isDisabled: boolean;
  permissionLabel: string;
}

const ReportCard: React.FC<ReportCardProps> = ({ title, description, icon: Icon, link, isDisabled, permissionLabel }) => {
  return (
    <Card className={cn("transition-all duration-300", isDisabled ? "opacity-60 cursor-not-allowed" : "hover:shadow-lg hover:border-primary")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        <Icon className={cn("h-6 w-6", isDisabled ? "text-muted-foreground" : "text-primary")} />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground h-12 overflow-hidden">
          {description}
        </p>
        
        {isDisabled ? (
            <div className="text-xs text-red-500 flex items-center">
                Acesso Negado: Permissão '{permissionLabel}' necessária.
            </div>
        ) : (
            <Link to={link}>
                <Button variant="secondary" className="w-full">
                    Acessar Relatório <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </Link>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportCard;