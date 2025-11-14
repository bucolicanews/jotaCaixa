import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { SessionProvider } from './contexts/SessionContext';
import SiteLayout from './components/SiteLayout';
import LayoutPrincipal from './components/LayoutPrincipal';
import NotFound from './pages/NotFound';
import Index from './pages/Index';
import Login from './pages/Login';
import Painel from './pages/Painel';
import Perfil from './pages/Perfil';
import AtualizarSenha from './pages/AtualizarSenha';
import { FolhaPonto } from './pages/FolhaPonto';
import Contratos from './pages/Contratos';
import GerenciarTags from './pages/GerenciarTags';
import GerenciarModelos from './pages/GerenciarModelos';
import NovoContrato from './pages/NovoContrato';
import PreencherContrato from './pages/PreencherContrato';
import ContratoLinkPage from './pages/ContratoLinkPage';
import AssinarContrato from './pages/AssinarContrato';
import GerenciarPlanos from './pages/GerenciarPlanos';
import Vendas from './pages/Vendas';
import MinhaAssinatura from './pages/MinhaAssinatura';
import SelecaoPagamentoRenovacao from './pages/SelecaoPagamentoRenovacao';
import ContasReceber from './pages/ContasReceber';
import ClientesPage from './pages/Clientes';
import Bancos from './pages/Bancos';
import ContasPagar from './pages/ContasPagar';
import Conciliacao from './pages/Conciliacao';
import Importar from './pages/Importar';
import Configuracoes from './pages/Configuracoes';
import GerenciarHistoricos from './pages/GerenciarHistoricos';
import PlanoContasPage from './pages/contabilidade/PlanoContas';
import FluxoCaixa from './pages/FluxoCaixa';
import DRE from './pages/DRE';
import BalancoPatrimonial from './pages/BalancoPatrimonial';
import Exportar from './pages/Exportar';
import LancamentosNaoMapeados from './pages/LancamentosNaoMapeados';
import GerenciarUsuarios from './pages/GerenciarUsuarios';
import CadastrarEmpresa from './pages/CadastrarEmpresa';
import DocumentosSocietarios from './pages/DocumentosSocietarios';
import GerenciarModelosSocietarios from './pages/GerenciarModelosSocietarios';
import GerenciarBlocosSocietarios from './pages/GerenciarBlocosSocietarios';
import GerarDocumentoSocietario from './pages/GerarDocumentoSocietario';
import AdminSuporte from './pages/AdminSuporte';
import Suporte from './pages/Suporte';
import ContasPatrimoniais from './pages/ContasPatrimoniais';
import Relatorios from './pages/Relatorios';


export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          {/* Rotas Públicas (Landing Page, Login, Assinatura Externa) */}
          <Route path="/" element={<SiteLayout />}>
            <Route index element={<Index />} />
            <Route path="login" element={<Login />} />
            <Route path="vendas" element={<Vendas />} />
            <Route path="contrato-link/:id" element={<ContratoLinkPage />} />
            <Route path="assinar-contrato/:id" element={<AssinarContrato />} />
            <Route path="atualizar-senha" element={<AtualizarSenha />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Rotas Protegidas (Layout Principal) */}
          <Route path="/" element={<LayoutPrincipal>
            <Routes>
              <Route path="painel" element={<Painel />} />
              <Route path="perfil" element={<Perfil />} />
              <Route path="ponto-eletronico" element={<Perfil />} /> {/* Redireciona para Perfil para ver o ponto */}
              <Route path="folha-ponto" element={<FolhaPonto />} />
              <Route path="minha-assinatura" element={<MinhaAssinatura />} />
              <Route path="renovacao" element={<SelecaoPagamentoRenovacao />} />
              
              {/* Financeiro */}
              <Route path="contas-receber" element={<ContasReceber />} />
              <Route path="contas-pagar" element={<ContasPagar />} />
              <Route path="bancos" element={<Bancos />} />
              <Route path="contas-patrimoniais" element={<ContasPatrimoniais />} />
              <Route path="plano-contas" element={<PlanoContasPage />} />
              <Route path="historicos" element={<GerenciarHistoricos />} />
              <Route path="conciliacao" element={<Conciliacao />} />
              
              {/* Cadastros */}
              <Route path="clientes" element={<ClientesPage />} />
              <Route path="gerenciar-usuarios" element={<GerenciarUsuarios />} />
              <Route path="cadastrar-empresa" element={<CadastrarEmpresa />} />
              <Route path="planos" element={<GerenciarPlanos />} />
              
              {/* Contratos */}
              <Route path="contratos" element={<Contratos />} />
              <Route path="contratos/tags" element={<GerenciarTags />} />
              <Route path="contratos/modelos" element={<GerenciarModelos />} />
              <Route path="contratos/novo" element={<NovoContrato />} />
              <Route path="contratos/preencher/:modeloId" element={<PreencherContrato />} />
              
              {/* Documentos Societários */}
              <Route path="documentos-societarios" element={<DocumentosSocietarios />} />
              <Route path="documentos-societarios/modelos" element={<GerenciarModelosSocietarios />} />
              <Route path="documentos-societarios/blocos" element={<GerenciarBlocosSocietarios />} />
              <Route path="documentos-societarios/gerar/:modeloId" element={<GerarDocumentoSocietario />} />
              <Route path="documentos-societarios/visualizar/:id" element={<GerarDocumentoSocietario />} />
              
              {/* Relatórios */}
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="relatorios/fluxo-caixa" element={<FluxoCaixa />} />
              <Route path="relatorios/dre" element={<DRE />} />
              <Route path="relatorios/balanco" element={<BalancoPatrimonial />} />
              <Route path="relatorios/lancamentos-nao-mapeados" element={<LancamentosNaoMapeados />} />
              
              {/* Exportação/Configuração */}
              <Route path="importar" element={<Importar />} />
              <Route path="exportar" element={<Exportar />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              
              {/* Suporte */}
              <Route path="suporte" element={<Suporte />} />
              <Route path="admin/suporte" element={<AdminSuporte />} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </LayoutPrincipal>}>
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </SessionProvider>
  );
}