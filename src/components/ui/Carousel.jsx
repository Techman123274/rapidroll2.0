import { useRef } from 'react';
import Button from './Button';

function Carousel({ title, children }) {
  const rowRef = useRef(null);

  const scroll = (dir) => {
    if (!rowRef.current) return;
    rowRef.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <section className="carousel-section" aria-label={title}>
      {/* CAROUSEL HEADER */}
      <div className="carousel-head">
        <h2 className="section-title">{title}</h2>
        <div className="carousel-controls">
          <Button variant="outline" onClick={() => scroll(-1)} aria-label="Scroll left">
            ←
          </Button>
          <Button variant="outline" onClick={() => scroll(1)} aria-label="Scroll right">
            →
          </Button>
        </div>
      </div>

      {/* CAROUSEL TRACK */}
      <div className="carousel-track" ref={rowRef}>
        {children}
      </div>
    </section>
  );
}

export default Carousel;
