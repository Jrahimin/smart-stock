import Image from "next/image";

export function DashboardTopbar() {
  return (
    <header className="dashboard-topbar">
      <Image
        alt="StockWealth BD"
        className="dashboard-topbar-logo"
        height={30}
        priority
        src="/dashboard/stockwealth-lockup.webp"
        width={160}
      />
      <div>
        <p className="page-eyebrow">Bangladesh Market</p>
        <h2>Decision-support dashboard</h2>
      </div>
      <div className="topbar-status">Static scaffold data</div>
    </header>
  );
}

