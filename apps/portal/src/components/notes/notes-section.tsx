import { getErrorMessage } from '@/lib/api-client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { Role, NoteEntityType } from '@/types';
import type { Note } from '@/types';
import { Spinner, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import {
  useEntityNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from '@/pages/notes/hooks/use-notes';

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'zojuist';
  if (diffMinutes < 60) return `${diffMinutes} minuten geleden`;
  if (diffHours < 24) return `${diffHours} uur geleden`;
  if (diffDays === 1) return 'gisteren';
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface NoteItemProps {
  note: Note;
  currentUserId: string;
  currentUserRoles: Role[];
  onReply?: (noteId: string) => void;
  onEdit: (note: Note) => void;
  onDelete: (noteId: string) => void;
  isReply?: boolean;
}

function NoteItem({
  note,
  currentUserId,
  currentUserRoles,
  onReply,
  onEdit,
  onDelete,
  isReply = false,
}: NoteItemProps) {
  const canEditOrDelete =
    note.createdById === currentUserId ||
    currentUserRoles.includes(Role.ORG_ADMIN) ||
    currentUserRoles.includes(Role.SUPERUSER);

  const initials =
    (note.createdBy.firstName?.[0] ?? '') + (note.createdBy.lastName?.[0] ?? '');

  if (note.isDeleted) {
    return (
      <div className={clsx('flex gap-3', isReply && 'ml-8 border-l-2 border-gray-200 pl-4')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-400">
          ?
        </div>
        <div className="flex-1 py-1">
          <p className="text-sm italic text-gray-400">Deze notitie is verwijderd</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex gap-3', isReply && 'ml-8 border-l-2 border-gray-200 pl-4')}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-white uppercase">
        {initials || '?'}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {note.createdBy.firstName} {note.createdBy.lastName}
            </span>
            <span className="text-xs text-gray-400">{formatRelativeTime(note.createdAt)}</span>
          </div>
          {canEditOrDelete && (
            <div className="flex shrink-0 gap-0.5">
              <button
                onClick={() => onEdit(note)}
                title="Bewerken"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => onDelete(note.id)}
                title="Verwijderen"
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{note.content}</p>
        {!isReply && onReply && (
          <button
            onClick={() => onReply(note.id)}
            className="mt-1 text-xs text-primary-600 hover:text-primary-800"
          >
            Beantwoorden
          </button>
        )}
      </div>
    </div>
  );
}

interface NotesSectionProps {
  entityType: NoteEntityType;
  entityId: string;
}

export function NotesSection({ entityType, entityId }: NotesSectionProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: notes = [], isLoading } = useEntityNotes(entityType, entityId);
  const createMutation = useCreateNote();
  const updateMutation = useUpdateNote();
  const deleteMutation = useDeleteNote();

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');

  const totalCount = notes.reduce(
    (acc, n) => acc + 1 + (n.replies?.filter((r) => !r.isDeleted).length ?? 0),
    0,
  );

  const handleCreateNote = async () => {
    if (!newContent.trim()) return;
    try {
      await createMutation.mutateAsync({ entityType, entityId, content: newContent.trim() });
      setNewContent('');
      setIsComposerOpen(false);
      showToast('Notitie toegevoegd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim()) return;
    try {
      await createMutation.mutateAsync({
        entityType,
        entityId,
        content: replyContent.trim(),
        parentId,
      });
      setReplyingTo(null);
      setReplyContent('');
      showToast('Antwoord geplaatst', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleStartEdit = (note: Note) => {
    setEditingNote(note);
    setEditContent(note.content);
  };

  const handleSaveEdit = async () => {
    if (!editingNote || !editContent.trim()) return;
    try {
      await updateMutation.mutateAsync({ id: editingNote.id, content: editContent.trim() });
      setEditingNote(null);
      setEditContent('');
      showToast('Notitie bijgewerkt', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async (noteId: string) => {
    const confirmed = await confirm({
      title: 'Notitie verwijderen',
      message: 'Weet u zeker dat u deze notitie wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(noteId);
      showToast('Notitie verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* New note link + composer */}
      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsComposerOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nieuwe notitie
          </button>
        </div>

        {isComposerOpen && (
          <div className="space-y-2">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Notitie toevoegen..."
              rows={3}
              autoFocus
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setIsComposerOpen(false); setNewContent(''); }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuleren
              </button>
              <button
                onClick={handleCreateNote}
                disabled={!newContent.trim() || createMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending && <Spinner size="sm" />}
                Toevoegen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400">Nog geen notities</p>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="space-y-3">
              {/* Root note (or edit form) */}
              {editingNote?.id === note.id ? (
                <div className="space-y-2 rounded-lg border border-primary-200 bg-primary-50 p-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editContent.trim() || updateMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {updateMutation.isPending && <Spinner size="sm" />}
                      Opslaan
                    </button>
                    <button
                      onClick={() => { setEditingNote(null); setEditContent(''); }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : (
                <NoteItem
                  note={note}
                  currentUserId={user.id}
                  currentUserRoles={user.roles}
                  onReply={(id) => { setReplyingTo(id); setReplyContent(''); }}
                  onEdit={handleStartEdit}
                  onDelete={handleDelete}
                />
              )}

              {/* Replies */}
              {note.replies && note.replies.length > 0 && (
                <div className="space-y-3">
                  {note.replies.map((reply) => (
                    editingNote?.id === reply.id ? (
                      <div key={reply.id} className="ml-8 space-y-2 rounded-lg border border-primary-200 bg-primary-50 p-3">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={!editContent.trim() || updateMutation.isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {updateMutation.isPending && <Spinner size="sm" />}
                            Opslaan
                          </button>
                          <button
                            onClick={() => { setEditingNote(null); setEditContent(''); }}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Annuleren
                          </button>
                        </div>
                      </div>
                    ) : (
                      <NoteItem
                        key={reply.id}
                        note={reply}
                        currentUserId={user.id}
                        currentUserRoles={user.roles}
                        onEdit={handleStartEdit}
                        onDelete={handleDelete}
                        isReply
                      />
                    )
                  ))}
                </div>
              )}

              {/* Reply composer */}
              {replyingTo === note.id && (
                <div className="ml-8 space-y-2 border-l-2 border-primary-200 pl-4">
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Antwoord schrijven..."
                    rows={2}
                    autoFocus
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReply(note.id)}
                      disabled={!replyContent.trim() || createMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {createMutation.isPending && <Spinner size="sm" />}
                      Antwoord versturen
                    </button>
                    <button
                      onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
