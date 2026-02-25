import { Link } from 'react-router-dom';

function CategoryHubCard({ section }) {
  return (
    <article className="category-hub-card">
      <header>
        <h3>{section.title}</h3>
        <span>{section.count} games</span>
      </header>
      <p>{section.description}</p>

      <div className="category-hub-previews">
        {section.previews.map((game) => (
          <img
            key={game.id}
            src={game.imageUrl || `/games/${game.slug}.svg`}
            alt={game.name}
            loading="lazy"
            onError={(event) => {
              if (event.currentTarget.src.includes(`/games/${game.slug}.svg`)) return;
              event.currentTarget.src = `/games/${game.slug}.svg`;
            }}
          />
        ))}
      </div>

      <Link to={section.route} className="category-hub-cta">
        Open {section.title}
      </Link>
    </article>
  );
}

export default CategoryHubCard;
