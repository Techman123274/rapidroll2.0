import CategoryGameBrowser from '../features/lobby/components/CategoryGameBrowser';

function Originals() {
  return (
    <CategoryGameBrowser
      title="Originals"
      subtitle="RapidRoll in-house originals, optimized for fast and mobile play."
      category="originals"
      showProviderFilter={false}
      defaultSort="featured"
    />
  );
}

export default Originals;
