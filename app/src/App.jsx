import './App.css';
import PipelineRail from './components/PipelineRail';
import Hero from './components/Hero';
import Section from './components/Section';
import ProjectCard from './components/ProjectCard';
import DeployStatus from './components/DeployStatus';
import { skills, projects } from './data/content';

export default function App() {
  return (
    <>
      <PipelineRail />

      <Hero />

      <Section id="build" stageNumber="02" stageName="Build" title="Skills">
        <div className="skills-grid">
          {skills.map((group) => (
            <div className="skills-group" key={group.group}>
              <h4 className="skills-group-title mono">{group.group}</h4>
              <ul className="skills-list">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="test" stageNumber="03" stageName="Test" title="What I've verified in production">
        <p className="stage-lead">
          Every project below runs — deployed to real AWS accounts, not just described in a README.
          Each includes the failure scenario I tested and how the system responded.
        </p>
      </Section>

      <Section id="deploy" stageNumber="04" stageName="Deploy" title="Projects">
        {projects.map((project) => (
          <ProjectCard key={project.name} project={project} />
        ))}
      </Section>

      <DeployStatus />
    </>
  );
}