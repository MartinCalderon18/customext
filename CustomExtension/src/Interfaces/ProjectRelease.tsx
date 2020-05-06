import { ProjectDeployment } from "./ProjectDeployment";

export interface ProjectRelease {
    id: number;
    name: string;
    definitionId: number;
    releaseDate: Date
    deployments: Array<ProjectDeployment>;
}