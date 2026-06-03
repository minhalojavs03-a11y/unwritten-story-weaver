import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveMemberProvider } from "@/contexts/ActiveMemberContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

import ClientLoginPage from "./pages/auth/ClientLoginPage";
import AdminLoginPage from "./pages/auth/AdminLoginPage";
import RootRedirect from "./pages/RootRedirect";
import DashboardPage from "./pages/app/DashboardPage";
import ConversasPage from "./pages/app/ConversasPage";
import PipelinePage from "./pages/app/PipelinePage";
import AgendaPage from "./pages/app/AgendaPage";
import RecordingsPage from "./pages/app/RecordingsPage";
import ClientesPage from "./pages/app/ClientesPage";
import LeadsPage from "./pages/app/LeadsPage";
import FilaLeadsPage from "./pages/app/FilaLeadsPage";
import ConfiguracoesPage from "./pages/app/ConfiguracoesPage";
import WhatsAppPage from "./pages/app/WhatsAppPage";
import MeuWhatsAppPage from "./pages/app/MeuWhatsAppPage";
import TreinarIAPage from "./pages/app/TreinarIAPage";
import MyProfilePage from "./pages/profile/MyProfilePage";
import OnboardingPage from "./pages/onboarding/OnboardingPage";
import EquipePage from "./pages/app/EquipePage";
import DistribuicaoLeadsPage from "./pages/app/DistribuicaoLeadsPage";
import AcessosPage from "./pages/app/AcessosPage";
import ConsultoresPage from "./pages/app/ConsultoresPage";
import MensagensProntasPage from "./pages/app/MensagensProntasPage";
import ChangelogPage from "./pages/app/ChangelogPage";
import RankingPage from "./pages/app/RankingPage";
import RelatoriosPage from "./pages/app/RelatoriosPage";
import CoachingPage from "./pages/app/CoachingPage";
import NiltonLeadsPage from "./pages/app/NiltonLeadsPage";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminClientes from "./pages/admin/AdminClientes";
import AdminEquipes from "./pages/admin/AdminEquipes";
import AdminInstancias from "./pages/admin/AdminInstancias";
import AdminIA from "./pages/admin/AdminIA";
import AdminTemplates from "./pages/admin/AdminTemplates";
import AdminAutomacoes from "./pages/admin/AdminAutomacoes";
import AdminCampanhas from "./pages/admin/AdminCampanhas";
import AdminFinanceiro from "./pages/admin/AdminFinanceiro";
import AdminIntegracoes from "./pages/admin/AdminIntegracoes";

import NotFound from "./pages/NotFound.tsx";
import ProposalWhatsappOficial from "./pages/ProposalWhatsappOficial";
import UbertiProposta from "./pages/UbertiProposta";
import JoinPage from "./pages/JoinPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <InstallPrompt />
      <BrowserRouter>
        <AuthProvider>
          <ActiveMemberProvider>
            <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<ClientLoginPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/join/:token" element={<JoinPage />} />
            <Route path="/proposta-whatsapp-api-oficial" element={<ProposalWhatsappOficial />} />
            <Route path="/ubertiproposta" element={<UbertiProposta />} />
            <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

            {/* Client app */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/crm" element={<DashboardPage />} />
              <Route path="/dashboard" element={<Navigate to="/crm" replace />} />
              <Route path="/conversas" element={<ConversasPage />} />
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/gravacoes" element={<RecordingsPage />} />

              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/fila" element={<FilaLeadsPage />} />
              <Route path="/nilton" element={<NiltonLeadsPage />} />
              <Route path="/whatsapp" element={<ProtectedRoute requireOwner allowSupervisor><WhatsAppPage /></ProtectedRoute>} />
              <Route path="/meu-whatsapp" element={<MeuWhatsAppPage />} />
              <Route path="/treinar-ia" element={<ProtectedRoute requireOwner><TreinarIAPage /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute requireOwner><ConfiguracoesPage /></ProtectedRoute>} />
              <Route path="/configuracoes/acessos" element={<ProtectedRoute requireOwner><AcessosPage /></ProtectedRoute>} />
              <Route path="/perfil" element={<MyProfilePage />} />
              <Route path="/equipe" element={<ProtectedRoute requireOwner><EquipePage /></ProtectedRoute>} />
              <Route path="/consultores" element={<ProtectedRoute denyConsultant><ConsultoresPage /></ProtectedRoute>} />
              <Route path="/distribuicao" element={<ProtectedRoute requireOwner><DistribuicaoLeadsPage /></ProtectedRoute>} />
              <Route path="/mensagens-prontas" element={<MensagensProntasPage />} />
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/ranking" element={<RankingPage />} />
              <Route path="/relatorios" element={<ProtectedRoute denyConsultant><RelatoriosPage /></ProtectedRoute>} />
              <Route path="/coaching" element={<ProtectedRoute denyConsultant><CoachingPage /></ProtectedRoute>} />
              <Route path="/integracoes" element={<ProtectedRoute requireOwner><AdminIntegracoes /></ProtectedRoute>} />

            </Route>

            {/* Superadmin */}
            <Route path="/admin" element={<ProtectedRoute requireSuperadmin><AdminLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="clientes" element={<AdminClientes />} />
              <Route path="equipes" element={<AdminEquipes />} />
              <Route path="instancias" element={<AdminInstancias />} />
              <Route path="ia" element={<AdminIA />} />
              <Route path="templates" element={<AdminTemplates />} />
              <Route path="automacoes" element={<AdminAutomacoes />} />
              <Route path="campanhas" element={<AdminCampanhas />} />
              <Route path="integracoes" element={<AdminIntegracoes />} />
              <Route path="financeiro" element={<AdminFinanceiro />} />
            </Route>

            <Route path="*" element={<NotFound />} />
            </Routes>
          </ActiveMemberProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
