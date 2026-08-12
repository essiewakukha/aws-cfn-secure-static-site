import './ProjectCard.css';

const STATUS_LABEL = {
  deployed: 'deployed',
  building: 'in progress',
  failed: 'failed',
};

export default function ProjectCard({ project }) {
  const { name, stack, description, repo, status } = project;

  return (
    <article className="project-card">
      <div className="project-card-head">
        <h3 className="project-name">{name}</h3>
        <span className={`status-pill status-${status}`}>
          <span className="status-dot" aria-hidden="true" />
          {STATUS_LABEL[status] || status}
        </span>
      </div>
      <p className="project-stack mono">{stack}</p>
      <p className="project-description">{description}</p>
      {repo && (
        <a className="project-link mono" href={repo} target="_blank" rel="noreferrer">
          view repo →
        </a>
      )}
    </article>
  );
}