import Button from '../components/ui/Button';

function NotFound() {
  return (
    <section className="page-section">
      {/* NOT FOUND */}
      <header className="page-header">
        <h1>Page Not Found</h1>
        <p>The route does not exist. Use the button below to return home.</p>
      </header>
      <Button as="link" to="/">
        Go Home
      </Button>
    </section>
  );
}

export default NotFound;
