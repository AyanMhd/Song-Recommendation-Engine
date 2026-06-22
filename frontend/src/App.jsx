import { useEffect, useRef, useState } from "react";
export default function App() {
  const mountRef = useRef(null);
  const experienceRef = useRef(null);
  const [activeBodyName, setActiveBodyName] = useState("Earth");
  const activeBody = BODIES.find((body) => body.name === activeBodyName) || BODIES[0];

  useEffect(() => {
    if (!mountRef.current) {
      return undefined;
    }

    experienceRef.current = createSolarSystemExperience({
      mountNode: mountRef.current,
      initialBodyName: activeBodyName,
      onBodySelect: setActiveBodyName,
    });

    return () => {
      experienceRef.current?.destroy();
      experienceRef.current = null;
    };
  }, []);

  useEffect(() => {
    experienceRef.current?.focusBody(activeBodyName);
  }, [activeBodyName]);

  return (
    <main className="experience-shell">
      <div className="scene-host" ref={mountRef} />
      <div className="space-vignette" />
      <div className="space-glow" />

      <section className="hud hero-panel">
        <p className="eyebrow">Interactive 3D Observatory</p>
        <h1>Solar System</h1>
        <p className="hero-copy">
          Orbit around the planets, zoom deep into the scene, and sweep through a richly lit star field from
          any angle.
        </p>
      </section>

      <aside className="hud detail-panel" style={{ "--accent": activeBody.accent }}>
        <div className="detail-topline">
          <span>{activeBody.kind}</span>
          <strong>{activeBody.name}</strong>
        </div>
        <p className="detail-copy">{activeBody.description}</p>

        <div className="fact-grid">
          {activeBody.facts.map(([label, value]) => (
            <article className="fact-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </aside>

      <div className="hud instruction-pill">Drag to orbit. Scroll or pinch to zoom. Click a planet or use the selector.</div>

      <section className="hud planet-dock">
        <div className="dock-copy">
          <p className="dock-title">Focus Worlds</p>
          <p className="dock-text">Each selection moves the camera into a new corner of our planetary neighborhood.</p>
        </div>

        <div className="planet-rail">
          {BODIES.map((body) => (
            <button
              className={`planet-pill ${body.name === activeBodyName ? "is-active" : ""}`}
              key={body.name}
              onClick={() => setActiveBodyName(body.name)}
              style={{ "--accent": body.accent }}
              type="button"
            >
              <span className="planet-dot" />
              {body.name}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
