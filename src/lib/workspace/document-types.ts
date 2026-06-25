export type WorkspaceDocument = {
  id: string;
  title: string;
  updatedAt: Date;
};

export type WorkspaceDocumentsResult = {
  documents: WorkspaceDocument[];
  hasMore: boolean;
};
