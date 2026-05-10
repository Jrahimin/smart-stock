const navigationItems = ["Dashboard", "Stocks", "Signals", "Pipelines", "AI Insights"];

export function DashboardSidebar() {
  return (
    <aside className="dashboard-sidebar">
      <div>
        <p className="brand-eyebrow">Smart Stock</p>
        <h1>Market Intelligence</h1>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigationItems.map((item) => (
          <a href="#" key={item}>
            {item}
          </a>
        ))}
      </nav>
    </aside>
  );
}

