import Image from "next/image";

const navigationItems = ["Dashboard", "Stocks", "Signals", "Pipelines", "AI Insights"];

export function DashboardSidebar() {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-brand">
        <Image
          alt="Stock Intelligence"
          height={56}
          priority
          src="/stock-icon-wide.png"
          width={224}
        />
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

