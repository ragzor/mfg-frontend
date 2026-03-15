import { api } from './client';

export function getCostingReport(projectId) {
  return api.get(`/reports/costing?project_id=${projectId}`);
}

export function getReportProjects() {
  return api.get('/reports/projects');
}
