import { Link } from 'react-router-dom';

function RecentlyPlayedRow({ games }) {
  if (!games.length) return null;

  return (
    <section className="lobby-recent">
      <header className="lobby-section-head">
        <div>
          <h2>Recently Played</h2>
          <p>Jump back into your recent games.</p>
        </div>
      </header>

      <div className="lobby-recent-strip" role="list">
        {games.map((game) => (
          <Link key={game.id} to={game.route} className="lobby-recent-pill">
            <img src={game.imageUrl || `/games/${game.slug}.svg`} alt={game.name} loading="lazy" />
            <span>{game.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default RecentlyPlayedRow;
