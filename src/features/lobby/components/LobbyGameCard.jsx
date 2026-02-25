import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

function LobbyGameCard({ game, disabled, isFavorite, onFavorite, onPlay }) {
  const fallback = `/games/${game.slug}.svg`;
  const [imgSrc, setImgSrc] = useState(game.imageUrl || fallback);

  useEffect(() => {
    setImgSrc(game.imageUrl || fallback);
  }, [game.imageUrl, fallback]);

  return (
    <article className={`lobby-card ${disabled ? 'is-disabled' : ''}`}>
      <div className="lobby-card-media-wrap">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={game.name}
            loading="lazy"
            className="lobby-card-media"
            onError={() => setImgSrc((prev) => (prev !== fallback ? fallback : ''))}
          />
        ) : (
          <div className="lobby-card-media lobby-card-fallback">No Image</div>
        )}

        <div className="lobby-card-badges">
          <span className="lobby-badge provider">{game.provider}</span>
          {game.isNew ? <span className="lobby-badge new">NEW</span> : null}
          {game.isPopular ? <span className="lobby-badge popular">HOT</span> : null}
        </div>

        <button
          type="button"
          className={`lobby-favorite ${isFavorite ? 'is-active' : ''}`}
          aria-label={isFavorite ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`}
          onClick={onFavorite}
        >
          ★
        </button>
      </div>

      <div className="lobby-card-body">
        <h3>{game.name}</h3>
        <p>{game.provider}</p>

        {disabled ? (
          <span className="lobby-card-cta disabled">Unavailable</span>
        ) : (
          <Link to={game.route} className="lobby-card-cta" onClick={onPlay}>
            Play Now
          </Link>
        )}
      </div>
    </article>
  );
}

export default LobbyGameCard;
