export type AgentProposal = {
  id: string;
  agent: string;
  action: string;
  reason: string;
  payload: unknown;
  requiresApproval: boolean;
};
