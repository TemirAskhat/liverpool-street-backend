import LiveMeshSection from "./components/LiveMeshSection";

export default function HomePage() {
  return (
    <main className="home">
      <header className="hero">
        <div className="hero-copy">
          <span className="hero-tag">AI skin analyzer (prototype)</span>
          <h1>Eurasian Hub AI Skin Analyzer</h1>
          <p>
            Step into a dermatologist-level experience powered by our vision AI. Let the system map your skin texture,
            hydration cues, and tone in seconds&mdash;all locally in your browser&mdash;then preview the tailored care
            playbook we&apos;re crafting to transform your regimen.
          </p>
          <div className="hero-actions">
            <a className="cta-button" href="#live-face-mesh">
              Scroll to live demo
            </a>
          </div>
        </div>
      </header>

      <LiveMeshSection />
    </main>
  );
}
