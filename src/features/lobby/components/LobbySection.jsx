import LobbyGameCard from './LobbyGameCard';

function LobbySection({ title, subtitle, games, isDisabled, favoriteSet, onFavorite, onPlay }) {
  if (!games.length) return null;

  return (
    <section className="lobby-section" id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <header className="lobby-section-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>

      <div className="lobby-grid" role="list">
        {games.map((game) => (
          <LobbyGameCard
            key={game.id}
            game={game}
            disabled={isDisabled(game)}
            isFavorite={favoriteSet.has(game.slug)}
            onFavorite={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFavorite(game.slug);
            }}
            onPlay={() => onPlay(game.slug)}
          />
        ))}
      </div>
    </section>
  );
}

export default LobbySection;
