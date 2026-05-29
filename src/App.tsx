import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

import ClientLoginPage from "./pages/auth/ClientLoginPage";
import AdminLoginPage from "./pages/auth/AdminLoginPage";
import ClientLoginPage from "./pages/auth/ClientLoginPage";
import AdminLoginPage from "./pages/auth/AdminLoginPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import OnboardingPage from "./pages/onboarding/OnboardingPage";

import DashboardPage from "./pages/app/DashboardPage";
import ConvitesPage from "./pages/app/ConvitesPage";
import AcessosPage from "./pages/app/AcessosPage";
import MyProfilePage from "./pages/profile/MyProfilePage";

import NotFound from "./pages/NotFound";
import ProposalWhatsappOficial from "./pages/ProposalWhatsappOficial";
import UbertiProposta from "./pages/UbertiProposta";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 1000 * 60 * 5 },
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
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<ClientLoginPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
            <Route path="/proposta-whatsapp-api-oficial" element={<ProposalWhatsappOficial />} />
            <Route path="/ubertiproposta" element={<UbertiProposta />} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/crm" element={<DashboardPage />} />
              <Route path="/configuracoes/convites" element={<ConvitesPage />} />
              <Route path="/configuracoes/acessos" element={<ProtectedRoute requireOwner><AcessosPage /></ProtectedRoute>} />
              <Route path="/perfil" element={<MyProfilePage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
