import './Section.css';

export default function Section({ id, stageNumber, stageName, title, children }) {
  return (
    <section id={id} className="stage-section">
      <div className="stage-meta">
        <span className="stage-number mono">{stageNumber}</span>
        <span className="stage-name mono">{stageName}</span>
      </div>
      {title && <h2 className="stage-title">{title}</h2>}
      <div className="stage-content">{children}</div>
    </section>
  );
}