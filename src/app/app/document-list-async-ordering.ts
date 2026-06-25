export function nextDocumentListRequestSeq(current: number) {
  return current + 1;
}

export function isCurrentDocumentListRequest(current: number, request: number) {
  return current === request;
}

export function recordDocumentTrashOperation(
  latestByDocument: Map<string, number>,
  documentId: string,
  currentSeq: number,
) {
  const nextSeq = currentSeq + 1;
  latestByDocument.set(documentId, nextSeq);
  return nextSeq;
}

export function isCurrentDocumentTrashOperation(
  latestByDocument: Map<string, number>,
  documentId: string,
  operationSeq: number,
) {
  return latestByDocument.get(documentId) === operationSeq;
}
