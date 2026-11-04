import Image from "next/image";

const navigationItems = ["Dashboard", "Stocks", "Signals", "Pipelines", "AI Insights"];

export function DashboardSidebar() {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-brand">
        <Image
          alt="StockWealth BD"
          height={42}
          priority
          src="/dashboard/stockwealth-lockup.webp"
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

