import GameCard from '../components/game/GameCard';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { gameList, isImplementedGame, slugify } from '../data/gameCatalog';

function Games() {
  const { games: managedGames, isSiteOnline } = useAdmin();
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'owner';

  const getDisabledState = (title) => {
    if (!isSiteOnline) return true;
    if (!isImplementedGame(title)) return true;
    const gameState = managedGames.find((game) => game.slug === slugify(title));
    return gameState ? !gameState.enabled : false;
  };

  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>Games</h1>
        <p>
          Browse all available game categories and featured titles.
          {!isSiteOnline ? ' Site is currently in maintenance mode.' : ''}
        </p>
        {isStaff && (
          <div className="page-header-actions">
            <Button as="link" to="/admin" variant="outline">
              Open Admin Panel
            </Button>
          </div>
        )}
      </header>

      {/* GAME GRID */}
      <div className="game-grid">
        {gameList.map((game) => (
          <GameCard
            key={game.title}
            title={game.title}
            image={game.image}
            tag={game.tag}
            disabled={getDisabledState(game.title)}
          />
        ))}
      </div>
    </section>
  );
}

export default Games;
