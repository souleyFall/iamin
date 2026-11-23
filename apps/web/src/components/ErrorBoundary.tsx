import { Component, type ErrorInfo, type ReactNode } from 'react';
import { activeLocale, translate } from '../lib/i18n';
import { reportError } from '../lib/report-error';

/**
 * Dernier filet de l'interface : un écran qui plante affiche une consigne claire au lieu d'une page
 * blanche, et l'erreur part au journal du serveur. Un composant de classe : React n'offre pas
 * d'équivalent par hook.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(
      'render',
      Object.assign(error, { stack: `${error.stack ?? ''}${info.componentStack ?? ''}` }),
    );
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const locale = activeLocale();
    return (
      <main role="alert" className="page-wide" style={{ padding: '2rem 1rem' }}>
        <h1>{translate(locale, 'err.crash.title')}</h1>
        <p>{translate(locale, 'err.crash.body')}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {translate(locale, 'err.crash.reload')}
        </button>
      </main>
    );
  }
}
