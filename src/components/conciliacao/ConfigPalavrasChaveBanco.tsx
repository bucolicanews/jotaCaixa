import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, ShieldAlert } from 'lucide-react';
import { useChavesBancoPuro } from '@/hooks/conciliacao/useChavesBancoPuro';
import { Separator } from '@/components/ui/separator';

export function ConfigPalavrasChaveBanco() {
  const { palavrasChave, loading, adicionarPalavra, removerPalavra } = useChavesBancoPuro();
  const [novoTermo, setNovoTermo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const handleAdicionar = async () => {
    if (!novoTermo.trim()) return;
    setSalvando(true);
    const ok = await adicionarPalavra(novoTermo.trim());
    if (ok) setNovoTermo('');
    setSalvando(false);
  };

  const handleRemover = async (id: string) => {
    setRemovendo(id);
    await removerPalavra(id);
    setRemovendo(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-semibold text-gray-700">Palavras-chave de Banco Puro</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Transações cujas descrições contenham estes termos (case-insensitive) serão registradas como <strong>pendência</strong> e não serão marcadas como conciliadas automaticamente.
      </p>

      <Separator />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 min-h-[36px]">
          {palavrasChave.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">Nenhuma palavra configurada.</span>
          ) : (
            palavrasChave.map((p) => (
              <Badge
                key={p.id}
                variant="secondary"
                className="flex items-center gap-1 bg-orange-50 text-orange-800 border border-orange-200 pr-1"
              >
                {p.termo}
                <button
                  onClick={() => handleRemover(p.id)}
                  disabled={removendo === p.id}
                  className="ml-1 rounded-full hover:bg-orange-200 p-0.5 transition-colors"
                >
                  {removendo === p.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </Badge>
            ))
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Ex: TARIFA, IOF, JUROS..."
          value={novoTermo}
          onChange={(e) => setNovoTermo(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdicionar(); } }}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdicionar}
          disabled={!novoTermo.trim() || salvando}
          className="h-8 px-3"
        >
          {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}
