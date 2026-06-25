import Image from "next/image";
import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <main className="site-wrap">
      <header className="topbar">
        <Link href="/" className="brand-link">
          <Image src="/logo.png" alt="NodeQuest" width={34} height={34} className="brand-image" />
          <span>NodeQuest</span>
        </Link>
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/bounty-compute" className="nav-cta">Launch app</Link>
        </nav>
      </header>

      <section className="how-hero">
        <p className="eyebrow">How NodeQuest works</p>
        <h1>End-to-end bounty flow</h1>
        <p className="lead">
          Buyers post workloads, providers compete, the network verifies outputs, and
          settlements are paid in QST.
        </p>
      </section>

      <section className="timeline">
        <article className="timeline-item">
          <span className="timeline-node">1</span>
          <div>
            <h3>Post a bounty</h3>
            <p>Choose workload and lock QST reward. Tier is assigned by platform rules.</p>
          </div>
        </article>
        <article className="timeline-item">
          <span className="timeline-node">2</span>
          <div>
            <h3>Providers compete</h3>
            <p>Only matching-tier GPUs can enter. Providers submit output plus result hash.</p>
          </div>
        </article>
        <article className="timeline-item">
          <span className="timeline-node">3</span>
          <div>
            <h3>Verify and settle</h3>
            <p>
              Consensus filters invalid results and a winner is selected. The
              reward is split on-chain: the winner is paid, 20% is burned, and a
              small fee supports the platform.
            </p>
          </div>
        </article>
      </section>

      <section className="fairness">
        <h3>Deflationary by design</h3>
        <p className="muted-line">
          Every settled bounty permanently burns <strong>20% of the reward</strong>,
          removing those QST from circulation forever. As real compute flows
          through the network, supply shrinks — usage itself makes QST scarcer.
        </p>
        <ul className="bullet-list">
          <li>Winner receives 77% of the bounty reward.</li>
          <li>20% is burned on-chain, reducing total supply.</li>
          <li>3% platform fee sustains the network.</li>
          <li>Total burned to date is tracked live on the dashboard.</li>
        </ul>
      </section>

      <section className="fairness">
        <h3>Fairness model</h3>
        <p className="muted-line">
          Both sides are classified by the platform (not by users):
        </p>
        <ul className="bullet-list">
          <li>GPU tier comes from model/VRAM catalog maintained by NodeQuest.</li>
          <li>Job tier comes from workload catalog maintained by NodeQuest.</li>
          <li>No self-claiming tiers, reducing gaming and mismatch failures.</li>
        </ul>
      </section>
    </main>
  );
}
