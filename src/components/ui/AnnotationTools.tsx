'use client';

import { useMemo, useState } from 'react';
import type { UserAnnotationEntityType } from '../../types/models';
import { useAppAnnotations } from '../../state/AppProvider';
import { Icon } from './Icon';

export function AnnotationTools({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: UserAnnotationEntityType;
  entityId: string;
  compact?: boolean;
}) {
  const { userAnnotations, upsertAnnotation, deleteAnnotation } = useAppAnnotations();
  const bookmark = useMemo(
    () =>
      userAnnotations.find(
        item =>
          item.entityType === entityType &&
          item.entityId === entityId &&
          item.annotationType === 'bookmark',
      ),
    [entityId, entityType, userAnnotations],
  );
  const note = useMemo(
    () =>
      userAnnotations.find(
        item =>
          item.entityType === entityType &&
          item.entityId === entityId &&
          item.annotationType === 'note',
      ),
    [entityId, entityType, userAnnotations],
  );
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note?.text ?? '');

  async function toggleBookmark() {
    if (bookmark) await deleteAnnotation(entityType, entityId, 'bookmark');
    else {
      await upsertAnnotation({
        entityType,
        entityId,
        annotationType: 'bookmark',
        text: '',
      });
    }
  }

  async function saveNote() {
    const value = text.trim();
    if (!value) await deleteAnnotation(entityType, entityId, 'note');
    else {
      await upsertAnnotation({
        entityType,
        entityId,
        annotationType: 'note',
        text: value,
      });
    }
    setOpen(false);
  }

  return (
    <div className={`annotation-tools ${compact ? 'annotation-tools--compact' : ''}`}>
      <button
        className={`icon-button ${bookmark ? 'is-active' : ''}`}
        onClick={() => void toggleBookmark()}
        aria-label="Lesezeichen"
      >
        <Icon name="bookmark" size={18} />
      </button>
      <button
        className={`icon-button ${note ? 'is-active' : ''}`}
        onClick={() => {
          setText(note?.text ?? '');
          setOpen(value => !value);
        }}
        aria-label="Notiz"
      >
        <Icon name="pen" size={18} />
      </button>
      {open && (
        <div className="annotation-popover">
          <textarea value={text} onChange={event => setText(event.target.value)} placeholder="Notiz zur Stelle" />
          <div>
            <button className="button button--ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
            <button className="button button--primary" onClick={() => void saveNote()}>
              Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
