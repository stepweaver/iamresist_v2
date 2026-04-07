// BooksSection: placeholder for upcoming book data
// Intends to display books from Notion bookclub database when available

export default async function BooksSection() {
  // TODO: Integrate with lib/bookclub/service.listBooks() when available
  // For now, show empty state placeholder
  return (
    <div className="space-y-6">
      <div className="machine-panel border border-border p-8 text-center">
        <p className="font-ui text-xl sm:text-2xl text-primary font-bold mb-4">
          [ No Books Yet ]
        </p>
        <p className="prose-copy text-foreground/60 max-w-md mx-auto">
          Books will appear here once you add them to your Notion database.
        </p>
      </div>
    </div>
  );
}
