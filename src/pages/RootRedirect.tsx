import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function RootRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    // Apenas redireciona para a página de login
    navigate("/login", { replace: true });
  }, [navigate]);

  return null;
}
