'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { createClient } from '@/lib/supabase/client';
import Badge from '@/components/ui/Badge';
import ContactDrawer, { type Contact } from '@/components/contacts/ContactDrawer';
import AddContactModal from '@/components/contacts/AddContactModal';
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
} from '@/lib/constants';

type StageKey = (typeof PIPELINE_STAGES)[number];
type BoardState = Record<StageKey, Contact[]>;

const badgeColorMap: Record<string, 'blue' | 'yellow' | 'purple' | 'teal' | 'green' | 'red'> = {
  blue: 'blue',
  yellow: 'yellow',
  purple: 'purple',
  teal: 'teal',
  green: 'green',
  red: 'red',
};

function emptyBoard(): BoardState {
  return Object.fromEntries(PIPELINE_STAGES.map((s) => [s, []])) as unknown as BoardState;
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function PipelinePage() {
  const [board, setBoard] = useState<BoardState>(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [stageEntryMap, setStageEntryMap] = useState<Record<string, string>>({});
  const [showAddContact, setShowAddContact] = useState(false);

  // Fetch contacts on mount
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to load contacts:', error);
        setLoading(false);
        return;
      }

      // Fetch most recent pipeline_events for each contact
      const { data: events } = await supabase
        .from('pipeline_events')
        .select('contact_id, changed_at')
        .order('changed_at', { ascending: false });

      // Build map of contact_id -> most recent changed_at
      const entryMap: Record<string, string> = {};
      if (events) {
        for (const ev of events) {
          if (!entryMap[ev.contact_id]) {
            entryMap[ev.contact_id] = ev.changed_at;
          }
        }
      }
      setStageEntryMap(entryMap);

      const grouped = emptyBoard();
      for (const contact of (data ?? []) as Contact[]) {
        const stage = contact.pipeline_stage as StageKey;
        if (grouped[stage]) {
          grouped[stage].push(contact);
        } else {
          // Fallback: put unknown stages in new_lead
          grouped.new_lead.push(contact);
        }
      }
      setBoard(grouped);
      setLoading(false);
    }
    load();
  }, []);

  const totalContacts = PIPELINE_STAGES.reduce(
    (sum, stage) => sum + board[stage].length,
    0,
  );

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination } = result;
      if (!destination) return;

      const fromStage = source.droppableId as StageKey;
      const toStage = destination.droppableId as StageKey;

      if (fromStage === toStage && source.index === destination.index) return;

      // Build new board state (optimistic)
      const newBoard = { ...board };
      const sourceCol = [...newBoard[fromStage]];
      const [moved] = sourceCol.splice(source.index, 1);

      if (fromStage === toStage) {
        sourceCol.splice(destination.index, 0, moved);
        newBoard[fromStage] = sourceCol;
      } else {
        const destCol = [...newBoard[toStage]];
        destCol.splice(destination.index, 0, { ...moved, pipeline_stage: toStage });
        newBoard[fromStage] = sourceCol;
        newBoard[toStage] = destCol;
      }
      setBoard(newBoard);

      // If stage actually changed, persist
      if (fromStage !== toStage) {
        const supabase = createClient();
        const now = new Date().toISOString();

        // Update contact
        supabase
          .from('contacts')
          .update({ pipeline_stage: toStage, updated_at: now })
          .eq('id', moved.id)
          .then(({ error }) => {
            if (error) console.error('Failed to update contact stage:', error);
          });

        // Insert pipeline event
        const {
          data: { user },
        } = await supabase.auth.getUser();

        supabase
          .from('pipeline_events')
          .insert({
            contact_id: moved.id,
            client_id: moved.client_id,
            from_stage: fromStage,
            to_stage: toStage,
            changed_at: now,
            changed_by: user?.id ?? null,
          })
          .then(({ error }) => {
            if (error) console.error('Failed to insert pipeline event:', error);
          });

        // Fire pixel event (fire and forget)
        fetch('/api/meta/send-pixel-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: moved.client_id,
            contact_id: moved.id,
            action: `stage_${toStage}`,
            contact: moved,
          }),
        }).catch(() => {
          // Intentionally swallowed
        });
      }
    },
    [board],
  );

  const handleContactUpdate = useCallback(
    (updated: Contact) => {
      setBoard((prev) => {
        const next = { ...prev };
        for (const stage of PIPELINE_STAGES) {
          next[stage] = next[stage].map((c) => (c.id === updated.id ? updated : c));
        }
        return next;
      });
      setSelectedContact(updated);
    },
    [],
  );

  const handleQualityShortcut = async (quality: string) => {
    if (!selectedContact) return;
    const supabase = createClient();
    await supabase.from('contacts').update({ lead_quality: quality }).eq('id', selectedContact.id);
    const updated = { ...selectedContact, lead_quality: quality };
    handleContactUpdate(updated);

    fetch('/api/meta/send-pixel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: selectedContact.client_id,
        contact_id: selectedContact.id,
        action: quality === 'good' ? 'quality_good' : 'quality_bad',
        contact: updated,
      }),
    }).catch(() => {});
  };

  const handleStageShortcut = async (newStage: string) => {
    if (!selectedContact || selectedContact.pipeline_stage === newStage) return;
    const supabase = createClient();
    const now = new Date().toISOString();
    const fromStage = selectedContact.pipeline_stage;

    await supabase.from('contacts').update({ pipeline_stage: newStage, updated_at: now }).eq('id', selectedContact.id);

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('pipeline_events').insert({
      contact_id: selectedContact.id,
      client_id: selectedContact.client_id,
      from_stage: fromStage,
      to_stage: newStage,
      changed_at: now,
      changed_by: user?.id ?? null,
    });

    fetch('/api/meta/send-pixel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: selectedContact.client_id,
        contact_id: selectedContact.id,
        action: `stage_${newStage}`,
        contact: selectedContact,
      }),
    }).catch(() => {});

    // Update board state
    const updated = { ...selectedContact, pipeline_stage: newStage };
    setBoard(prev => {
      const next = { ...prev };
      next[fromStage as StageKey] = next[fromStage as StageKey].filter(c => c.id !== selectedContact.id);
      next[newStage as StageKey] = [...next[newStage as StageKey], updated];
      return next;
    });
    setSelectedContact(updated);
  };

  // Keyboard shortcuts when drawer is open
  useEffect(() => {
    if (!selectedContact) return;
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in a textarea/input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

      const stageMap: Record<string, string> = {
        '1': 'new_lead', '2': 'contacted', '3': 'qualified',
        '4': 'booked', '5': 'won', '6': 'lost',
      };

      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        handleQualityShortcut('good');
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleQualityShortcut('bad');
      } else if (stageMap[e.key]) {
        e.preventDefault();
        handleStageShortcut(stageMap[e.key]);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        // Focus the notes textarea in the drawer
        const textarea = document.querySelector('textarea[placeholder*="notes"]') as HTMLTextAreaElement;
        if (textarea) textarea.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedContact]);

  // Loading state
  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold font-heading text-text-primary">Pipeline</h1>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-dark-border border-t-gold" />
            <p className="text-sm text-text-muted">Loading contacts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <h1 className="text-2xl font-bold font-heading text-text-primary">Pipeline</h1>
        <Badge label={`${totalContacts} contact${totalContacts !== 1 ? 's' : ''}`} color="gray" />
        <button
          onClick={() => setShowAddContact(true)}
          className="ml-auto px-3 py-1.5 bg-gold text-dark font-bold text-sm rounded-lg hover:bg-gold-hover transition-all duration-200"
        >
          + Add Contact
        </button>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col md:flex-row md:overflow-x-auto gap-4 flex-1 min-h-0">
          {PIPELINE_STAGES.map((stage) => {
            const contacts = board[stage];
            const color = badgeColorMap[PIPELINE_STAGE_COLORS[stage]] ?? 'blue';

            return (
              <div
                key={stage}
                className="min-w-[280px] bg-dark-card border border-dark-border rounded-xl p-4 flex flex-col md:max-h-full shadow-gold-sm"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h2 className="text-sm font-semibold text-gold">
                    {PIPELINE_STAGE_LABELS[stage]}
                  </h2>
                  <Badge label={String(contacts.length)} color={color} />
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={stage}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 overflow-y-auto space-y-2 min-h-[60px] rounded-lg transition-colors ${
                        snapshot.isDraggingOver ? 'bg-gold/10' : ''
                      }`}
                    >
                      {contacts.map((contact, index) => (
                        <Draggable
                          key={contact.id}
                          draggableId={contact.id}
                          index={index}
                        >
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => setSelectedContact(contact)}
                              className={`bg-dark-elevated rounded-lg p-3 border border-dark-border hover:shadow-gold-md transition-all duration-200 cursor-pointer ${
                                dragSnapshot.isDragging ? 'shadow-gold-md ring-2 ring-gold/40' : ''
                              }`}
                            >
                              <p className="text-sm font-medium text-text-primary truncate">
                                {contact.first_name} {contact.last_name}
                              </p>
                              {contact.phone && (
                                <p className="text-xs text-text-secondary mt-1 truncate">
                                  {contact.phone}
                                </p>
                              )}
                              {contact.source_ad_name && (
                                <p className="text-xs text-text-muted mt-1 truncate">
                                  {contact.source_ad_name}
                                </p>
                              )}
                              <p className="text-xs text-text-muted mt-1">
                                {formatShortDate(contact.created_at)}
                              </p>
                              {/* Time-in-stage badge */}
                              {(() => {
                                const entryDate = stageEntryMap[contact.id];
                                if (!entryDate) return null;
                                const days = Math.floor((Date.now() - new Date(entryDate).getTime()) / (1000 * 60 * 60 * 24));
                                if (days < 3) return null;
                                const color = days >= 7 ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning';
                                return (
                                  <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${color}`}>
                                    {days}d
                                  </span>
                                );
                              })()}
                              {/* Lead score badge */}
                              {contact.lead_score != null && (
                                <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  contact.lead_score >= 70 ? 'bg-success/20 text-success' :
                                  contact.lead_score >= 40 ? 'bg-warning/20 text-warning' :
                                  'bg-dark-elevated text-text-muted'
                                }`}>
                                  Score: {contact.lead_score}
                                </span>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Contact Drawer */}
      {selectedContact && (
        <ContactDrawer
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdate={handleContactUpdate}
        />
      )}

      <AddContactModal
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        onCreated={() => window.location.reload()}
      />
    </div>
  );
}
