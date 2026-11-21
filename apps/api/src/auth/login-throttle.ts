/**
 * Limite les échecs de connexion par compte, en plus de la limite par adresse IP.
 * La limite par IP arrête un robot seul ; celle-ci arrête une attaque répartie sur beaucoup
 * d'adresses qui vise un même compte.
 *
 * Compromis assumé : quelqu'un peut bloquer un compte pour 15 minutes en s'y trompant exprès.
 * C'est préférable à laisser deviner un mot de passe ; le propriétaire peut intervenir.
 * L'état est en mémoire : il repart à zéro au redémarrage et n'est pas partagé entre
 * plusieurs instances (acceptable pour une seule instance, à revoir si on en lance plusieurs).
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxTracked = 10_000,
  ) {}

  isLocked(key: string, now = Date.now()): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (now - entry.since >= this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.failures.get(key);
    if (!entry || now - entry.since >= this.windowMs) {
      this.failures.set(key, { count: 1, since: now });
    } else {
      entry.count++;
    }
    if (this.failures.size > this.maxTracked) this.evictExpired(now);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.failures) {
      if (now - entry.since >= this.windowMs) this.failures.delete(key);
    }
    // Si tout est encore récent, on garde la limite mémoire en retirant les plus anciens.
    while (this.failures.size > this.maxTracked) {
      const oldest = this.failures.keys().next();
      if (oldest.done) break;
      this.failures.delete(oldest.value);
    }
  }
}
