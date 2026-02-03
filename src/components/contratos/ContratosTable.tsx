import React, { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Edit,
  Eye,
  Loader2,
  FileEdit,
} from 'lucide-react'
import { ContratoGerado } from '@/types/contratos'
import { format, parseISO } from 'date-fns'
import { BadgeAditivos } from './BadgeAditivos'
import { AditivosContratoDialog } from './AditivosContratoDialog'

type ContratoComCliente = ContratoGerado & {
  clientes: { nome: string } | null
  conta_receber_id: string
}

interface ContratosTableProps {
  list: ContratoComCliente[]
  isSupervisao: boolean
  empresaId: string | null
  carregando: boolean

  handleOpenAcoes: (contrato: ContratoGerado) => void
  handleEditContract: (contrato: ContratoGerado) => void
}

export default function ContratosTable({
  list,
  isSupervisao,
  empresaId,
  carregando,
  handleOpenAcoes,
  handleEditContract,
}: ContratosTableProps) {
  // ✅ ESTADOS OBRIGATÓRIOS
  const [aditivosDialogOpen, setAditivosDialogOpen] = useState(false)
  const [contratoSelecionado, setContratoSelecionado] =
    useState<ContratoComCliente | null>(null)

  if (carregando) {
    return (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isSupervisao && <TableHead>Empresa</TableHead>}
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Data Início</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {list.map((c) => (
              <TableRow key={c.id}>
                {isSupervisao && (
                  <TableCell>{c.clientes?.nome ?? 'N/A'}</TableCell>
                )}

                <TableCell className="font-medium">
                  {c.clientes?.nome ?? 'N/A'}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(c.valor_total)}
                    <BadgeAditivos contratoId={c.id} />
                  </div>
                </TableCell>

                <TableCell>
                  {format(parseISO(c.data_inicio), 'dd/MM/yyyy')}
                </TableCell>

                <TableCell>
                  <Badge>{c.status}</Badge>
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditContract(c)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>

                    {c.status === 'ativo' && c.proprietario_id === empresaId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          console.log('BOTÃO OK', c.id)
                          setContratoSelecionado(c)
                          setAditivosDialogOpen(true)
                        }}
                      >
                        <FileEdit className="w-4 h-4" />
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAcoes(c)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Ver Ações
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ✅ DIALOG SEM CONDIÇÃO */}
      <AditivosContratoDialog
        open={aditivosDialogOpen}
        onOpenChange={setAditivosDialogOpen}
        contaReceberId={contratoSelecionado?.conta_receber_id ?? null}
      />
    </>
  )
}
