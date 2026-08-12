import { profile } from '../data/content';
import './Hero.css';

export default function Hero() {
  return (
    <section id="source" className="hero">
      <div className="hero-inner">
        <div className="hero-eyebrow mono">
          <span className="hero-dot" aria-hidden="true" />
          git commit -m "initial commit"
        </div>
        <h1 className="hero-name">{profile.name}</h1>
        <p className="hero-role mono">{profile.role} · {profile.location}</p>
        <p className="hero-tagline">{profile.tagline}</p>
        <div className="hero-links">
          <a className="button primary" href={profile.links.github} target="_blank" rel="noreferrer">
            View GitHub
          </a>
          <a className="button ghost" href={`mailto:${profile.links.email}`}>
            Get in touch
          </a>
        </div>
      </div>
    </section>
  );
}