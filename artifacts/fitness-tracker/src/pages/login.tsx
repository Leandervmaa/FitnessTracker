import { useState } from "react";
import { Dumbbell, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Inloggen mislukt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Dumbbell className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-foreground">Bodyrebuild</h1>
          <p className="text-sm text-muted-foreground mt-1">Log in op je traject</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Gebruikersnaam</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label>Wachtwoord</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <Button type="submit" className="w-full h-12 font-bold" disabled={loading}>
            <LogIn className="h-4 w-4 mr-2" />
            {loading ? "Bezig..." : "Inloggen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
