import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Sidebar from './components/layout/Sidebar';
import MobileDock from './components/layout/MobileDock';
import SiteNotifications from './components/layout/SiteNotifications';
import AppRoutes from './routes';
import { useSound } from './context/SoundContext';

function App() {
  const { unlockAudio } = useSound();

  return (
    <div className="app-shell" onPointerDown={unlockAudio}>
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
      <MobileDock />
    </div>
  );
}

export default App;
