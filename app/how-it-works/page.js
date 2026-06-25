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
        <h1>Pay for AI work. Spare GPUs do it. Everyone wins.</h1>
        <p className="lead">
          NodeQuest is a marketplace for AI compute. If you need an AI task done,
          you post it with a reward. People with spare GPUs race to complete it,
          and the fastest, most reliable one gets paid in QST.
        </p>
      </section>

      <section className="fairness">
        <h3>The simple idea</h3>
        <p className="muted-line">
          Lots of powerful GPUs sit idle around the world. At the same time, lots
          of people need AI tasks run. NodeQuest connects the two: posters put up
          a reward, idle GPUs compete to earn it. No middleman taking a cut —
          payment goes straight from the poster to the GPU that did the work.
        </p>
      </section>

      <section className="timeline">
        <article className="timeline-item">
          <span className="timeline-node">1</span>
          <div>
            <h3>Post &amp; fund a bounty</h3>
            <p>
              You describe the task (for example, “summarize this text”), set a
              reward in QST, and deposit it from your wallet. That deposit is held
              safely until the job is done — so providers know the reward is real.
            </p>
          </div>
        </article>
        <article className="timeline-item">
          <span className="timeline-node">2</span>
          <div>
            <h3>GPUs compete</h3>
            <p>
              People running the NodeQuest agent on their GPUs see your job and
              race to finish it. Each one runs the task on a real AI model and
              submits its answer along with how long it took.
            </p>
          </div>
        </article>
        <article className="timeline-item">
          <span className="timeline-node">3</span>
          <div>
            <h3>The network checks the work</h3>
            <p>
              Empty or broken answers are thrown out. When several providers agree
              on the same answer, that result is trusted even more. A fair lottery
              then picks the winner — faster and more reliable providers get better
              odds, but newcomers can still win.
            </p>
          </div>
        </article>
        <article className="timeline-item">
          <span className="timeline-node">4</span>
          <div>
            <h3>Winner gets paid, 20% is burned</h3>
            <p>
              The reward is split automatically on the blockchain: the winner
              receives 80%, and 20% is permanently destroyed (“burned”). You get
              your result, the provider gets paid, and the token supply shrinks.
            </p>
          </div>
        </article>
      </section>

      <section className="fairness">
        <h3>For posters &amp; for providers</h3>
        <p className="muted-line">Two sides, one simple deal:</p>
        <ul className="bullet-list">
          <li>
            <strong>Posters</strong> — connect a wallet, post a task, deposit the
            reward, and get your answer back when it’s done.
          </li>
          <li>
            <strong>Providers</strong> — install Ollama, run the NodeQuest agent on
            your GPU, and earn QST every time you win a job. It runs automatically.
          </li>
        </ul>
      </section>

      <section className="fairness">
        <h3>Why it stays fair</h3>
        <p className="muted-line">
          Tiers keep the competition even, and they’re set by NodeQuest — never by
          users — so nobody can cheat the system:
        </p>
        <ul className="bullet-list">
          <li>Every GPU is sorted into a tier (Light, Standard, Heavy) by its model.</li>
          <li>Every job is sorted into a tier by what it actually requires.</li>
          <li>A job only competes among GPUs in its own tier — small rigs aren’t crushed by big ones.</li>
          <li>Reliable providers build reputation, which improves their odds over time.</li>
        </ul>
      </section>

      <section className="fairness">
        <h3>Deflationary by design</h3>
        <p className="muted-line">
          Every settled bounty permanently burns <strong>20% of the reward</strong>,
          removing those QST from circulation forever. The more the network is
          used, the more QST is destroyed — usage itself makes the token scarcer.
        </p>
        <ul className="bullet-list">
          <li>Winner receives 80% of the bounty reward.</li>
          <li>20% is burned on-chain, reducing total supply.</li>
          <li>No platform fee — every bounty either pays a provider or burns.</li>
          <li>Total burned to date is tracked live on the dashboard.</li>
        </ul>
      </section>
    </main>
  );
}
