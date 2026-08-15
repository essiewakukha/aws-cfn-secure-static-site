import { useEffect, useState } from 'react';
import { pipelineStages } from '../data/content';
import './PipelineRail.css';

export default function PipelineRail() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const sections = pipelineStages
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = pipelineStages.indexOf(entry.target.id);
            if (idx !== -1) setActiveIndex(idx);
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="rail" aria-label="Page sections as pipeline stages">
      <div className="rail-line" aria-hidden="true">
        <div
          className="rail-line-fill"
          style={{
            height: `${(activeIndex / (pipelineStages.length - 1)) * 100}%`,
          }}
        />
      </div>
      <ul className="rail-nodes">
        {pipelineStages.map((stage, i) => (
          <li key={stage}>
            <a
              href={`#${stage}`}
              className={`rail-node ${i <= activeIndex ? 'is-active' : ''} ${
                i === activeIndex ? 'is-current' : ''
              }`}
            >
              <span className="rail-dot" aria-hidden="true" />
              <span className="rail-label">{stage}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}