/** Message d'erreur d'une requête : annoncé aux lecteurs d'écran, dit quoi faire quand c'est possible. */
export function ErrorNote({ error }: { error: Error | null | undefined }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error.message}
    </p>
  );
}
