import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Sidebar from './components/layout/Sidebar';
import SiteNotifications from './components/layout/SiteNotifications';
import AppRoutes from './routes';

function App() {
  return (
    <div className="app-shell">
      {/* HEADER */}
      <Header />
      <SiteNotifications />

      {/* MAIN LAYOUT */}
      <div className="layout container">
        <Sidebar />
        <main className="page-content" aria-live="polite">
          <AppRoutes />
        </main>
      </div>

      {/* FOOTER */}
      <Footer />
    </div>
  );
}

export default App;
