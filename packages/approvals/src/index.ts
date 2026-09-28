export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited';
export type ApprovalRequest = { id: string; action: string; summary: string; payload: unknown; status: ApprovalStatus; createdAt: string };
