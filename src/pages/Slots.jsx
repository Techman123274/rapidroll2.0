import CategoryGameBrowser from '../features/lobby/components/CategoryGameBrowser';

function Slots() {
  return (
    <CategoryGameBrowser
      title="Slots"
      subtitle="Browse slot games with Play’n GO provider labels and image thumbnails."
      category="slots"
      showProviderFilter
      defaultSort="provider"
    />
  );
}

export default Slots;
