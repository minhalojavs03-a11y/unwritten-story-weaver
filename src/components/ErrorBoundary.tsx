import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  clearImpersonationAndReload = () => {
    try {
      localStorage.removeItem("impersonation_context");
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("feracon.activeMember")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error?.message ?? String(this.state.error);
    const stack = this.state.error?.stack ?? "";
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-lg">
          <div>
            <h1 className="text-lg font-semibold">Algo deu errado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A tela não pôde ser renderizada. Detalhes abaixo para o time técnico.
            </p>
          </div>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 text-xs text-foreground/80">
            {msg}
            {"\n\n"}
            {stack}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={this.reset}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Tentar novamente
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Recarregar
            </button>
            <button
              onClick={this.clearImpersonationAndReload}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sair do modo suporte
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
