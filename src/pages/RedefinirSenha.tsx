import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// A recuperação de senha é feita pelo Clerk (fluxo "esqueci minha senha" no SignIn).
export default function RedefinirSenha() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/login", { replace: true });
  }, [navigate]);
  return null;
}
