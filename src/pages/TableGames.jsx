import CategoryGameBrowser from '../features/lobby/components/CategoryGameBrowser';

function TableGames() {
  return (
    <CategoryGameBrowser
      title="Table Games"
      subtitle="Blackjack, poker, roulette, and future classic table experiences."
      category="table-games"
      showProviderFilter={false}
      defaultSort="featured"
    />
  );
}

export default TableGames;
