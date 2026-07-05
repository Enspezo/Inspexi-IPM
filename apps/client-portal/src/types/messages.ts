import type { UserRef } from './common';

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export interface InspectionMessage {
  id: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  clientUser: UserRef | null;
  user: UserRef | null;
  attachments: MessageAttachment[];
}
