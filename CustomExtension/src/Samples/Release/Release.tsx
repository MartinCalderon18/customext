import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";

import "./Release.scss";

import { Page } from "azure-devops-ui/Page";

import { CommonServiceIds, getClient, IProjectPageService } from "azure-devops-extension-api";
import { ReleaseRestClient } from "azure-devops-extension-api/Release";
import { Modal, Button, ListGroup, Card } from "react-bootstrap";
import { showRootComponent } from "../../Common";
import { WorkItemTrackingRestClient, WorkItemExpand } from "azure-devops-extension-api/WorkItemTracking";
import { ObservableArray, ObservableValue } from "azure-devops-ui/Core/Observable";
import { ProjectDefinition } from "../../Interfaces/ProjectDefinition";
import { ProjectRelease } from "../../Interfaces/ProjectRelease";
import { ProjectDeployment } from "../../Interfaces/ProjectDeployment";
import { ParentProjectWorkItem } from "../../Interfaces/ParentProjectWorkItem";
import { ProjectWorkItem } from "../../Interfaces/ProjectWorkItem";
import * as Stages from "../../Constants/Stages";

class ReleaseContent extends React.Component<{}, {}> {

    private definitionsArray: Array<ProjectDefinition> = [];
    releasesArray: Array<ProjectRelease> = [];
    deploymentsArray: Array<ProjectDeployment> = [];
    workItemsArray = new ObservableArray<ParentProjectWorkItem>([]);
    showPopup: boolean = false;
    isLoading = new ObservableValue(false);


    statusEnum = Stages.statusEnum;

    private readonly errorrMessage = "Something went wrong. Please contact you Admin for more information";

    constructor(props: {}) {
        super(props);
        this.state = { workItemsState: new Array<ProjectWorkItem>(), defState: new Array<ProjectDefinition>(), relState: new Array<ProjectRelease>(), show: false }
    }
    //Method to show modal
    showModal = (releaseId: number, deploymentId: number) => {
        this.isLoading.value = true;
        this.workItemsArray.value = [];
        this.setState({ show: true });
        this.showPopup = true;

        this.bindWorkItemsData(releaseId);
    };
    //Method to bind the work items
    private async bindWorkItemsData(releaseId: number): Promise<void> {
        try {
            const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
            const project = await projectService.getProject();

            if (!project) {
                this.showErrorMessage();
            }
            else {
                const client = getClient(ReleaseRestClient);
                var workItems = await client.getReleaseWorkItemsRefs(project.name, releaseId);
                let workItemsIds: Array<number> = [];
                for (var i = 0; i < workItems.length; i++) {
                    workItemsIds.push(Number(workItems[i].id));
                }
                if (workItemsIds.length > 0) {

                    var buildClient = getClient(WorkItemTrackingRestClient);
                    var workItemsData = await buildClient.getWorkItems(workItemsIds, project.name, undefined, undefined, WorkItemExpand.Relations);
                    this.isLoading.value = false;
                    for (var i = 0; i < workItemsData.length; i++) {
                        let newItem: ProjectWorkItem = {
                            id: workItemsData[i].id,
                            name: (workItemsData[i].id + " - " + workItemsData[i].fields["System.Title"])
                        };

                        //Parent
                        let relations = workItemsData[i].relations;
                        if (relations.length > 0) {
                            let isParentFound = false;
                            for (var j = 0; j < relations.length; j++) {
                                if (relations[j].attributes["name"] === "Parent") {
                                    isParentFound = true;
                                    var parentWorkItemUrl = relations[j].url;
                                    var dataStrings = parentWorkItemUrl.split("/");
                                    var parentId = Number(dataStrings[dataStrings.length - 1]);
                                    let parentWorkItem = await buildClient.getWorkItem(parentId, project.name);
                                    if (this.workItemsArray.value.some(m => m.id === parentId)) {
                                        for (var k = 0; k < this.workItemsArray.value.length; k++) {
                                            if (this.workItemsArray.value[k].id === parentId) {
                                                this.workItemsArray.value[k].childWorkItems.push(newItem);
                                                break;
                                            }
                                        }
                                    } else {
                                        let childWorkItems: Array<ProjectWorkItem> = [];
                                        childWorkItems.push(newItem);
                                        let parentData = { id: parentWorkItem.id, name: parentWorkItem.id + " - " + parentWorkItem.fields["System.Title"], childWorkItems: childWorkItems }
                                        this.workItemsArray.push(parentData);
                                    }
                                    break;
                                }
                            }
                            if (!isParentFound) {
                                let childWorkItems: Array<ProjectWorkItem> = [];
                                childWorkItems.push(newItem);
                                let parentData = { id: 0, name: "", childWorkItems: childWorkItems }
                                this.workItemsArray.push(parentData);
                            }
                        }
                        else {
                            let childWorkItems: Array<ProjectWorkItem> = [];
                            childWorkItems.push(newItem);
                            let parentData = { id: 0, name: "", childWorkItems: childWorkItems };
                            this.workItemsArray.push(parentData);
                        }
                    }
                    this.setState({ workItemsState: this.workItemsArray });

                } else {
                    // delay
                    const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
                    const project = await projectService.getProject();
                    let releaseNames: string[];

                    if (!project) {
                        releaseNames = ["Issue"];
                    }
                    else {
                        this.isLoading.value = false;
                        const client = getClient(ReleaseRestClient);
                        //Definitions
                        var releaseDefinitions = await client.getReleaseDefinitions(project.name);
                        let newItem: ParentProjectWorkItem = { id: -1, name: "No work items", childWorkItems: [] };
                        this.workItemsArray.push(newItem);
                        this.setState({ releaseDefinition: releaseDefinitions });
                    }
                }
            }
        }
        catch{
            this.showErrorMessage();
        }
    };

    //Method to get the status name
    private getStatus(id: number) {
        for (var i = 0; i < this.statusEnum.length; i++) {
            if (this.statusEnum[i].id === id) {
                return this.statusEnum[i];
            }
        }
    }

    //Method to convert the date
    private getDateFormat(myDate: Date) {
        var dateObj = new Date(myDate);
        var month = dateObj.getUTCMonth() + 1;
        var day = dateObj.getUTCDate();
        var year = dateObj.getUTCFullYear();

        return (month + "/" + day + "/" + year);
    }

    //Method to hide modal
    hideModal = () => {
        this.setState({ show: false });
        this.showPopup = false;
    };

    public componentDidMount() {
        SDK.init();
        this.loadReleases();
    }

    public render(): JSX.Element {

        return (
            <Page className="sample-hub flex-grow">
                <Card>
                    <Card.Body>
                        <Card.Title>Release details</Card.Title>
                        <Card.Text>
                            {this.statusEnum.map(stat => {
                                return <span><span className="dot" style={{ backgroundColor: stat.color }}></span>{stat.text} {' '}</span>
                            })}
                        </Card.Text>
                    </Card.Body>
                    <Card.Body>
                        {this.definitionsArray.map(def => {
                            return (
                                <ListGroup>
                                    <ListGroup.Item action variant="primary">{def.name}</ListGroup.Item>
                                    {this.releasesArray.filter(m => m.definitionId === def.id).map(rel => {
                                        return (
                                            <ListGroup.Item action variant="light">
                                                <div className="row">
                                                    <div className="col-md-3">
                                                        {rel.name}
                                                    </div>
                                                    <div className="col-md-4">
                                                        {rel.releaseDate ? this.getDateFormat(rel.releaseDate) : ""}
                                                    </div>
                                                    <div className="col-md-5">
                                                        <div aria-label="Basic example" role="group" className="">
                                                            {rel.deployments.map(dep => {
                                                                return (<button type="button" onClick={this.showModal.bind(null, rel.id, dep.id)} className={`btn btn-sm ${dep.btn}`}>{dep.name}</button>)
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </ListGroup.Item>
                                        )
                                    })}
                                </ListGroup>
                            )
                        })}
                        <Modal show={this.showPopup} onHide={this.hideModal}>
                            <Modal.Header closeButton>
                                <Modal.Title>Work Items</Modal.Title>
                            </Modal.Header>
                            <Modal.Body className="workItems">
                                {
                                    this.isLoading.value === true ?
                                        <ListGroup><ListGroup.Item>Loading data...</ListGroup.Item></ListGroup>
                                        :
                                        this.workItemsArray.value.map(work => {
                                            return (
                                                <div className="row">
                                                    {
                                                        work.id === -1
                                                            ? <ListGroup><ListGroup.Item>No work items</ListGroup.Item></ListGroup>
                                                            :
                                                            work.id === 0
                                                                ? <ListGroup>
                                                                    {
                                                                        work.childWorkItems.map(child => {
                                                                            return <ListGroup.Item action variant="secondary">{child.name}</ListGroup.Item>
                                                                        })
                                                                    }
                                                                </ListGroup>
                                                                : <ListGroup>
                                                                    <ListGroup.Item action variant="primary">{work.name}</ListGroup.Item>
                                                                    {
                                                                        work.childWorkItems.map(child => {
                                                                            return <ListGroup.Item action variant="light">{child.name}</ListGroup.Item>
                                                                        })
                                                                    }
                                                                </ListGroup>
                                                    }
                                                </div>
                                            )
                                        })
                                }
                            </Modal.Body>
                        </Modal>
                    </Card.Body>
                </Card>
            </Page>
        );
    }

    //Method to load relase details
    private async loadReleases(): Promise<void> {
        try {
            const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
            const project = await projectService.getProject();

            if (!project) {
                this.showErrorMessage();
            }
            else {
                const client = getClient(ReleaseRestClient);
                //Definitions
                var releaseDefinitions = await client.getReleaseDefinitions(project.name);
                for (var i = 0; i < releaseDefinitions.length; i++) {
                    let newItem: ProjectDefinition = { id: releaseDefinitions[i].id, name: releaseDefinitions[i].name };
                    this.definitionsArray.push(newItem);

                    let deployments = await client.getDeployments(project.name, releaseDefinitions[i].id);
                    for (var j = 0; j < deployments.length; j++) {
                        var status = this.getStatus(deployments[j].deploymentStatus);
                        if (!this.releasesArray.some(m => m.id === deployments[j].release.id)) {
                            let newDeployment: ProjectDeployment = { id: deployments[j].releaseEnvironment.id, name: deployments[j].releaseEnvironment.name, isShow: false, btn: status ? status.btn : "btn-lignt" }
                            let newItem: ProjectRelease = { id: deployments[j].release.id, name: deployments[j].release.name, definitionId: deployments[j].releaseDefinition.id, deployments: [], releaseDate: deployments[j].completedOn };
                            newItem.deployments.push(newDeployment);
                            this.releasesArray.push(newItem);
                        } else {
                            let newDeployment: ProjectDeployment = { id: deployments[j].releaseEnvironment.id, name: deployments[j].releaseEnvironment.name, isShow: false, btn: status ? status.btn : "btn-lignt" }
                            this.releasesArray.filter(m => m.id === deployments[j].release.id).forEach(item => {
                                item.deployments.push(newDeployment);
                            });
                        }
                    }
                }

                this.setState({ defState: this.definitionsArray, relState: this.releasesArray })
            }
        } catch {

        }
    }
    //Method to show error message in console
    private showErrorMessage() {
        console.log(this.errorrMessage);
    }
}

showRootComponent(<ReleaseContent />);