function GameSurfaceLayout({ header, main, aside, footer, className = '' }) {
  return (
    <section className={`game-surface-layout ${className}`.trim()}>
      {header ? <header className="game-surface-header">{header}</header> : null}
      <div className="game-surface-body">
        <div className="game-surface-main">{main}</div>
        {aside ? <aside className="game-surface-aside">{aside}</aside> : null}
      </div>
      {footer ? <footer className="game-surface-footer">{footer}</footer> : null}
    </section>
  );
}

export default GameSurfaceLayout;
