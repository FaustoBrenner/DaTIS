/**
 * Cookie jar mínimo. O TASY depende de alguns cookies de infraestrutura
 * (TASYAPPSERVER para afinidade de load balancer, JSESSIONID) que precisam
 * ser ecoados de volta ao longo da sessão. Guardamos o último valor de cada nome.
 */
export class CookieJar {
  private readonly store = new Map<string, string>();

  /** Absorve os Set-Cookie de uma resposta. */
  absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      // Cookies de expiração (Max-Age=0) sinalizam remoção.
      if (/(?:^|;)\s*max-age=0(?:;|$)/i.test(raw)) {
        this.store.delete(name);
      } else {
        this.store.set(name, value);
      }
    }
  }

  /** Monta o header Cookie, ou undefined se o jar estiver vazio. */
  header(): string | undefined {
    if (this.store.size === 0) return undefined;
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get(name: string): string | undefined {
    return this.store.get(name);
  }

  clear(): void {
    this.store.clear();
  }
}
