export type CommunityStatus = "Active" | "Full" | "Paused" | "Privacy Risk" | "Pending Invite";

export type DispatchTaskStatus = "Pending" | "Sent" | "Failed";

export type Interest = "Hajj" | "Umrah" | "Both";

export interface Community {
  id: string;
  name: string;
  city: string;
  language: string;
  interest: Interest;
  proxyCapacity: number;
  currentCount: number;
  inviteLink: string;
  status: CommunityStatus;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  city: string;
  language: string;
  interest: Interest;
  consented: boolean;
  routedCommunityId: string | null;
  timestamp: string;
}

export interface DispatchTask {
  id: string;
  messageText: string;
  targetSegment: string;
  status: DispatchTaskStatus;
  communityId: string;
  createdAt: string;
}

export interface RejectedRoutingAttempt {
  id: string;
  name: string;
  phone: string;
  city: string;
  language: string;
  interest: Interest;
  reason: string;
  timestamp: string;
}

export interface RouteLeadInput {
  name: string;
  phone: string;
  city: string;
  language: string;
  interest: Interest;
  consented: boolean;
}

export interface RouteLeadResult {
  success: boolean;
  lead?: Lead;
  community?: Community;
  error?: string;
}

export interface CreateDispatchInput {
  messageText: string;
  targetSegment: string;
  segmentType: "city" | "language";
}

export interface CreateCommunityInput {
  city: string;
  language: string;
  interest: Interest;
}

export interface JoinClickEvent {
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  communityId: string;
  communityName: string;
  city: string;
  language: string;
  interest: Interest;
  inviteLink: string;
  isDemoPreview: boolean;
  timestamp: string;
}

export interface DataStore {
  communities: Community[];
  leads: Lead[];
  dispatchTasks: DispatchTask[];
  rejectedRoutingAttempts: RejectedRoutingAttempt[];
  joinClickLog: JoinClickEvent[];
  suppressedPhones: string[];
}
