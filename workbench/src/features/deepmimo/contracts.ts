export interface DeepMimoDatasetViewModel {
  readonly jobId: string;
  readonly scenarioName: string;
  readonly detail: string;
  readonly archiveName: string;
  readonly downloadUrl: string;
}

export interface DeepMimoDatasetTrayViewModel {
  readonly visible: boolean;
  readonly expanded: boolean;
  readonly datasets: readonly DeepMimoDatasetViewModel[];
}
