import { UserProfile } from "@clerk/clerk-react";

export default function Perfil() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">Seus dados de conta e segurança.</p>
      </div>
      <UserProfile routing="path" path="/perfil" />
    </div>
  );
}
