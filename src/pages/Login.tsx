import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { showSuccess, showError } from "@/utils/toast";

const TelaLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigoAcesso, setCodigoAcesso] = useState("");
  const [modoLogin, setModoLogin] = useState<"credenciais" | "codigo">("credenciais");
  const { loginPorEmail, loginPorCodigoAcesso } = useAuth();
  const navegar = useNavigate();

  const lidarComLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modoLogin === "credenciais") {
        await loginPorEmail(email, senha);
        showSuccess("Login de administrador realizado com sucesso!");
      } else {
        await loginPorCodigoAcesso(codigoAcesso);
        showSuccess("Login de cliente realizado com sucesso!");
      }
      navegar("/");
    } catch (erro) {
      console.error("Erro de login:", erro);
      showError("Falha no login. Verifique suas credenciais ou código de acesso.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Acesso ao Fluxo de Caixa</CardTitle>
          <CardDescription>
            {modoLogin === "credenciais"
              ? "Insira seu email e senha (Admin)."
              : "Insira seu código de acesso (Cliente)."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={lidarComLogin} className="grid gap-4">
            {modoLogin === "credenciais" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="codigoAcesso">Código de Acesso</Label>
                <Input
                  id="codigoAcesso"
                  type="text"
                  placeholder="ABC123XYZ"
                  required
                  value={codigoAcesso}
                  onChange={(e) => setCodigoAcesso(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Button
              variant="link"
              onClick={() => setModoLogin(modoLogin === "credenciais" ? "codigo" : "credenciais")}
            >
              {modoLogin === "credenciais"
                ? "Acessar com Código de Cliente"
                : "Acessar com Email e Senha"
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TelaLogin;