import { ProjectWorkItem } from "./ProjectWorkItem";

export interface ParentProjectWorkItem {
    id: number;
    name: string;
    childWorkItems: Array<ProjectWorkItem>;
}