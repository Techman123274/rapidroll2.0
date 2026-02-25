import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../ui/Card';

const slugify = (value) => value.toLowerCase().replace(/\s+/g, '-');

function GameCard({ title, image, tag = 'Popular', disabled = false, minimal = false }) {
  const localFallback = useMemo(() => `/games/${slugify(title)}.svg`, [title]);
  const [resolvedImage, setResolvedImage] = useState(image || localFallback);

  useEffect(() => {
    setResolvedImage(image || localFallback);
  }, [image, localFallback]);

  const handleImageError = () => {
    setResolvedImage((prev) => {
      if (prev !== localFallback) return localFallback;
      return '';
    });
  };

  if (minimal) {
    return (
      <Card className={`game-card game-card-minimal ${disabled ? 'game-card-disabled' : ''}`}>
        {disabled ? (
          <>
            {resolvedImage ? (
              <img className="media-image game-media-large" src={resolvedImage} alt={title} loading="lazy" onError={handleImageError} />
            ) : (
              <div className="media-placeholder game-media-large">Game Image</div>
            )}
            <div className="game-title-row">
              <h3>{title}</h3>
              <span className="card-link card-link-disabled" aria-label={`${title} is disabled`}>
                Disabled
              </span>
            </div>
          </>
        ) : (
          <Link to={`/games/${slugify(title)}`} className="game-card-launch" aria-label={`Launch ${title}`}>
            {resolvedImage ? (
              <img className="media-image game-media-large" src={resolvedImage} alt={title} loading="lazy" onError={handleImageError} />
            ) : (
              <div className="media-placeholder game-media-large">Game Image</div>
            )}
            <div className="game-title-row">
              <h3>{title}</h3>
            </div>
          </Link>
        )}
      </Card>
    );
  }

  return (
    <Card className={`game-card ${disabled ? 'game-card-disabled' : ''}`}>
      {/* GAME MEDIA */}
      {resolvedImage ? (
        <img className="media-image" src={resolvedImage} alt={title} loading="lazy" onError={handleImageError} />
      ) : (
        <div className="media-placeholder">Game Image</div>
      )}

      {/* GAME CONTENT */}
      <div className="game-body">
        <div>
          <span className="card-tag">{tag}</span>
          <h3>{title}</h3>
        </div>
        {disabled ? (
          <span className="card-link card-link-disabled" aria-label={`${title} is disabled`}>
            Disabled
          </span>
        ) : (
          <Link to={`/games/${slugify(title)}`} className="card-link" aria-label={`Launch ${title}`}>
            Play
          </Link>
        )}
      </div>
    </Card>
  );
}

export default GameCard;
