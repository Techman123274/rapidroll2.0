import Card from '../components/ui/Card';

function InfoPage({ title, text }) {
  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>{title}</h1>
      </header>

      {/* PAGE CONTENT */}
      <Card>
        <p>{text}</p>
      </Card>
    </section>
  );
}

export default InfoPage;
