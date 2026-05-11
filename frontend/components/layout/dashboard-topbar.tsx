import Image from "next/image";

export function DashboardTopbar() {
  return (
    <header className="dashboard-topbar">
      <Image
        alt="Stock Intelligence"
        className="dashboard-topbar-logo"
        height={40}
        priority
        src="/stock-icon-wide.png"
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

