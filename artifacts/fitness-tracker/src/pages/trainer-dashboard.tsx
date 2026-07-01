import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LogOut, Plus, Search, UserRound, Pencil, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth-context";
import { useClient } from "@/components/client-context";

type ClientRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  goal: string | null;
  notes: string | null;
  status: string;
  user: { username: string } | null;
};

const emptyForm = {
  name: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  goal: "",
  notes: "",
};

export default function TrainerDashboard() {
  const { user, logout } = useAuth();
  const { setActiveClientId } = useClient();
  const [, setLocation] = useLocation();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadClients = async () => {
    if (user?.role !== "trainer") return;
    const res = await apiFetch("/api/clients");
    if (res.ok) setClients(await res.json());
  };

  useEffect(() => {
    if (user?.role !== "trainer") {
      setLocation("/");
      return;
    }
    loadClients();
  }, [user?.role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) =>
      [client.name, client.email, client.phone, client.goal, client.user?.username]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [clients, query]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (client: ClientRecord) => {
    setEditing(client);
    setForm({
      name: client.name,
      username: client.user?.username || "",
      password: "",
      email: client.email || "",
      phone: client.phone || "",
      goal: client.goal || "",
      notes: client.notes || "",
    });
    setError("");
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const payload = { ...form };
    if (editing && !payload.password) {
      delete (payload as Partial<typeof payload>).password;
    }
    try {
      const res = await apiFetch(editing ? `/api/clients/${editing.id}` : "/api/clients", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Opslaan mislukt");
      setDialogOpen(false);
      await loadClients();
    } catch (err: any) {
      setError(err.message || "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  const openClient = (clientId: string) => {
    setActiveClientId(clientId);
    setLocation("/");
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="w-full border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserRound className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">Trainer menu</h1>
            <p className="text-xs text-muted-foreground">Klanten beheren en trajecten openen</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} title="Uitloggen">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10 h-11" placeholder="Zoek klant, doel of gebruikersnaam" />
          </div>
          <Button onClick={openNew} className="h-11 font-bold">
            <Plus className="h-4 w-4 mr-2" />
            Klant toevoegen
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((client) => (
            <div key={client.id} className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <UserRound className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-black text-foreground truncate">{client.name}</h2>
                  <p className="text-xs text-muted-foreground truncate">{client.goal || "Geen doel ingevuld"}</p>
                  <p className="text-xs font-semibold text-primary mt-1">Login: {client.user?.username || "nog geen account"}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button className="flex-1 font-bold" onClick={() => openClient(client.id)}>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Traject openen
                </Button>
                <Button variant="outline" size="icon" onClick={() => openEdit(client)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Klant bewerken" : "Nieuwe klant"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Naam" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gebruikersnaam" value={form.username} onChange={(username) => setForm((f) => ({ ...f, username }))} />
              <Field label={editing ? "Nieuw wachtwoord" : "Wachtwoord"} value={form.password} onChange={(password) => setForm((f) => ({ ...f, password }))} type="password" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail" value={form.email} onChange={(email) => setForm((f) => ({ ...f, email }))} />
              <Field label="Telefoon" value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
            </div>
            <Field label="Doel" value={form.goal} onChange={(goal) => setForm((f) => ({ ...f, goal }))} />
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            <Button className="w-full h-11 font-bold" onClick={save} disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
