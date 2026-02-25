import { getHomeCategoryPreviews } from '../data/gameCatalog';
import CategoryHubCard from '../features/lobby/components/CategoryHubCard';

function Games() {
  const sections = getHomeCategoryPreviews();

  return (
    <section className="page-section lobby-page">
      <header className="page-header">
        <h1>Game Categories</h1>
        <p>Pick a category page for a cleaner browsing experience.</p>
      </header>

      <section className="category-hub-grid">
        {sections.map((section) => (
          <CategoryHubCard key={section.id} section={section} />
        ))}
      </section>
    </section>
  );
}

export default Games;
