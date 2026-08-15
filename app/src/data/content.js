export const profile = {
  name: 'Esther Wakukha',
  role: 'DevOps Engineer',
  tagline: 'I build infrastructure that ships itself — pipelines, not tickets.',
  location: 'Nairobi, Kenya',
  links: {
    github: 'https://github.com/essiewakukha',
    linkedin: 'https://www.linkedin.com/in/esther-wakukha-257886241/',
    email: 'esthermwakukha@gmail.com',
  },
};

export const skills = [
  { group: 'CI/CD', items: ['GitHub Actions', 'CodePipeline', 'CodeBuild', 'CodeDeploy'] },
  { group: 'IaC', items: ['CloudFormation', 'Terraform', 'AWS SAM'] },
  { group: 'Containers', items: ['Docker', 'ECS', 'EKS', 'Kubernetes'] },
  { group: 'Observability', items: ['CloudWatch', 'Prometheus', 'Grafana', 'X-Ray'] },
  { group: 'Security', items: ['IAM least-privilege', 'Trivy', 'AWS Config', 'Secrets Manager'] },
];

export const projects = [
  {
    status: 'deployed',
    name: 'This site',
    stack: 'React · CloudFormation · CloudFront · GitHub Actions',
    description:
      'A React SPA on a private S3 origin behind CloudFront (OAC-secured), deployed by a GitHub Actions pipeline defined entirely in this repo.',
    repo: 'https://github.com/essiewakukha/react-portfolio-cfn-cicd',
  },
  {
    status: 'deployed',
    name: 'Multi-account CI/CD pipeline',
    stack: 'CodePipeline · CodeBuild · CodeDeploy · ECS Fargate',
    description:
      'Blue/green deployment pipeline promoting a containerized app across dev and prod AWS accounts, with automated rollback on CloudWatch alarm.',
    repo: 'https://github.com/essiewakukha/aws-cicd-blue-green-pipeline',
  },
  {
    status: 'building',
    name: 'EKS GitOps platform',
    stack: 'EKS · Helm · ArgoCD · Istio',
    description:
      'Microservices platform on EKS with GitOps-driven deployments, autoscaling, and service mesh traffic management.',
    repo: null,
  },
];

export const pipelineStages = ['source', 'build', 'test', 'deploy', 'monitor'];