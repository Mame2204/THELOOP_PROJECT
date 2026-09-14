export function MobileContentLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-loop-gold border-t-transparent" />
      <p className="mt-4 text-sm text-loop-public-muted">{label}</p>
    </div>
  );
}
