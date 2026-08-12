import { profile } from '../data/content';
import './DeployStatus.css';

// Vite injects these at build time. In CI, set VITE_COMMIT_SHA and
// VITE_DEPLOY_TIME as env vars before `npm run build` (see GitHub Actions
// workflow) so this footer reflects the actual deployed build, not a
// hardcoded value.
const commitSha = import.meta.env.VITE_COMMIT_SHA || 'local-dev';
const deployTime = import.meta.env.VITE_DEPLOY_TIME || new Date().toISOString();

export default function DeployStatus() {
  return (
    <footer id="monitor" className="deploy-status">
      <div className="deploy-status-inner">
        <div className="deploy-line mono">
          <span className="deploy-status-dot" aria-hidden="true" />
          <span>status: operational</span>
          <span className="deploy-sep">·</span>
          <span>commit {commitSha.slice(0, 7)}</span>
          <span className="deploy-sep">·</span>
          <span>deployed {new Date(deployTime).toISOString().replace('T', ' ').slice(0, 16)} UTC</span>
        </div>
        <div className="deploy-links mono">
          <a href={profile.links.github} target="_blank" rel="noreferrer">github</a>
          <a href={profile.links.linkedin} target="_blank" rel="noreferrer">linkedin</a>
          <a href={`mailto:${profile.links.email}`}>email</a>
        </div>
      </div>
    </footer>
  );
}